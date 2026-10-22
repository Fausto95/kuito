# Devtools

Les builds de développement des shells Kuito incluent des devtools. Ils ne gênent
pas votre app : il n'y a pas de bouton flottant.

## Les ouvrir

| Où                   | Comment                                           |
| -------------------- | ------------------------------------------------- |
| Simulateur iOS       | ⌘D                                                |
| Émulateur Android    | ⌘M / Ctrl+M, ou la touche menu                    |
| Un appareil physique | Le secouer                                        |
| La CLI `kuito dev`   | Appuyer sur `m` (fonctionne pour chaque appareil) |

Ils s'ouvrent sous forme de feuille native avec :

- **Connexion.** Si l'app est connectée au serveur de dev, et la
  raison et le compte à rebours pendant qu'elle se reconnecte.
- **Reload / Reconnect.** Reload redémarre votre app dans un runtime Hermes neuf
  avec la source la plus récente ; Reconnect rouvre le lien de dev.
- **Live Patch.** Les dernières mises à jour et le temps que chacune a mis à s'appliquer.
- **Dernière erreur.** Les erreurs de patch, de rendu et d'événement, jusqu'à effacement. La
  [LogBox](logbox.md) montre chacune en entier, avec sa source.
- **Moniteurs** (mémorisés d'un lancement à l'autre) :
  - **Moniteur de performance** : FPS du thread UI, la durée de la dernière frame, les frames
    perdues, et une courbe des FPS sur les 15 dernières secondes face à la cible
    de l'écran. Sa dernière ligne est celle des commits de Kuito : analyses de props par commit et la
    dernière latence touché-à-appliqué avec son p95 ([performance](performance.md#native-counters)).
    Déplacez-le n'importe où ; il se cale dans le coin le plus proche.
  - **Surligner les mises à jour** : comme react-scan, chaque vue que le moteur de rendu met à jour
    clignote — vert, puis ambre, puis rouge à mesure que la même vue continue d'être mise à jour
    en l'espace d'une seconde, avec un compteur ×N. Du rouge constant signifie que quelque chose se re-rend
    plus qu'il ne devrait. Sous chaque clignotement, l'écriture de signal qui l'a causé
    (`visits = 2`) : l'écriture dont le binding a défini la prop, ou dont la branche
    a été replanifiée. Une mise à jour qu'aucune écriture n'a causée (un Live Patch, un événement natif que la
    vue a signalé) n'a pas d'étiquette.

  Les deux moniteurs redessinent eux-mêmes la fenêtre, ils coûtent donc un peu de temps de frame
  à eux seuls ; [performance](performance.md) mesure avec eux désactivés.

- **Serveur de dev.** L'URL WebSocket, modifiable.

## Pendant que votre app charge

Un écran de démarrage indique ce que le shell attend — Hermes, le serveur de dev,
la première frame de votre app — et s'estompe à la première frame. Ensuite, une pastille
sous la barre d'état signale Live Patch (`Updated in 18 ms`), les échecs (toucher pour
ouvrir les devtools) et un serveur de dev perdu jusqu'à son retour (`Reconnected`).
Les avertissements et erreurs que votre app journalise ou lève se rassemblent dans la
[LogBox](logbox.md).

## Le lien de dev

Le shell se reconnecte de lui-même : il pingue le serveur de dev pour détecter un lien mort
et réessaie avec un backoff (0,5 s jusqu'à 5 s) jusqu'au retour du serveur, un
`kuito dev` redémarré ne requiert donc aucune action sur l'appareil. Un patch que l'appareil a
déjà appliqué n'est pas appliqué de nouveau quand le serveur le rejoue.

Le lien transporte des messages JSON identifiés par `type`, déclarés une fois dans
`src/protocol/dev-link.ts` ; `npm run generate` les écrit dans
`KuitoDevLink.generated` en Swift et en Kotlin, et le `handle()` de chaque shell
fait un switch sur l'enum générée, un nouveau message échoue donc à compiler tant que les deux
ne le traitent pas. Le serveur envoie `patch` (la source d'une révision), `command` et
`symbolicated` ; un shell envoie `hello` (son id, son nom et sa plateforme), `log`,
`open`, et un accusé pour chaque patch qu'il reçoit : `applied` (la révision et
le temps qu'a pris son évaluation) ou `rejected` (la révision, un code tel que
`EVALUATION`, et le message). Le serveur valide chaque message contre la
même table et signale un message mal formé avec sa raison.

## Déboguer avec Chrome DevTools

Les builds de développement rendent les deux runtimes Hermes de l'app débogables via le
Chrome DevTools Protocol, de la manière dont React Native DevTools débogue Hermes :

| Cible     | Ce qui y tourne                                                                   |
| --------- | --------------------------------------------------------------------------------- |
| Thread JS | Votre app et le noyau Kuito (`src/runtime`)                                       |
| Thread UI | Les valeurs de motion, les gestes et les callbacks du thread UI (`src/ui-thread`) |

Appuyez sur `j` dans `kuito dev` pour ouvrir DevTools sur le thread JS de l'appareil qui
s'est connecté en dernier, ou sur `u` pour son thread UI (`k` ouvre le
[panneau Components](#components)). Vous obtenez le frontend de Chrome lui-même :

- **Sources** : votre TypeScript, via les source maps du compilateur.
  Les points d'arrêt, le pas à pas, les portées, les expressions espionnées et les instructions `debugger;`
  fonctionnent tous. Live Patch continue de fonctionner pendant que DevTools est attaché ;
  chaque patch apparaît comme un nouveau script.
- **Console** : la sortie de `console.*` avec les objets journalisés eux-mêmes, liés
  à la ligne qui les a journalisés, et l'évaluation dans la frame en pause ou dans la
  portée globale. Les entrées journalisées avant l'ouverture de DevTools sont conservées (les 1000
  dernières).
- **Performance** : enregistrer un profil CPU.
- **Memory** : prendre un instantané du tas.

DevTools s'ouvre dans un navigateur qui lui est propre : le premier navigateur basé sur Chromium
installé (Chrome, Chrome Canary, Chromium, Edge, Brave), démarré avec un
profil dédié dans `.kuito/devtools-browser` et un port de débogage sur
loopback. Définissez `KUITO_DEVTOOLS_BROWSER` sur un exécutable Chromium pour en choisir
un autre. Chromium refuse d'ouvrir des URL `devtools://` depuis l'extérieur, aussi
Kuito ouvre le même frontend embarqué tel que ce navigateur le sert sur son
port de débogage : rien n'est téléchargé, et le frontend correspond toujours au
navigateur.

Tout autre client CDP fonctionne aussi. `kuito dev` liste les cibles à
`http://127.0.0.1:8765/json/list`, comme le fait Chrome, si bien que `chrome://inspect`
les trouve une fois `127.0.0.1:8765` ajouté sous _Discover network targets_,
et les éditeurs qui déboguent Node s'attachent à leur `webSocketDebuggerUrl`.

### Components

Appuyez sur `k` dans `kuito dev` pour le panneau Components. Il montre le modèle propre à Kuito
de l'app, **signal → binding → vue**, pour l'appareil qui s'est connecté en
dernier, dans le même navigateur que DevTools.

- **Arbre.** Chaque instance de composant montée, nommée comme vous l'avez déclarée, avec
  sa `key` de liste. Il suit l'app à mesure que les composants se montent et se démontent.
  Survoler un composant encadre les vues qu'il a rendues sur l'appareil.
- **Composant.** Ses props telles qu'il les lit, ses hooks par nom, les
  composants qui le rendent (owners), et les vues natives qu'il a rendues.
  Le compilateur transmet à chaque `signal()` la variable sous laquelle il est déclaré, si bien que
  `const visits = signal(1)` s'affiche comme `visits` ; un hook qu'il n'a pas vu affiche
  son ordinal (`state 1`). `task()` et `resource()` indiquent s'ils sont
  en cours, leurs données et leur erreur ; les valeurs `motion()` affichent leur dernière
  valeur ; les refs affichent ce qu'elles contiennent.
- **Vue.** Sélectionner une vue, depuis un composant ou avec **Select on device**
  (puis toucher la vue), affiche chacune de ses props avec le binding derrière :
  les signaux que sa dernière exécution a lus, chacun avec sa valeur et le composant
  qui le possède. Une prop sans binding est une constante. Une prop mise à jour
  pendant que le panneau était ouvert affiche l'écriture de signal qui l'a causée.
- **Signal.** Sélectionner un signal affiche ce qu'il pilote : chaque prop dont le
  binding le lit, et chaque branche qu'il décide (un `Show`, un `Switch` de flux,
  une expression enfant réactive, ou la structure entière d'un module). Les signaux créés
  hors d'un composant, et les computeds, s'affichent par type et numéro.
- **Édition.** Les valeurs sont du JSON ; Entrée en définit une. Une valeur d'état ou un signal
  prend l'édition comme si votre code avait écrit `.value`, les bindings et la
  structure suivent donc. Une valeur `motion()` se déplace vers l'édition. La prop d'une vue
  prend l'édition sur la vue native jusqu'à ce que son binding l'écrive de nouveau.
  Les computeds sont en lecture seule.

- **Historique.** L'Historique du panneau liste les 500 dernières écritures des
  signaux que possèdent les composants (`signal()` dans un composant), la plus récente en premier, avec le composant qui possède
  chacun. **Step back here** redémarre l'app dans un runtime neuf et rejoue
  les écritures jusqu'à celle-là, dans l'ordre : chacune atterrit une fois que son composant est
  monté et que les replanifications de l'écriture précédente ont été exécutées, l'app
  atteint donc ce point comme elle l'a fait la première fois. Les écritures plus anciennes que les
  500 dernières ne sont plus conservées, et un retour en arrière commence alors après elles.
  Seules les valeurs JSON se rejouent ; une écriture d'une fonction ou d'une instance de classe est listée
  comme non rejouable. Ce que l'app fait d'elle-même dans le runtime neuf se produit
  quand même (un `resource()` refait sa requête, les timers tournent), et l'état natif tel
  qu'un décalage de défilement repart de zéro. Les écritures des tâches, des valeurs de motion et des refs ne sont pas
  listées : elles proviennent de ce que ces hooks exécutent.

Le graphe est lu depuis le store du noyau quand le panneau le demande (la
sélection se rafraîchit chaque seconde tant que le panneau est ouvert), il ne coûte donc rien
à l'app tant que personne ne regarde. Le panneau dialogue avec un petit backend dans le
noyau (`src/runtime/devtools.ts`, son graphe dans `devtools-graph.ts`) ; les
messages sont typés une fois dans `src/runtime/devtools-protocol.ts` et transitent par la
socket d'appareil de l'inspecteur sous forme de frames `panel` à côté de CDP, le panneau et une
fenêtre DevTools déboguent donc le même runtime côte à côte. Un message que le noyau
ne peut pas accepter est refusé avec sa raison, affichée dans l'en-tête du panneau. Après un
rechargement, le nouveau runtime salue le panneau, qui recommence avec son arbre.

Pas encore pris en charge : éditer les props d'un composant (éditez plutôt la prop de la vue ou
le signal derrière elle), les sources propres d'un computed, et afficher la source d'un
composant.

### Enregistrement et relecture

Les builds de développement enregistrent chaque lot que le runtime de l'app commite, tel que le
noyau l'a écrit (le lot hôte typé de l'[ordonnancement natif](native-scheduling.md)),
dès le démarrage du runtime. Un job qui lève perd ses lots sur
l'appareil comme dans l'enregistrement.

