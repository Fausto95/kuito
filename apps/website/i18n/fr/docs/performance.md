# Performance

Comment mesurer la fréquence d'images de Kuito sur Android et le démarrage à froid sur les deux plateformes,
et ce que signifient les chiffres.

## Le benchmark de frames Android

`scripts/benchmark-android.ts` rejoue la démo Reel (`demo/app.tsx`) sur un
émulateur ou un appareil avec des gestes `input` exécutés sur l'appareil :

| Scénario   | Ce qu'il fait                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `launch`   | Démarrage à froid, puis le catalogue, les affiches et la mise en page, jusqu'à ce que l'app soit inactive |
| `sheet`    | Ouvre et ferme deux fois la Sheet de détails                                                              |
| `tabs`     | Search → Library → Lab → Discover, deux fois                                                              |
| `discover` | Balaie deux rails, fait défiler Discover vers le bas avec un balayage de rail par écran, puis remonte     |
| `library`  | Fait défiler Library sur six écrans vers le bas, puis remonte                                             |

Chaque run démarre l'app à froid. Chaque scénario commence une fois l'app inactive, c'est-à-dire
quand elle utilise moins d'un dixième de cœur pendant deux secondes. Une attente fixe ne
suffit pas : sur un émulateur lent, le premier contenu peut arriver une minute après le lancement.

### Le lancer

Démarrez le serveur de dev pour l'appareil, ce qui installe aussi l'app, et laissez-le tourner :

```bash
kuito dev android -d emulator-5554 --port 8766
```

Puis mesurez l'app installée :

```bash
node scripts/benchmark-android.ts --device emulator-5554 --port 8766 --runs 3 --label mine
```

Pour comparer deux builds, passez les deux APK. Ils alternent au sein de chaque run, de sorte que la charge
sur l'hôte (autres émulateurs, builds) retombe sur les deux de la même manière :

```bash
node scripts/benchmark-android.ts --runs 4 --build before=before.apk --build after=after.apk
```

Compilez un APK avec JDK 21 et Gradle 8, puis copiez
`native/android/app/build/outputs/apk/debug/app-debug.apk` de côté avant de compiler le suivant :

```bash
cd native/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) PATH=/opt/homebrew/opt/gradle@8/bin:$PATH gradle :app:assembleDebug
```

`--scenario discover` lance un seul scénario, et `--report` réimprime le résumé d'un run
antérieur à partir de ses traces enregistrées. Les coordonnées sont celles d'un écran 1080×2220 à
480 dpi (Pixel 3a).

