# Projets d'app

Une app créée par `kuito create` ([CLI](cli.md#create-an-app)) ne contient que du TypeScript
et de la configuration. Tout le natif est livré dans le framework, et la
CLI génère et construit à la demande les shells natifs de chaque app.

```text
MyApp/
  app/                 the app: file-based routes (navigation.md)
  assets/              icon.png and icon-staging.png, the app icons; splash.png
  modules/             the app's own native modules (below)
  kuito.config.ts     native settings: name, ids, icon, environments
  package.json         one dependency: kuito
  tsconfig.json
  .gitignore           node_modules/, dist/, .kuito/
  .kuito/             generated shells and builds; never committed
```

## Décisions

| Décision                                                                                         | Comment la structure en découle                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Une mise à niveau est un simple changement de version.                                           | L'app ne commite aucun projet `ios/` ni `android/`. `kuito` est sa seule dépendance, et les shells sont régénérés depuis le framework installé à chaque build, une nouvelle version apporte donc de nouveaux shells.               |
| Un paquet, une version : CLI, noyau, moteurs de rendu, compilateur et Hermes évoluent ensemble.  | Tous vivent dans `kuito` : `src/cli`, `src/runtime`, `native/` et l'épinglage de Hermes, `native/hermes.json`. La commande `kuito` de l'app est le `bin` de ce paquet.                                                            |
| Les réglages natifs propres à l'app vont dans la config, jamais dans des fichiers natifs édités. | `kuito.config.ts` est la seule entrée native. La CLI la transforme en spec XcodeGen et en propriétés Gradle (`src/cli/shells.ts`) ; rien dans `.kuito/` n'est destiné à être édité, et rien dans `native/` ne change selon l'app. |
| Les shells natifs sont générés dans un cache, `.kuito/`, gitignoré et jamais commité.           | `kuito dev` et `kuito build` y écrivent tout : le projet iOS et ses derived data, le build et les caches de Gradle, et le JS bundlé.                                                                                              |
| De la place pour `kuito upgrade` (un changement de version plus des codemods).                  | Rien de ce qu'une mise à niveau aurait à fusionner ne vit dans l'app : seulement `kuito.config.ts` et le code de l'app, que des codemods peuvent réécrire.                                                                         |

## kuito.config.ts

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  version: '1.2.0',
  buildNumber: 14,
  icon: './assets/icon.png',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  environments: {
    staging: {
      name: 'MyApp Staging',
      idSuffix: '.staging',
      icon: './assets/icon-staging.png',
    },
  },
} satisfies KuitoConfig;
```

| Clé                                | Effet                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                             | Le nom sous l'icône de l'app : `CFBundleDisplayName`, le label de l'app sur Android.                                                        |
| `version`                          | Ce que voient les utilisateurs : `CFBundleShortVersionString`, `versionName`. Jusqu'à trois nombres. `1.0.0`.                               |
| `buildNumber`                      | Ce par quoi les stores ordonnent les envois : `CFBundleVersion`, `versionCode`. À augmenter à chaque envoi. `1`.                            |
| `icon`                             | L'icône de l'app sur les deux plateformes : un PNG carré d'au moins 1024×1024. Optionnel.                                                   |
| `ios.bundleIdentifier`             | `PRODUCT_BUNDLE_IDENTIFIER` ; l'id que `kuito dev` installe et lance.                                                                      |
| `ios.icon.light`                   | Remplace `icon` sur iOS.                                                                                                                    |
| `ios.icon.dark`, `ios.icon.tinted` | Les apparences sombre et teintée de l'icône (iOS 18). Peuvent être transparentes.                                                           |
| `android.applicationId`            | L'`applicationId` de Gradle ; le paquet que `kuito dev` installe et lance.                                                                 |
| `android.adaptiveIcon.foreground`  | La couche de premier plan de l'icône adaptative. Sans elle, `icon` remplit la zone visible.                                                 |
| `android.adaptiveIcon.background`  | Une couleur (`#1E88E5`) ou un PNG. Par défaut, la couleur du coin supérieur gauche d'`icon`, ou blanc.                                      |
| `android.adaptiveIcon.monochrome`  | La couche monochrome des icônes thématiques d'Android 13.                                                                                   |
| `permissions`                      | Ce que l'app demande, avec les raisons pour iOS ; voir [Permissions](permissions.md#declare-them-in-kuitoconfigts).                        |
| `backgroundTasks`                  | Les noms des tâches que l'OS peut exécuter en arrière-plan ; voir [Tâches d'arrière-plan](background-tasks.md).                             |
| `fonts`                            | Les fichiers .ttf et .otf que `fontFamily` accepte, bundlés dans les deux shells ; voir [Polices](fonts.md#bundle-fonts).                   |
| `migrations`                       | Les migrations de la base de données de l'app, la plus ancienne en premier ; voir [Stockage](storage.md#migrations). Pas par environnement. |
| `splash.logo`                      | Le logo de l'écran de lancement, un PNG dessiné au centre ; voir [Écran de démarrage](splash.md).                                           |
| `splash.logoWidth`                 | La largeur du logo en points et en dp, jusqu'à 288. `100`.                                                                                  |
| `splash.background`                | La couleur de l'écran de lancement. `#FFFFFF`.                                                                                              |
| `splash.brand`                     | Un PNG ajusté dans une boîte de 200×80, à 60 du bas. Optionnel.                                                                             |
| `splash.dark`                      | `logo`, `background` et `brand` en mode sombre.                                                                                             |
| `splash.variants.<name>`           | D'autres apparences que l'app peut choisir pour son prochain lancement (Android 13 et versions ultérieures).                                |
| Réglages natifs                    | Orientation, apparence, schémas d'URL, entrées d'Info.plist et de manifeste ; voir [Réglages natifs](#native-settings).                     |
| `environments.<name>`              | Des surcharges de n'importe quelle clé ci-dessus sauf `migrations`, plus `idSuffix`, pour un environnement (ci-dessous).                    |

La CLI charge le fichier avec Node et le vérifie : une clé manquante ou inconnue, un id mal formé, une
icône qui n'est pas un chemin `.png`, une police qui n'est pas un chemin `.ttf` ou `.otf` ou une couleur mal formée est une erreur nommant le fichier et la clé, dans
quelque environnement que ce soit. Les ids sont en DNS inversé (`com.example.app`) ; les segments d'Android
doivent commencer par une lettre. Les chemins d'images sont relatifs à `kuito.config.ts`. `version` doit comporter jusqu'à trois
nombres (le format des stores) et `buildNumber` un nombre entier jusqu'à 2100000000 (la limite de Google
Play) ; il n'existe aucune autre copie de l'un ni de l'autre, et le `package.json` de l'app n'a pas de
`version`. Chaque commande `kuito` qui construit ou exécute une app a besoin d'un `kuito.config.ts` dans
le répertoire où elle s'exécute, et échoue sans lui. Ce dépôt héberge une app de la même manière :
`demo/` est Reel, avec son propre `kuito.config.ts` et son propre `package.json` ([vitrine](showcase.md#config)).

Clés prévues, pas encore lues : les propriétés Gradle. Elles seront surchargeables par environnement
de la même manière.

### Réglages natifs

Ce qui impliquerait sinon d'éditer `Info.plist`, les entitlements, `AndroidManifest.xml` ou un
thème est une clé de la config. Les clés typées viennent en premier : une valeur, écrite dans le réglage
propre à chaque plateforme.

```ts
export default {
  // ...
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#101418',
  statusBar: { style: 'light' },
  urlSchemes: ['myapp'],
  linkDomains: ['example.com'],
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp', softInputMode: 'resize' },
} satisfies KuitoConfig;
```

| Clé                          | Valeurs (défaut en premier)                              | iOS                                                                                     | Android                                                                                                                              |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `orientation`                | `default`, `portrait`, `landscape`                       | `UISupportedInterfaceOrientations` et sa variante `~ipad`                               | L'`android:screenOrientation` de l'activité : `portrait` ou `sensorLandscape`                                                        |
| `userInterfaceStyle`         | `automatic`, `light`, `dark`                             | `UIUserInterfaceStyle`                                                                  | Le parent d'`AppTheme`, et le mode nuit de l'activité (meta-data `dev.kuito.userInterfaceStyle`)                                    |
| `backgroundColor`            | aucune, ou une couleur comme `#101418`                   | La couleur de la fenêtre et de la vue racine (`KuitoBackgroundColor`)                  | L'`android:windowBackground` d'`AppTheme`, et la couleur de la racine (meta-data `dev.kuito.backgroundColor`)                       |
| `statusBar.style`            | `auto`, `light`, `dark`                                  | `UIStatusBarStyle`                                                                      | L'`android:windowLightStatusBar` d'`AppTheme`                                                                                        |
| `statusBar.hidden`           | `false`, `true`                                          | `UIStatusBarHidden`                                                                     | L'`android:windowFullscreen` d'`AppTheme`                                                                                            |
| `urlSchemes`                 | aucun, ou des schémas comme `myapp`                      | `CFBundleURLTypes`                                                                      | Un filtre d'intent `VIEW` / `BROWSABLE` sur l'activité                                                                               |
| `ios.supportsTablet`         | `true`, `false`                                          | `TARGETED_DEVICE_FAMILY` : `1,2` ou `1`                                                 | —                                                                                                                                    |
| `ios.requiresFullScreen`     | `false`, `true`                                          | `UIRequiresFullScreen` : renonce au multitâche iPad                                     | —                                                                                                                                    |
| `ios.deploymentTarget`       | `16.0`, ou plus récent                                   | La cible de déploiement de la target                                                    | —                                                                                                                                    |
| `linkDomains`                | aucun, ou des domaines comme `example.com`               | Une entrée `applinks:` chacun dans l'entitlement des domaines associés                  | Un filtre d'intent `VIEW` / `BROWSABLE` vérifié (`autoVerify`) pour `https` sur chaque hôte ([liens](linking.md#link-domains))       |
| `ios.associatedDomains`      | aucun, ou des entrées comme `webcredentials:example.com` | L'entitlement `com.apple.developer.associated-domains`, à côté de ceux de `linkDomains` | —                                                                                                                                    |
| `ios.backgroundModes`        | aucun, ou `audio`, `location`, `fetch`, ...              | `UIBackgroundModes`                                                                     | —                                                                                                                                    |
| `permissions.locationAlways` | aucune, ou la raison qu'iOS affiche                      | `UIBackgroundModes` `location`, à côté de la raison                                     | Le service de premier plan `KuitoLocationService` et `FOREGROUND_SERVICE_LOCATION` ([Localisation](location.md#background-updates)) |
| `android.softInputMode`      | `resize`, `pan`                                          | —                                                                                       | L'`android:windowSoftInputMode` de l'activité : `adjustResize` ou `adjustPan`                                                        |
| `android.minSdk`             | `26`, jusqu'à `35`                                       | —                                                                                       | Le `minSdk` de Gradle                                                                                                                |

Une clé laissée à sa valeur par défaut n'écrit rien, le réglage propre au shell s'applique donc : les
orientations de l'appareil, le clair ou sombre du système, la barre d'état qui le suit. Le
`style` de la barre d'état nomme son contenu : `light` pour un fond sombre. `StatusBar` change les deux à
l'exécution ; ceux-ci sont ce avec quoi l'app se lance. `portrait` laisse les iPad capables de se retourner,
comme le font les modèles d'Apple ; sur iPad, une app qui ne prend pas en charge toutes les orientations
a aussi besoin d'`ios.requiresFullScreen` pour l'App Store.

`android.softInputMode` reste `resize` à moins que l'app n'évite elle-même le clavier. Le
shell est bord à bord, `adjustResize` ne redimensionne donc rien ; il transmet les insets du clavier
aux vues, qui gardent les champs focalisés hors de sa zone ([Clavier](keyboard.md#avoidance)).
`pan` fait aussi glisser toute la fenêtre vers le haut par le système, le contenu bouge donc deux fois à moins
que l'évitement ne soit désactivé (`keyboard={{ inset: false }}`).

Non réglable : le shell est toujours bord à bord (comme le sont les nouvelles apps React Native, et comme
Android 15 l'exige), et le `targetSdk` d'Android est le `compileSdk` du framework, 35.

#### Entrées d'Info.plist, d'entitlements, de manifeste et de thème

Tout ce qui n'a pas de clé typée reste de la donnée, jamais un fichier natif ni une chaîne XML :

```ts
ios: {
  bundleIdentifier: 'com.example.myapp',
  infoPlist: { LSApplicationQueriesSchemes: ['maps'], ITSAppUsesNonExemptEncryption: false },
  entitlements: { 'aps-environment': 'production' },
},
android: {
  applicationId: 'com.example.myapp',
  manifest: {
    application: { allowBackup: false },
    activity: { screenOrientation: 'fullUser' },
    metaData: { 'com.google.android.geo.API_KEY': 'AIza...' },
    usesPermissions: ['android.permission.VIBRATE'],
    usesFeatures: [{ name: 'android.hardware.camera', required: false }],
    queries: { packages: ['com.google.android.apps.maps'] },
    intentFilters: [
      {
        actions: ['android.intent.action.VIEW'],
        categories: ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'],
        data: [{ scheme: 'https', host: 'example.com', pathPrefix: '/show' }],
        autoVerify: true,
      },
    ],
  },
  theme: { 'android:navigationBarColor': '#000000' },
},
```

| Clé                                | Écrite dans                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ios.infoPlist`                    | L'`Info.plist` généré. Les valeurs sont des chaînes, nombres, booléens, tableaux et objets.                       |
| `ios.entitlements`                 | Le `KuitoIOS.entitlements` généré, le `CODE_SIGN_ENTITLEMENTS` de la target.                                     |
| `android.manifest.application`     | Les attributs d'`<application>`, nommés sans `android:`.                                                          |
| `android.manifest.activity`        | Les attributs de l'unique activité de l'app, nommés sans `android:`.                                              |
| `android.manifest.metaData`        | `<meta-data>` sous `<application>`.                                                                               |
| `android.manifest.usesPermissions` | `<uses-permission>`, à côté de celles qu'ajoutent `permissions` et les modules.                                   |
| `android.manifest.usesFeatures`    | `<uses-feature>` ; `required` vaut `true` par défaut.                                                             |
| `android.manifest.queries`         | `<queries>` : `packages`, et `intents` (une `action` et des `data` optionnelles), pour la visibilité des paquets. |
| `android.manifest.intentFilters`   | Des `<intent-filter>` sur l'activité : `actions`, `categories`, `data` et `autoVerify`.                           |
| `android.theme`                    | Des `<item>` d'`AppTheme`, par nom, dans ses variantes claire et nuit.                                            |

Chaque entrée est vérifiée comme toute autre clé : une clé inconnue, un nom qui n'en est pas un, une valeur
qui contient du balisage ou qui n'est pas une donnée plist échoue avec le chemin de la clé.

**Un seul propriétaire par entrée.** Chaque source d'entrées passe par une seule fusion
(`src/cli/native-entries.ts`) : les clés typées de la config et `permissions`, les specs des modules natifs
inclus (`ios.infoPlist`, `android.permissions`, ...), ces entrées brutes, et ce que le shell lui-même définit. Deux qui
sont en désaccord sur une clé font échouer le build en les nommant toutes deux, comme `Info.plist key UISupportedInterfaceOrientations
is set by both kuito.config.ts: orientation and kuito.config.ts: ios.infoPlist`. Une entrée brute
ne peut donc pas contredire une clé typée ni un module, et ce dont le code du shell dépend
(`UIApplicationSceneManifest` ; les `launchMode`, `exported` et `configChanges` de l'activité ; le
label, l'icône et le thème de l'application) ne peut pas être défini du tout. Deux exceptions : une raison déclarée dans
`permissions` remplace celle par défaut d'un module pour la même clé d'usage, et les clés de liste auxquelles
plusieurs sources contribuent (`UIBackgroundModes`, `LSApplicationQueriesSchemes`, `UIAppFonts`,
`BGTaskSchedulerPermittedIdentifiers`, domaines associés) sont réunies.

Sur Android, les entrées brutes et typées atterrissent dans l'overlay de manifeste que Gradle fusionne par-dessus celui
du shell (`kuito.manifest`) ; un attribut que le manifeste du shell définit aussi est remplacé avec
`tools:replace`, que l'overlay ajoute lui-même. `AppTheme` est généré dans
`.kuito/android/settings` (`values` et `values-night`, `kuito.settingsRes`), en remplacement de celui
du framework.

### Environnements

La config elle-même est l'app de production. Un environnement est un nom et les clés qui en
diffèrent ; toute autre clé est héritée, les clés imbriquées une par une (`ios: { icon: { dark } }`
conserve `ios.bundleIdentifier` ; `buildNumber` peut différer pour un envoi de staging ; `permissions: { microphone }` en ajoute une à celles de la base). Les maps d'entrées (`ios.infoPlist`,
`ios.entitlements`, `android.theme`, et les `application`, `activity` et
`metaData` d'`android.manifest`) fusionnent aussi clé par clé ; une liste (`fonts`, `urlSchemes`,
`android.manifest.intentFilters`) est remplacée en entier. `idSuffix` s'ajoute à la fois à l'id de bundle et à
l'applicationId, chaque environnement s'installe donc comme sa propre app à côté des autres.

```sh
kuito dev ios                   # development
kuito dev ios --env staging     # MyApp Staging, com.example.myapp.staging
kuito build android             # production
```

`--env` en choisit un. `kuito dev` exécute `development` et `kuito build` construit `production` quand
il n'est pas donné. Ces deux-là existent toujours et sont la config telle qu'écrite sauf déclaration ; tout autre
nom doit être déclaré sous `environments`. Les noms sont en lettres minuscules, chiffres et `-`.

Les environnements sont de la donnée, pas du code : un objet par environnement, une erreur nomme donc
sa clé, et des clés ultérieures deviennent surchargeables sans nouveau mécanisme : le
`splash: { background }` d'un environnement change la couleur et garde le logo. L'environnement n'est qu'un réglage de build ; le JS de l'app ne le voit pas encore.

### Icônes d'app

Un seul PNG de 1024×1024 suffit. À chaque build, la CLI génère ce dont chaque plateforme a besoin dans
`.kuito/` (`src/cli/app-icons.ts`) :

- **iOS** : `.kuito/ios/AppIcon.xcassets`, un `AppIcon` à taille unique de 1024 avec ses apparences sombre et
  teintée quand la config les a. Xcode en dérive toutes les autres tailles. Les icônes iOS sont
  opaques : une icône avec de la transparence est aplatie sur du blanc, et la session affiche un avertissement
  nommant la clé, exportez-la donc sans alpha pour choisir le fond.
- **Android** : `.kuito/android/res` : une icône adaptative (`mipmap-anydpi-v26`) avec des couches de premier plan,
  de fond et monochrome de 108dp, et des icônes héritées de 48dp composées à partir des mêmes
  couches, à chaque densité de mdpi à xxxhdpi. Sans `adaptiveIcon`, l'icône entière est
  dessinée dans les 72dp que le masque d'un lanceur montre, sur la couleur de coin propre à l'icône, pour qu'aucune partie
  n'en soit rognée ; définissez `adaptiveIcon.foreground` pour un visuel qui déborde dans la marge.

Les sources sont vérifiées d'abord : chacune doit être un PNG (non entrelacé), carré et d'au moins 1024px,
sinon le build échoue en nommant la clé. Les images sont décodées, rééchantillonnées et encodées par un petit
codec PNG sur `node:zlib` (`src/cli/png.ts`), aucun outil ni paquet d'images n'est donc nécessaire et il fonctionne
partout où Gradle fonctionne. La génération est sautée quand ni les octets des sources ni la config
n'ont changé depuis le dernier build (un marqueur à côté du répertoire généré).

## Shells générés

`kuito dev` et `kuito build` s'exécutent dans le répertoire du projet et écrivent dans son `.kuito/` :

- **iOS** : `.kuito/ios/project.json` est une spec XcodeGen qui inclut le
  `native/ios/project.yml` du framework et ajoute le JS bundlé et les migrations de l'app (`Resources/`), l'id de bundle, le nom
  d'affichage, la version, le numéro de build, les entrées d'Info.plist et les entitlements ([réglages natifs](#native-settings)),
  le catalogue d'icônes, le catalogue des images importées (`Assets.xcassets`, [ressources](assets.md)), l'écran de lancement (`Splash/`, [Écran de démarrage](splash.md)), les polices bundlées (`fonts/`, listées dans `UIAppFonts`), les sources des modules
  natifs inclus et la table de liaison générée (`Generated/KuitoLink.swift`) ; les specs incluses fusionnent, la
  spec du framework n'est donc pas éditée. `KUITO_NATIVE` fait pointer les chemins propres à la spec du framework
  vers `native/ios`. Hermes est un paquet Swift local, `HermesEngine`, à
  `KUITO_HERMES` (`~/.cache/kuito/hermes-ios-<version>`, voir [la CLI](cli.md)) ; les
  paquets Swift des modules le rejoignent. xcodebuild construit `KuitoIOS.xcodeproj` et résout
  les paquets lui-même. Les derived data vont dans `.kuito/build/ios`.
- **Android** : Gradle construit le `native/android` du framework avec `-Pkuito.applicationId`,
  `kuito.appName`, `kuito.assets` (le JS bundlé, les polices et les migrations), `kuito.buildDir`, les
  `kuito.sources` et `kuito.dependencies` des modules natifs, `kuito.manifest` (les permissions que l'app et
  ses modules déclarent, le service de tâches d'arrière-plan et chaque entrée de manifeste de ses
  réglages, fusionnés par-dessus le manifeste du framework), `kuito.settingsRes` (l'`AppTheme` de
  l'app), `kuito.versionName`, `kuito.versionCode`, `kuito.minSdk` (quand il est relevé) et
  `kuito.res` (l'icône générée, quand il y en a une), `kuito.splashRes` (les ressources du thème
  de démarrage, quand il y en a), `kuito.imagesRes` (les images importées, quand l'app
  en importe, [ressources](assets.md)), et
  `--project-cache-dir .kuito/android/.gradle`. La table de liaison est générée aussi (`generated/dev/kuito/link/KuitoLink.kt`), le
  projet ne se construit donc que via la CLI (`kuito build android`).

Chaque app s'installe comme sa propre app, à côté des autres apps Kuito sur le même appareil.

## Modules natifs

`modules/<name>/` contient les modules natifs propres à une app : la spec `<name>.ts`, `ios/*.swift`
et `android/*.kt`. `kuito module create <Name>` en crée un. La CLI les découvre à côté des
modules intégrés de Kuito, n'inclut dans chaque shell que les modules que le bundle de l'app appelle, et
génère la table de liaison des fonctions qu'il appelle, personne n'édite donc le framework. Voir
[modules natifs](native-modules.md#write-your-own-module).

Les hooks de cycle de vie, les paquets de modules tiers et `kuito prebuild` viendront plus tard.
