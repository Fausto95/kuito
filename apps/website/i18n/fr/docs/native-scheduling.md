# Ordonnancement natif et lot hôte

Hermes appelle le C++ dans le même processus via JSI ; il n'y a pas de pont
sérialisé. Chaque job JS (une évaluation, un événement, un timer, une fin de
requête réseau, un rappel de module) envoie à la plateforme au plus un lot de
mutations de vues typées, et la plateforme applique les lots dans l'ordre sur
son thread UI.

## Threads

- Android : un seul `HandlerThread("KuitoHermes")` crée, exécute et détruit le
  runtime Hermes. Le looper principal possède chaque View. Les timers et les
  fins de requête OkHttp sont repostés sur le thread Hermes.
- iOS : une seule file série `dev.kuito.hermes` possède le runtime, les
  évaluations, les événements, les timers et les fins de requête URLSession.
  Les lots vont sur la file principale.
- Le runtime du thread UI (docs/motion.md) s'exécute sur le thread UI de la
  plateforme, à côté des vues ; les props qu'il écrit sont appliquées avant que
  son point d'entrée ne retourne.

## Le lot : un appel par job

Le noyau écrit chaque mutation de vue d'un job sous forme d'enregistrement
dans un seul `ArrayBuffer` (`src/runtime/wire.ts`) et l'envoie en un seul
appel, `__kuitoHostCommit(buffer, byteLength, strings)`. Le C++ le décode une
fois en `Mutation`s typées (`native/shared/Wire.h`, `Mutation.h`).

Les enregistrements sont en little-endian et compactés ; les chaînes voyagent
à côté du buffer et un enregistrement les désigne par index :