Appuyez sur `s` dans `kuito dev` (ou envoyez `record` à une session non interactive) pour
sauvegarder l'enregistrement de chaque appareil connecté dans
`.kuito/recordings/<time>-<device>.krec`, avec l'arbre de vues natif qu'il a construit
à côté, sous `<file>.tree` : une ligne par vue, dans l'ordre des ids, avec son type, son
parent, le cadre que le moteur de layout lui a donné, et le texte d'une vue texte. Une ligne
de liste s'affiche sans son cadre : la plateforme dispose une ligne quand sa liste
l'affiche, ce qui suit le défilement propre à la liste plutôt que les lots.

```bash
kuito replay .kuito/recordings/20261019-014618-p17-iphone-18-pro.krec ios
```

`kuito replay` construit et lance le shell comme le fait `kuito dev`, mais le
shell ne démarre ni app ni runtime Hermes : le serveur de dev lui envoie
l'enregistrement, et il applique les lots via le même pipeline de frames, au
rythme où ils ont été enregistrés. Quand le dernier est à l'écran, le shell
décrit son arbre de vues, la CLI le sauvegarde sous `<file>.replayed`, et indique
s'il correspond au `.tree` enregistré ou la première ligne où il diffère.

Ce qu'une relecture ne reproduit pas :

