# CLI Kuito — du simulateur à la source en une commande

La CLI est le point d'entrée prévu de la boucle de développement natif de Kuito. Elle découvre les appareils, démarre un simulateur iOS ou un émulateur Android, construit le shell de développement natif concerné, installe l'app, la lance et démarre le watcher Live Patch Rolldown/Oxc. Vous n'avez **pas** à ouvrir Xcode ni Android Studio pour exécuter l'app, mais les SDK Apple/Android sous-jacents doivent être installés.

## Démarrage rapide

```sh
kuito doctor
kuito devices
kuito dev ios
kuito dev android --device Pixel_9
```

`kuito` exécute l'app du répertoire où elle est démarrée, qui a besoin d'un `kuito.config.ts` ; dans ce dépôt, c'est `demo/` (`cd demo && kuito dev ios`). L'entrée par défaut est `./app`. Pour utiliser une autre entrée : `kuito dev ios --entry navigation.tsx` dans `demo/`. Pour un usage headless : `kuito devices --json` ou fournissez `--device` (une invite n'est affichée que lorsque plusieurs appareils sont disponibles et qu'un vrai TTY existe). `kuito --help` affiche toutes les commandes et options.

## Créer une app

```sh
kuito create MyApp     # alias: kuito init MyApp
cd MyApp
kuito dev ios          # or: kuito dev android
```

`kuito create <name>` écrit une nouvelle app dans `./<name>` et y exécute `npm install`
(`--no-install` le saute). Le nom commence par une lettre et contient des
lettres, des chiffres, `-` et `_` ; il nomme le répertoire et, en minuscules, le paquet
npm. Un répertoire existant doit être vide : `create` n'écrase jamais de fichiers.

```text
MyApp/
  package.json     scripts ios / android / start; depends on kuito
  kuito.config.ts native settings: name, ids, icon, a staging environment (docs/apps.md)
  assets/          icon.png, icon-staging.png and splash.png
  tsconfig.json    Kuito's JSX settings, for the editor and tsc
  README.md
  .gitignore       includes .kuito/, the generated shells
  modules/         the app's native modules (kuito module create)
  app/             file-based routes (docs/navigation.md)
    _layout.tsx                    Home and Explore tabs, platform symbols
    (home)/index.tsx               image, state, a motion animation, links
    (explore)/explore.tsx          a List of topics
    (explore)/explore/[topic].tsx  each topic with a live demo
    about.tsx                      a sheet
    _components/                   shared components, topics and demos
```

Le modèle vit dans `templates/app`, `kuito.config.ts` compris, avec le nom de
l'app et les ids `com.example.<name>` remplis ; `package.json` et `tsconfig.json` sont
écrits par `src/cli/create.ts`.

**D'où vient Kuito.** `kuito create` ajoute le paquet `kuito` publié comme
dépendance de l'app et l'installe. Ce paquet fournit les imports, les types
et la commande `kuito`. Une mise à jour est un changement de version.