| Op           | Champs                                                              |
| ------------ | ------------------------------------------------------------------- |
| 1 `Create`   | `u32 id`, `u32 parent` (0 : la racine), genre, libellé, `u8` aplati |
| 2 `Remove`   | `u32 id`                                                            |
| 3 `Move`     | `u32 id`, `u32 parent`, `u32 index`                                 |
| 4 `Flatten`  | `u32 id`, `u8` aplati                                               |
| 5 `Prop`     | `u32 id`, `u16 key` (0xffff : un nom suit), valeur                  |
| 6 `Command`  | `u32 id` (0 : l'application), nom, argument                         |
| 7 `UI`       | un tableau JSON d'opérations du thread UI                           |
| 8 `UIScript` | source, url                                                         |

Une valeur est un tag et sa charge utile : null, un nombre `f64`, false, true,
du texte, du texte JSON, ou un diff de clés. Un diff de clés est un compteur
`u32`, puis chaque modification sous forme d'un op `u8` (insertion,
suppression, déplacement), d'un index `u32` et de la clé : les clés d'une
liste comme modifications des clés envoyées auparavant (docs/lists.md#keys).
Seule une prop du type `keys` du manifeste en accepte un, et une telle prop
n'accepte rien d'autre que null.

Une clé de prop est l'index de la prop dans `src/protocol/manifest.ts`
(`native/shared/PropKeys.generated.h`, le `PROP_KEYS` du noyau) ; la prop
propre d'une vue de module est désignée par son nom. Les vues sont des numéros
que le noyau distribue et ne réutilise jamais ; le libellé (l'`id` de
l'application, ou le chemin du noyau) ne traverse qu'une fois, avec la
création, pour les messages d'erreur et pour qu'une liste adopte la cellule
qu'elle a demandée.

Le C++ type chaque valeur selon le genre de sa prop dans le manifeste : une
couleur arrive en texte hexadécimal et est analysée une fois en `0xRRGGBBAA`,
un enum devient son index parmi les valeurs du manifeste, un nombre doit être
un nombre. Une valeur du mauvais genre rejette le lot, en nommant la prop.

Quand le lot part :

- Un commit (`src/runtime/transaction.ts`) envoie ses enregistrements seuls,
  quand son travail se termine : un lot que l'hôte rejette est exactement le
  commit que le noyau annule.
- Les autres écritures (la nouvelle valeur d'une liaison, le `setProperty`
  d'un élément, une commande) attendent la fin de la portée qui les entoure,
  le dispatch d'un événement natif, et partent immédiatement en dehors de
  toute portée.
- Les opérations du thread UI partent avec le lot suivant, après les vues
  qu'elles désignent ; sans lot à venir, à la fin de la tâche.

## La table des vues

`native/shared/ViewTable.{h,cpp}` contient `id → { kind, label, parent }`
pour chaque vue que les lots ont construite, et vérifie chaque lot contre elle
avant que quoi que ce soit n'atteigne la plateforme. Elle rejette, en entier :

- une création d'un id qui existe,
- une insertion (une création ou un déplacement) sous un parent qui n'existe
  pas,
- une suppression d'un parent avant ses enfants,
- une écriture ou une commande vers une vue qui a disparu.

Un lot rejeté lève une exception dans l'appel `__kuitoHostCommit` du noyau,
où le journal du commit annule le côté noyau. Les lots acceptés du job
rejoignent la `MutationQueue` du job ; un job qui lève une exception plus tard
les abandonne et la table les reprend, de sorte que la table et la plateforme
ne voient jamais un demi-job.

`MutationQueue` conserve les enregistrements structurels dans l'ordre et
seulement la dernière écriture par prop à l'intérieur de chaque segment
délimité (les créations, suppressions, aplatissements, commandes et
enregistrements UI délimitent ; les déplacements non), à la position de cette
dernière écriture. Un diff de clés modifie ce qui l'a précédé, donc il n'est
jamais abandonné et aucune écriture de sa prop ne fusionne à travers lui.

## Les plateformes

- iOS : le pont remet à Swift les mutations du job sous forme d'un tableau C
  de `KuitoMutationRecord` (`native/ios/Renderer/KuitoMutationRecord.h`),
  une vue sur les `Mutation`s C++ lues en place ; `KuitoUIKitRenderer.apply(_:)`
  exécute chacune d'elles. Swift n'importe pas les types C++ eux-mêmes : cela
  ferait basculer chaque cible Swift vers l'interopérabilité C++ pour une seule
  struct.
- Android : un seul appel JNI par lot avec des tableaux primitifs parallèles
  (op, genre de valeur, clé, id, parent, un entier, un nombre, texte, nom, et
  les modifications d'un diff de clés), lus par `KuitoMutations` ;
  `KuitoAndroidRenderer.apply` exécute chaque enregistrement.
- Les renderers indexent leurs vues par numéro et conservent une seule map,
  id → le style de la vue ; le parent d'une vue est sur son style. Ce n'est
  pas toujours le parent de son nœud de layout : une page, une sheet ou une
  ligne de liste est une racine de layout à part entière, donc l'arbre de
  layout seul ne peut pas être la hiérarchie. Les setters reçoivent une
  `KuitoValue` typée et n'analysent aucun scalaire ; les props propres d'une
  vue de module natif se décodent en `untyped`, la valeur comme scalaire
  (docs/native-modules.md#views).

## La frame

Les lots traversent vers le thread UI en un seul endroit,
`native/shared/FrameHandoff.h`, que les deux runtimes partagent. Le thread JS
pousse le lot de chaque job ; le premier qu'un handoff inactif reçoit demande
à la plateforme une frame d'affichage (un `CADisplayLink` sur iOS,
`Choreographer` sur Android), le seul rappel de frame que l'un ou l'autre
shell possède.

Sur cette frame, `UIRuntime::drain(now, budget)` applique les lots en attente
dans l'ordre pendant jusqu'à ~4 ms, au moins un quel qu'en soit le coût,
chacun via le renderer de la plateforme (dont les enregistrements `ui` et
`ui-script` retournent au runtime UI, dans l'ordre). Puis il exécute la frame
du noyau UI, après les lots, pour que motion voie les vues qu'ils ont créées.
Il demande une autre frame tant que des lots attendent ou que quelque chose
s'anime. Un lot poussé pendant le drainage attend la frame suivante.

Une frame qui se termine avec des lots qu'elle devait appliquer marque le
handoff comme occupé : le thread UI est en retard. Le noyau le lit via
`__kuitoHostBusy()` et retient ses replanifications structurelles entre-temps,
puisque leurs lots ne feraient que s'empiler derrière ceux pas encore
appliqués. Les écritures partent toujours immédiatement. Le drainage qui
rattrape le retard envoie l'événement d'application `host.idle`
(docs/events.md), et chaque replanification qui a attendu s'exécute une fois,
pour toutes les écritures qui l'ont précédée.

## Événements

Les événements natifs traversent dans l'autre sens sous forme de
`(handle, event, payload)` : le numéro de la vue (0 pour l'application), le
nom de l'événement et sa charge utile JSON (docs/events.md).

## Vérification

`test/native-batch.cpp` (exécuté par `npm test`) décode des enregistrements
de chaque genre, rejette ceux qui sont malformés et les valeurs du mauvais
genre, et vérifie les rejets de la table, son rollback de lot entier, la
coalescence de la file et le budget et le drapeau d'occupation du handoff de
frame. `test/incremental.test.ts` vérifie que les replanifications attendent
pendant que l'hôte est occupé et s'exécutent une fois sur `host.idle`.
`test/native-batch.test.ts` vérifie le côté noyau : un seul appel hôte pour un
premier rendu et pour un événement, des valeurs typées, des opérations UI
après les vues qu'elles désignent, et un lot rejeté annulé dans le noyau.