- **Le code du thread UI.** Les valeurs de motion, les gestes et les animations tournent dans le runtime
  UI, qu'une relecture ne démarre pas ; leurs enregistrements sont laissés de côté.
- **L'état natif.** Les décalages de défilement, le texte saisi dans les champs et tout autre état que la
  plateforme possède ne sont pas dans les lots ; les événements natifs auxquels l'app a
  répondu non plus. L'arbre compare le layout, pas la position de défilement d'une scroll view.
- **La taille.** Un enregistrement s'arrête à 32 Mo, et le dit (la CLI note
  "stopped at its size limit") ; il se rejoue quand même depuis le début.

Un fichier `.krec` est en little-endian : `KREC`, une version (2), un indicateur de troncature, puis
pour chaque lot les millisecondes depuis le démarrage du runtime, les octets du lot
et ses chaînes (`native/shared/Recording.h`). Les props passent par leur numéro
dans le manifeste, un enregistrement se rejoue donc sur un shell construit à partir du même
Kuito, sur la plateforme qui l'a enregistré ; son arbre est celui de cette plateforme.

### En pause

Mettre en pause arrête un thread ; le reste de l'app continue autant qu'il le peut :

- **Thread JS** : l'UI reste réactive et les animations sur le thread UI
  continuent de tourner. Les événements, les timers et les Live Patches s'empilent et s'exécutent après
  la reprise.