**Les shells natifs restent dans le framework.** L'app ne commite aucun projet natif.
`kuito dev` et `kuito build` génèrent ses shells à partir des `native/ios` et
`native/android` du framework, configurés par `kuito.config.ts`, dans le
`.kuito/` gitignoré de l'app, et les installent sous le nom et les ids propres à
l'app. Copier les projets natifs dans chaque app les forkerait dès le premier
changement du framework ; la mise à niveau est à la place un changement de version. [Projets d'app](apps.md)
couvre la structure, les clés de config et la manière dont les shells sont générés.

**Environnements.** `--env <name>` construit l'un des environnements de la config :
`kuito dev ios --env staging` installe l'app de staging du starter, avec son propre
nom, sa propre icône et ses propres ids, à côté de celle de production. `kuito dev` prend par défaut
`development` et `kuito build` `production` ([environnements](apps.md#environments)).

**Entrée.** `--entry` est relatif au répertoire où `kuito` s'exécute. Sans lui,
`kuito dev` exécute `./app` : le répertoire `app/` quand il existe, et sinon
`app.tsx`. Le `demo/` de ce dépôt a un répertoire `app/`, Reel. Le serveur Live Patch s'exécute aussi dans ce répertoire,
la LogBox ouvre donc les fichiers de l'app et la session affiche des chemins relatifs à celui-ci.

## Expérience interactive

`kuito dev` ouvre un sélecteur d'appareils filtrable à la saisie quand plusieurs cibles existent (les démarrés d'abord, puis le runtime le plus récent ; `--device` accepte un nom exact tel que `"iPhone 18 Pro"`). La session imprime ensuite une ligne stabilisée par étape — appareil démarré, app native construite, Live Patch démarré, app lancée — suivie d'une ligne par édition :

```
02:05:14  ✔ patched   app.tsx  rev 2 · 18ms
02:05:14  ✔ applied   app.tsx → iPhone 18 Pro  rev 2 · 142ms from save · eval 9ms
02:05:40  ✖ rejected  app.tsx:12:4
            Unexpected token
             12 |   return (,
            previous version stays live
```

`patched` est le build : sa révision et le temps qu'a pris la compilation, ou `no device
connected` quand il n'a atteint aucun appareil. Chaque appareil accuse ensuite lui-même réception de la révision
([le lien de dev](devtools.md#the-dev-link)) : `applied` nomme l'appareil et le
temps entre la sauvegarde du fichier et l'évaluation du patch par cet appareil, et un
patch qui lève sur un appareil affiche `rejected on <device>` avec l'erreur.
Sous le flux, une ligne par appareil connecté affiche la dernière révision qu'il a accusée ;
sans appareil connecté, il n'y en a aucune.

Une barre persistante liste les raccourcis à une touche : `r` reconstruire et relancer, `l` basculer les journaux de l'appareil, `d` changer d'appareil, `m` ouvrir les devtools sur l'appareil ([devtools](devtools.md)), `j` déboguer le thread JS dans Chrome DevTools (`u` pour le thread UI, [débogage](devtools.md#debugging-with-chrome-devtools)), `k` le panneau Components ([components](devtools.md#components)), `s` sauvegarder un enregistrement pour `kuito replay` ([enregistrement](devtools.md#recording-and-replay)), `c` effacer, `?` aide, `q` quitter ; `kuito help` liste la même table. Les couleurs sont les couleurs ANSI nommées propres au terminal, les thèmes clairs et sombres restent donc lisibles. La sortie du build est masquée sauf si `--verbose` est défini ; une étape qui échoue affiche son résumé et les lignes de sortie de l'outil qui nomment l'erreur. Les erreurs de compilation — dans une étape de démarrage (le moteur d'appareil compile l'app d'abord) ou une édition rejetée — affichent `file:line:column`, le code frame et le compilateur qui les a signalées (par exemple `reported by the styles() compiler`) ; les erreurs sans ligne nomment quand même le fichier.

Le compilateur Live Patch reste actif entre les éditions : une reconstruction ne réexécute les transformations de Kuito que pour les modules dont la source a changé, et un build dont la sortie est identique à la précédente (un commentaire, un export inutilisé) est la même révision et n'envoie aucun patch.

Le code natif se recharge aussi. Sauvegarder un fichier `.swift`, `.kt` ou `.ts` sous le `modules/` de l'app reconstruit le shell de manière incrémentale et relance l'app, tout comme un Live Patch qui appelle une fonction de module natif que le shell en cours n'a pas liée ([modules natifs](native-modules.md#4-use-it)). Les éditions TypeScript restent des Live Patches.

La CLI surveille l'app lancée. Quand elle plante, la session affiche la cause et les premières frames — depuis le rapport de plantage macOS (`~/Library/Logs/DiagnosticReports`) pour le simulateur iOS, et depuis `adb logcat -b crash` pour les exceptions Java et les tombstones natifs sur Android — et propose `r` pour reconstruire et relancer. Une app qui se termine sans planter (par exemple, balayée) ne produit qu'un avertissement.

Sans TTY (CI, pipes), le même flux est imprimé en lignes brutes, stdin accepte `quit` et transmet `devtools`, `components` et `debug js|ui` au serveur de dev, et un plantage termine la commande avec le code de sortie 1.

La sortie `console` de l'app apparaît dans la session à la ligne de source qui l'a journalisée, et la [LogBox](logbox.md) ouvre les frames dans l'éditeur nommé par `KUITO_EDITOR`.

La CLI dialogue avec le serveur Live Patch par des événements JSON délimités par des sauts de ligne (`KUITO_EVENTS=ndjson`) : `ready`, `patched` (révision, durée du build, fichiers édités, s'il s'agit du build initial, combien d'appareils il a atteints, les modules natifs que le bundle requiert), `unchanged` (une reconstruction avec la même sortie ; rien d'envoyé), `rejected` (diagnostics avec fichier, ligne, colonne et code frame), `device:connected` et `device:disconnected` (l'id, le nom et la plateforme d'un appareil), `device:applied` (révision, temps d'évaluation sur l'appareil, et le temps entre l'édition et cet accusé) et `device:rejected` (révision, code, message) pour l'accusé de chaque appareil ([le lien de dev](devtools.md#the-dev-link)), `console` (niveau, message, fichier, ligne, colonne), `error` et `state`. `kuito dev` conserve la sortie lisible par un humain.

Autres commandes :

- `kuito create <name>` : une nouvelle app ([ci-dessus](#create-an-app)).
- `kuito module create <Name>` : un module natif dans `./modules/<name>` (kebab case) : sa spec TypeScript, Swift et Kotlin ([modules natifs](native-modules.md#write-your-own-module)).
- `kuito build ios|android` : compiler sans lancer d'émulateur ni démarrer Live Patch.
- `kuito devices` : afficher les simulateurs/émulateurs en cours et les AVD Android installés mais arrêtés.
- `kuito doctor` : ce dont le build a besoin et qui manque sur cette machine, avec la manière de corriger chaque point.
- `kuito logs ios|android --device ...` : diffuser les journaux de la plateforme.
- `kuito replay <file.krec> [ios|android]` : rejouer un enregistrement sauvegardé sur un shell qui n'exécute aucune app ([devtools](devtools.md#recording-and-replay)).
- `kuito dev ios --no-launch --port 9000` : exécuter le serveur Live Patch seul. Chaque plateforme a
  son propre bundle ([plateformes](styles.md#platforms)), une session sert donc les appareils
  d'une seule plateforme et a besoin qu'elle soit nommée ; un appareil de l'autre plateforme est signalé comme une erreur.

## Prérequis SDK

Sur **macOS**, installez Xcode et son runtime de simulateur ainsi que `xcodegen` (généralement `brew install xcodegen`). La CLI utilise `xcrun simctl` pour démarrer/installer/lancer et `xcodebuild` pour construire. La signature de code est désactivée pour les builds simulateur.

Pour **Android**, installez le JDK 21, les platform tools du SDK Android (`adb`), l'émulateur et un AVD, et Gradle 8 (ou ajoutez `native/android/gradlew`). Elle utilise Gradle, `adb install`, `adb shell am start` et `emulator -avd` ; `adb` et `emulator` viennent de `$ANDROID_HOME` (ou `$ANDROID_SDK_ROOT`) quand il est défini, sinon du `PATH`. Sur les appareils physiques, elle utilise `adb reverse` pour atteindre le serveur de dev local ; sur l'émulateur Android, elle utilise `10.0.2.2`. `kuito doctor` vérifie Node, Xcode, XcodeGen, adb, le JDK et Gradle, aux versions que `src/cli/requirements.ts` énonce une fois (le minimum de Node est l'`engines` du `package.json`) ; elle n'installe pas de paquets SDK et ne remplace pas la configuration des licences développeur/du SDK. Un émulateur que `kuito` démarre écrit sa sortie dans `kuito-emulator-<avd>.log` dans le répertoire temporaire : s'il se termine avant d'avoir démarré, le démarrage échoue avec cette sortie. Un démarrage qui échoue ou est annulé l'arrête ; un émulateur démarré continue de tourner après la sortie de `kuito`.

## Connexion de l'app

La CLI transmet `KUITO_DEV_URL` au processus du simulateur iOS via `SIMCTL_CHILD_KUITO_DEV_URL`, et `kuito_dev_url` comme extra d'intent de l'Activity Android. `--port` configure à la fois le serveur de dev et l'URL de l'app. Le serveur de dev écoute sur loopback, et un appareil physique Android utilise la redirection de port. Ne l'exposez pas sur un réseau non fiable.

## Périmètre et travail restant

Cette CLI automatise le développement contre les **shells UI natifs** de Kuito. Ce n'est ni une application Kuito autonome compilée sur l'appareil, ni un service de distribution de binaires de production, ni un substitut à un SDK Xcode/Android installé. Le build/lancement du simulateur iOS et l'installation/lancement Android doivent être vérifiés sur de vraies machines hôtes : une CI Linux ne peut pas valider une exécution Xcode. Le Typed Static Hermes AOT est une expérimentation distincte.

## Hermes sur l'appareil

`kuito dev ios|android` construit les assets JS de bootstrap et d'application, compile l'app mobile avec le pont Hermes/JSI, l'installe/la lance et démarre un serveur de patchs de source sur localhost. Le JavaScript s'exécute dans **chaque processus d'appareil** ; le poste de travail ne fait que bundler le TSX et envoyer des patchs de source. Le build natif a toujours besoin de Hermes. Les deux plateformes lient la même release Hermes V1 précompilée (la lignée static_h), épinglée dans `native/hermes.json` : iOS lie son xcframework (`com.facebook.hermes:hermes-ios`, variante debug) comme paquet Swift local : la CLI télécharge le tarball une fois, le vérifie contre `iosSha256`, et le décompresse avec un `Package.swift` généré dans `~/.cache/kuito/hermes-ios-<version>`, dont dépend le projet généré (`src/cli/hermes-ios.ts`). Maven livre un tarball et les cibles binaires distantes de SwiftPM doivent être des zips, d'où le paquet local ; Android lie `com.facebook.hermes:hermes-android`. Lisez les [réserves sur l'exécution sur l'appareil](on-device-hermes.md).