Les résultats vont dans `dist/benchmarks/android/<label>/` : `results.json`, et un fichier texte atrace
par scénario et par run (environ 60 Mo chacun ; supprimez-les une fois terminé).
Ouvrez une trace dans [Perfetto](https://ui.perfetto.dev) pour la visualiser.

### Ce qu'il rapporte

Par scénario, la médiane sur les runs de :

- **Depuis `dumpsys gfxinfo`** : frames rendues, % de jank (frames qui ont manqué leur
  échéance), temps de frame p50/p90/p99. C'est ce que voit l'utilisateur, mais sur un
  émulateur c'est dominé par le GPU de l'hôte (voir plus bas).
- **Depuis le thread UI de la trace** : `uiSlowPercent` (frames dont le temps propre sur le thread
  principal dépasse 16,7 ms), `uiP90`, `uiMaxMs` (la frame la plus longue) et `uiTotalMs`.
  Le « temps propre » exclut `postAndWait`, l'attente du RenderThread. C'est le
  travail que le moteur de rendu de Kuito contrôle, et il est bien moins bruité.
- `startMs` (launch seulement) : le temps mesuré par `am start -W` jusqu'au premier dessin de l'activité,
  c'est-à-dire l'écran de démarrage.
- `contentMs` (launch seulement) : du premier événement tracé du processus à la fin
  de son plus grand `Kuito commit`. Sur Reel, c'est le catalogue : le temps qu'un utilisateur
  attend le contenu.
- `evaluateMs` (launch seulement) : le temps réel de chaque `Kuito evaluate`. Sur un seul
  cœur, c'est surtout de l'attente du cœur, pas Hermes qui s'exécute.
- `anrs` : rapports « Application Not Responding » pendant le scénario.

`results.json` conserve aussi les 40 plus grandes sections du thread principal de chaque run.

### Sections de trace

Le shell et le moteur de rendu marquent leur travail pour qu'une trace puisse l'attribuer :

| Section               | Thread    | Quoi                                                             |
| --------------------- | --------- | ---------------------------------------------------------------- |
| `Kuito commit <rows>` | principal | Application d'un lot de mutations venant de Hermes               |
| `Kuito layout`        | principal | Une passe du moteur flexbox sur la racine                        |
| `Kuito measureLeaf`   | principal | Le moteur demandant à Android de mesurer un texte ou un contrôle |
| `Kuito image ready`   | principal | Livraison d'une image décodée à ses vues                         |
| `Kuito image decode`  | worker    | Décodage des octets d'une image                                  |
| `Kuito evaluate`      | Hermes    | Exécution d'un script : le kernel, l'app, un patch               |
| `Kuito dispatch`      | Hermes    | Livraison d'un événement au JS                                   |
| `Kuito timer`         | Hermes    | Déclenchement d'un timer JS                                      |

Un nombre en suffixe est un détail : le benchmark additionne tous les `Kuito commit`.

## Démarrage à froid

Les deux shells démarrent depuis du bytecode Hermes (`docs/on-device-hermes.md`) :
le kernel et l'app arrivent compilés, donc Hermes ne les analyse ni ne les compile.
Sur l'émulateur Pixel 3a, cela a fait passer le temps propre de Hermes dans `Kuito evaluate`
d'environ 46 ms à 9 ms par lancement. `evaluateMs` reste bien au-dessus : sur un seul
cœur, le thread Hermes passe l'essentiel d'un evaluate à attendre pendant que le thread principal
dessine la première frame. Tout ce qui s'exécute d'autre pendant le démarrage, comme un
écran de démarrage animé, allonge cette attente. Ce bytecode est compilé
pour le débogage, non optimisé et avec toutes les informations de débogage, pour que Chrome DevTools puisse
afficher chaque portée ([devtools](devtools.md#debugging-with-chrome-devtools)).

`contentMs` inclut aussi la requête de Reel vers l'API TVMaze, qui varie de
plusieurs centaines de millisecondes d'un run à l'autre. Comparez des médianes sur plusieurs runs.

### iOS

`scripts/benchmark-ios.ts` mesure la même chronologie `launch` sur un simulateur
iOS. Le shell marque `Kuito evaluate` et `Kuito commit <mutations>` comme
signposts dans Points of Interest (`native/ios/App/KuitoTrace.swift`) ; le script
les lit depuis le `log stream` du simulateur, et chronomètre `contentMs` à partir du
premier événement de log du processus. Compilez et installez le shell (`kuito dev ios`), puis :

```bash
node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" --runs 7 --label mine
```

Sans `--port`, l'app démarre hors ligne, depuis son seul bytecode embarqué. Le
premier run après une installation paie les caches de fichiers froids ; comparez des médianes.
Les résultats vont dans `dist/benchmarks/ios-launch-<label>.json`. Les chiffres enregistrés vivent
dans `benchmarks/`.

## Compteurs du kernel

`__kuito.stats()` renvoie un instantané du travail accompli par le kernel, pour qu'un
test ou une session de débogage compare deux instantanés autour d'une interaction :

| Compteur                 | Compte                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `replans`                | Exécutions de `patch()` validées, premier plan de chaque module compris                                                                |
| `thunkEvaluations`       | Expressions suivies exécutées : les `when`, les expressions enfants, les props calculées                                               |
| `subscriptionsCreated`   | Abonnements à des signaux créés                                                                                                        |
| `subscriptionsDestroyed` | Abonnements à des signaux libérés                                                                                                      |
| `sendPropCalls`          | Props envoyées à l'hôte, y compris les animées et celles liées au thread UI                                                            |
| `bytesStringified`       | Longueur du JSON produit pour franchir la frontière de l'hôte (props, opérations du thread UI, arguments de modules natifs, commandes) |

`total` contient les cinq compteurs de travail depuis le chargement du kernel ; `lastReplan`
contient ce que le dernier `patch()` validé a fait, de l'enregistrement jusqu'à ses
montages. Un `patch()` qui lève une exception ne valide rien et laisse `lastReplan` tel
qu'il était. Les tests les lisent via `installKernel` (`test/support/kuito-host.ts`).

`held` compte ce que le kernel détient actuellement, magasin par magasin : les `states` des hooks,
les `motions`, les fonctions du thread JS (`remotes`) et les `signals` que le thread UI
peut appeler ou écrire, les tags de gestes, les vues retirées conservées pour leurs événements tardifs,
les `views` et les `handlers`. Chacun reste constant tant que l'app le reste : l'état d'un hook
dure aussi longtemps que son instance (`docs/reactivity.md`), un remote ou un signal aussi
longtemps que le plan validé d'un module l'encode, et disposer un module libère
tout cela. Le kernel UI répond à la même question pour ses propres magasins avec
`__kuitoUI.stats()` : les `functions`, `motions`, `handlers` et
`bindings` du thread UI. `test/demo.test.ts` et `test/motion-app.test.ts` gardent les deux constants
sur 200 Live Patches.

## Compteurs natifs

La dernière ligne du moniteur de performances (`JS · 12 parses/commit · touch 48 ms (p95
61)`) compte deux coûts que les moteurs de rendu paient pour chaque commit Kuito, de la même façon
sur iOS et Android (`KuitoCommitStats`, `KuitoParses`) :

- **Analyses par commit.** Le lot hôte type la valeur de chaque prop intégrée
  (docs/native-scheduling.md), donc les setters intégrés n'analysent aucun texte. Les props
  propres à une vue de module natif arrivent sous forme de scalaires ; les helpers de couleur qu'elles
  utilisent (`UIColor(kuitoHex:)`, `cssColor`) comptent chaque analyse. Les props JSON analysent
  leur JSON par contrat et ne sont pas comptées. Affiché comme la moyenne sur la fenêtre d'une demi-seconde
  du moniteur, pour les lots appliqués pendant celle-ci ; les props pilotées par le thread UI ne sont pas des commits
  et ne sont pas comptées.
- **Latence du toucher à l'application.** Depuis un toucher qui s'enfonce ou se relève (l'horodatage
  propre de l'événement, lu par la fenêtre avant qu'une vue ne le voie) jusqu'à la fin de l'application
  du premier lot que le thread JS a envoyé après lui. Un toucher ultérieur remplace celui encore
  en attente ; un toucher auquel aucun lot ne répond en 5 s est abandonné, puisqu'il n'a
  rien envoyé à appliquer. Le p95 porte sur les 64 derniers touchers ayant reçu une réponse. Un lot que le
  thread JS a envoyé après le toucher pour une autre raison (un timer) y répond aussi.

## Ce qui fausse les mesures

- **Les overlays des devtools.** Le moniteur de performances et le surligneur de mises à jour redessinent
  la fenêtre d'eux-mêmes, et un émulateur sans mises à jour partielles la redessine
  entièrement à chaque fois. Le benchmark désactive les deux via `run-as` le temps du run et
  restaure vos réglages ensuite, même s'il est interrompu ; `--overlays` les garde
  activés pour les mesurer. Sur l'image Pixel 3a, ils ajoutaient environ un tiers au temps
  du thread UI de Discover.
- **Le nombre de CPU de l'émulateur.** L'AVD Pixel 3a d'origine sur Apple Silicon a
  `hw.cpu.ncore = 1` : le thread UI, le RenderThread, Hermes et le décodage d'images
  partagent un seul cœur, et un thread UI qui a du travail peut passer l'essentiel d'une frame
  à attendre ce cœur. Augmentez-le dans le `config.ini` de l'AVD pour des chiffres plus proches
  d'un téléphone ; gardez-le fixe entre avant et après.
- **Le GPU de l'hôte.** Chaque frame de l'émulateur passe par le GPU de l'hôte, partagé
  avec tous les autres émulateurs et simulateurs en cours d'exécution. `eglSwapBuffers` et
  `dequeueBuffer` dominent alors le RenderThread, et le jank de gfxinfo varie fortement
  entre les runs d'un même build. Comparez les chiffres du thread UI, alternez les builds,
  et fermez les autres émulateurs.
- **Les builds de debug.** Le benchmark mesure des APK de debug, tels que `kuito dev` les
  compile. Comparez des builds du même type.