- **Thread UI** : l'écran se fige jusqu'à la reprise, puisque c'est le thread UI de la
  plateforme qui est arrêté. Sur Android, une saisie pendant une longue pause peut faire
  apparaître la boîte de dialogue système _App isn't responding_ ; choisissez _Wait_.

Le lien de dev reste actif dans les deux cas : ses pings reçoivent une réponse hors du thread
en pause, le shell ne se reconnecte donc pas pendant que vous avancez pas à pas.

### Fonctionnement

Chaque runtime reçoit l'agent CDP propre à Hermes (`hermes/cdp`), Kuito ne parle donc pas
CDP lui-même. Le shell ouvre une seconde socket vers le serveur de dev,
`/inspector/device`, sur un thread qui lui est propre : les commandes atteignent un runtime même
pendant que le thread de ce runtime est en pause sur un point d'arrêt. Le serveur de dev
(`src/dev/inspector-proxy.ts`) relaie CDP entre cette socket et chaque
fenêtre DevTools, et ajoute une chose au passage : la source map de chaque Live Patch,
inline, pour que tout frontend fasse correspondre les scripts au TypeScript sans rien
télécharger.

Une session DevTools survit au runtime qu'elle débogue. Rechargez depuis le menu de dev,
ou faites quoi que ce soit d'autre qui fasse apparaître un nouveau runtime, et la session s'y déplace
avec ses points d'arrêt : DevTools efface les scripts de l'ancien runtime, comme lors d'une
navigation de page, et liste ceux du nouveau.

L'agent de Hermes ne conserve aucune source de script, le serveur de dev répond donc à DevTools
à sa place : chaque Live Patch, les noyaux, et le bundle du thread UI, que le
compilateur nomme d'après son contenu (`kuito://ui/<hash>`) et écrit à côté des
patchs. Sur iOS, le runtime JS tourne sur un thread qui lui est propre plutôt que sur une
dispatch queue, parce que le profileur CPU échantillonne le thread qui a enregistré
le runtime.

### Limites

- Les points d'arrêt dans un fichier que vous éditez sont abandonnés quand son Live Patch atterrit : le
  code du fichier a changé sous eux. Les points d'arrêt des autres fichiers sont conservés.
- Le code du thread UI s'affiche sous forme du JavaScript généré par le compilateur : son bundle n'a
  pas encore de source map.
- Le runtime headless qui exécute les tâches d'arrière-plan n'est pas débogable.
- Une seule fenêtre DevTools débogue un runtime à la fois : en ouvrir une autre ferme
  la première.
- Les builds release n'incluent rien de tout cela : l'inspecteur ne compile que dans les
  builds debug (`KUITO_INSPECTOR`), et le Hermes release d'Android n'a pas de
  débogueur.
