# Performance

Comment mesurer la fréquence d'images de Kuito sur Android et le démarrage à froid sur les deux plateformes, et ce que les chiffres veulent dire.

## Le benchmark de frames Android

`scripts/benchmark-android.ts` rejoue la démo Reel (`demo/app.tsx`) sur un émulateur ou un appareil avec des gestes `input` sur l'appareil. Chaque run démarre l'app à froid, et chaque scénario commence une fois l'app inactive.

- `launch` : démarrage à froid, puis le catalogue, les affiches et la mise en page, jusqu'à ce que l'app soit inactive
- `sheet` : ouvre et ferme deux fois la Sheet de détails
- `tabs` : Search, Library, Lab, Discover, deux fois
- `discover` : balaie deux rails, fait défiler Discover vers le bas puis vers le haut
- `library` : fait défiler Library de six écrans vers le bas puis revient

Démarrez le serveur de dev pour l'appareil, ce qui installe aussi l'app, et laissez-le tourner. Puis mesurez l'app installée :

```sh
kuito dev android -d emulator-5554 --port 8766
node scripts/benchmark-android.ts --device emulator-5554 --port 8766 --runs 3 --label mine
```

Pour comparer deux builds, passez les deux APK. Ils alternent au sein de chaque run, de sorte que la charge de l'hôte retombe sur les deux pareillement :

```sh
node scripts/benchmark-android.ts --runs 4 --build before=before.apk --build after=after.apk
```

`--scenario discover` lance un seul scénario, et `--report` réimprime le résumé d'un run antérieur. Les résultats vont dans `dist/benchmarks/android/<label>/` : `results.json`, et un fichier texte atrace par scénario et par run (environ 60 Mo chacun). Ouvrez une trace dans [Perfetto](https://ui.perfetto.dev) pour la voir.

## Ce qu'il rapporte

Par scénario, la médiane sur les runs de :

- Depuis `dumpsys gfxinfo` : frames rendues, % de jank (frames qui ont manqué leur échéance), temps de frame p50/p90/p99. C'est ce qu'un utilisateur voit, mais sur un émulateur c'est dominé par le GPU de l'hôte.
- Depuis le thread UI de la trace : `uiSlowPercent` (frames dont le temps propre sur le thread principal dépasse 16,7 ms), `uiP90`, `uiMaxMs` et `uiTotalMs`. C'est le travail que le moteur de rendu de Kuito contrôle, et il est bien moins bruité.
- `startMs` (launch seulement) : temps jusqu'au premier dessin de l'activité.
- `contentMs` (launch seulement) : du premier événement tracé du processus à la fin de son plus grand `Kuito commit` : le temps qu'un utilisateur attend le contenu.
- `anrs` : rapports "Application Not Responding".

## Démarrage à froid

Les deux shells démarrent depuis du bytecode Hermes : le kernel et l'app arrivent compilés, donc Hermes ne les analyse ni ne les compile. `contentMs` inclut la requête de Reel à l'API TVMaze, qui varie de centaines de millisecondes entre les runs. Comparez des médianes sur plusieurs runs.

Sur iOS, `scripts/benchmark-ios.ts` mesure la même chronologie `launch` sur un simulateur. Compilez et installez le shell (`kuito dev ios`), puis :

```sh
node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" --runs 7 --label mine
```

Sans `--port`, l'app démarre hors ligne, depuis son seul bytecode embarqué. Le premier run après une installation paie les caches de fichiers froids. Les résultats vont dans `dist/benchmarks/ios-launch-<label>.json`.

## Compteurs du kernel

`__kuito.stats()` renvoie un instantané du travail que le kernel a fait, donc un test ou une session de débogage compare deux instantanés autour d'une interaction : `replans`, `thunkEvaluations`, `subscriptionsCreated`, `subscriptionsDestroyed`, `sendPropCalls` et `bytesStringified`. `total` les tient depuis le chargement du kernel ; `lastReplan` tient ce que le dernier `patch()` committé a fait.

## Ce qui fausse les mesures

- Les overlays des devtools : le moniteur de performances et le surligneur de mises à jour redessinent la fenêtre d'eux-mêmes. Le benchmark les éteint pour le run et restaure vos réglages ensuite ; `--overlays` les garde allumés pour les mesurer.
- Le nombre de CPU de l'émulateur : l'AVD Pixel 3a d'origine sur Apple silicon a `hw.cpu.ncore = 1`. Augmentez-le dans le `config.ini` de l'AVD pour des chiffres plus proches d'un téléphone ; gardez-le fixe entre avant et après.
- Le GPU de l'hôte : chaque frame de l'émulateur passe par le GPU de l'hôte, partagé avec tous les autres émulateurs et simulateurs en cours. Comparez les chiffres du thread UI, alternez les builds, et fermez les autres émulateurs.
- Les builds de debug : le benchmark mesure des APK de debug, tels que `kuito dev` les construit. Comparez des builds du même type.

## En profondeur

[Performance](../../../../docs/performance.md) couvre les sections de trace que le shell marque, chaque compteur du kernel, les compteurs natifs derrière le moniteur de performances et comment construire un APK à comparer.
