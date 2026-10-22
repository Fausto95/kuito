# App-Projekte

Eine mit `kuito create` ([CLI](cli.md#create-an-app)) erstellte App enthält nur
TypeScript und Konfiguration. Alles Native liefert das Framework mit, und die
CLI generiert und baut die nativen Shells jeder App bei Bedarf.

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

## Entscheidungen

| Entscheidung                                                                                          | Wie das Layout ihr folgt                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ein Upgrade ist ein einzelner Versionssprung.                                                         | Die App committet kein `ios/`- oder `android/`-Projekt. `kuito` ist ihre einzige Abhängigkeit, und die Shells werden bei jedem Build aus dem installierten Framework neu generiert, eine neue Version bringt also neue Shells.                |
| Ein Paket, eine Version: CLI, Kernel, Renderer, Compiler und Hermes bewegen sich gemeinsam.           | Alle liegen in `kuito`: `src/cli`, `src/runtime`, `native/` und der Hermes-Pin, `native/hermes.json`. Der `kuito`-Befehl der App ist das `bin` dieses Pakets.                                                                                |
| App-spezifische native Einstellungen gehören in die Konfiguration, nie in bearbeitete native Dateien. | `kuito.config.ts` ist die einzige native Eingabe. Die CLI macht daraus eine XcodeGen-Spezifikation und Gradle-Properties (`src/cli/shells.ts`); nichts in `.kuito/` ist zum Bearbeiten gedacht, und nichts in `native/` ändert sich pro App. |
| Native Shells werden in einen Cache generiert, `.kuito/`, der gitignored ist und nie committet wird. | `kuito dev` und `kuito build` schreiben alles dorthin: das iOS-Projekt und seine Derived Data, Gradles Build und Caches und das gebündelte JS.                                                                                               |
| Raum für `kuito upgrade` (ein Versionssprung plus Codemods).                                         | Nichts, was ein Upgrade zusammenführen müsste, lebt in der App: nur `kuito.config.ts` und App-Code, die Codemods umschreiben können.                                                                                                          |

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

| Schlüssel                          | Wirkung                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `name`                             | Der Name unter dem App-Symbol: `CFBundleDisplayName`, Androids App-Label.                                                       |
| `version`                          | Was Benutzer sehen: `CFBundleShortVersionString`, `versionName`. Bis zu drei Zahlen. `1.0.0`.                                   |
| `buildNumber`                      | Wonach die Stores Uploads ordnen: `CFBundleVersion`, `versionCode`. Pro Upload erhöhen. `1`.                                    |
| `icon`                             | Das App-Symbol auf beiden Plattformen: ein quadratisches PNG von mindestens 1024×1024. Optional.                                |
| `ios.bundleIdentifier`             | `PRODUCT_BUNDLE_IDENTIFIER`; die ID, die `kuito dev` installiert und startet.                                                  |
| `ios.icon.light`                   | Ersetzt `icon` auf iOS.                                                                                                         |
| `ios.icon.dark`, `ios.icon.tinted` | Die dunkle und die getönte Darstellung des Symbols (iOS 18). Dürfen transparent sein.                                           |
| `android.applicationId`            | Gradles `applicationId`; das Paket, das `kuito dev` installiert und startet.                                                   |
| `android.adaptiveIcon.foreground`  | Die Vordergrundebene des adaptiven Symbols. Ohne sie füllt `icon` den sichtbaren Bereich.                                       |
| `android.adaptiveIcon.background`  | Eine Farbe (`#1E88E5`) oder ein PNG. Standard ist die Farbe oben links in `icon`, sonst Weiß.                                   |
| `android.adaptiveIcon.monochrome`  | Die einfarbige Ebene der thematischen Symbole von Android 13.                                                                   |
| `permissions`                      | Was die App anfragt, mit den Begründungen für iOS; siehe [Berechtigungen](permissions.md#declare-them-in-kuitoconfigts).       |
| `backgroundTasks`                  | Namen der Tasks, die das Betriebssystem im Hintergrund ausführen darf; siehe [Hintergrund-Tasks](background-tasks.md).          |
| `fonts`                            | .ttf- und .otf-Dateien, die `fontFamily` annimmt, in beide Shells gebündelt; siehe [Schriften](fonts.md#bundle-fonts).          |
| `migrations`                       | Die Datenbankmigrationen der App, älteste zuerst; siehe [Speicher](storage.md#migrations). Nicht pro Umgebung.                  |
| `splash.logo`                      | Das Logo des Startbildschirms, ein mittig gezeichnetes PNG; siehe [Splash-Screen](splash.md).                                   |
| `splash.logoWidth`                 | Die Breite des Logos in Punkten und dp, bis zu 288. `100`.                                                                      |
| `splash.background`                | Die Farbe des Startbildschirms. `#FFFFFF`.                                                                                      |
| `splash.brand`                     | Ein PNG, eingepasst in einen 200×80-Kasten, 60 vom unteren Rand. Optional.                                                      |
| `splash.dark`                      | `logo`, `background` und `brand` im Dunkelmodus.                                                                                |
| `splash.variants.<name>`           | Weitere Erscheinungsbilder, die die App für ihren nächsten Start wählen kann (Android 13 und neuer).                            |
| Native Einstellungen               | Ausrichtung, Erscheinungsbild, URL-Schemata, Info.plist- und Manifest-Einträge; siehe [Native Einstellungen](#native-settings). |
| `environments.<name>`              | Überschreibungen jedes Schlüssels oben außer `migrations`, plus `idSuffix`, für eine Umgebung (unten).                          |

Die CLI lädt die Datei mit Node und prüft sie: ein fehlender oder unbekannter Schlüssel, eine
fehlerhafte ID, ein Symbol, das kein `.png`-Pfad ist, eine Schrift, die kein `.ttf`- oder `.otf`-Pfad ist, oder eine fehlerhafte Farbe ist ein Fehler, der die Datei und den Schlüssel nennt, in
welcher Umgebung auch immer er steht. Die IDs sind Reverse-DNS (`com.example.app`); Androids Segmente
müssen mit einem Buchstaben beginnen. Bildpfade sind relativ zu `kuito.config.ts`. `version` muss aus bis zu drei
Zahlen bestehen (das Format der Stores) und `buildNumber` eine ganze Zahl bis 2100000000 sein (Google
Plays Grenze); es gibt keine weitere Kopie von beidem, und die `package.json` der App hat keine
`version`. Jeder `kuito`-Befehl, der eine App baut oder ausführt, braucht eine `kuito.config.ts` in
dem Verzeichnis, in dem er läuft, und schlägt ohne sie fehl. Dieser Checkout beherbergt eine App auf dieselbe Weise:
`demo/` ist Reel, mit eigener `kuito.config.ts` und `package.json` ([Showcase](showcase.md#config)).

Geplante, noch nicht gelesene Schlüssel: Gradle-Properties. Sie werden auf dieselbe Weise pro Umgebung
überschreibbar sein.

### Native Einstellungen

Was sonst das Bearbeiten von `Info.plist`, Entitlements, `AndroidManifest.xml` oder eines
Themes bedeuten würde, ist ein Schlüssel in der Konfiguration. Typisierte Schlüssel kommen zuerst: ein Wert, geschrieben in die
jeweilige Einstellung jeder Plattform.

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

| Schlüssel                    | Werte (Standard zuerst)                               | iOS                                                                                     | Android                                                                                                                            |
| ---------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `orientation`                | `default`, `portrait`, `landscape`                    | `UISupportedInterfaceOrientations` und seine `~ipad`-Variante                           | `android:screenOrientation` der Activity: `portrait` oder `sensorLandscape`                                                        |
| `userInterfaceStyle`         | `automatic`, `light`, `dark`                          | `UIUserInterfaceStyle`                                                                  | Das Parent von `AppTheme` und der Nachtmodus der Activity (Meta-Data `dev.kuito.userInterfaceStyle`)                              |
| `backgroundColor`            | keine, oder eine Farbe wie `#101418`                  | Die Farbe des Fensters und der Root-View (`KuitoBackgroundColor`)                      | `android:windowBackground` von `AppTheme` und die Farbe der Root (Meta-Data `dev.kuito.backgroundColor`)                          |
| `statusBar.style`            | `auto`, `light`, `dark`                               | `UIStatusBarStyle`                                                                      | `android:windowLightStatusBar` von `AppTheme`                                                                                      |
| `statusBar.hidden`           | `false`, `true`                                       | `UIStatusBarHidden`                                                                     | `android:windowFullscreen` von `AppTheme`                                                                                          |
| `urlSchemes`                 | keine, oder Schemata wie `myapp`                      | `CFBundleURLTypes`                                                                      | Ein `VIEW`-/`BROWSABLE`-Intent-Filter auf der Activity                                                                             |
| `ios.supportsTablet`         | `true`, `false`                                       | `TARGETED_DEVICE_FAMILY`: `1,2` oder `1`                                                | —                                                                                                                                  |
| `ios.requiresFullScreen`     | `false`, `true`                                       | `UIRequiresFullScreen`: verzichtet auf iPad-Multitasking                                | —                                                                                                                                  |
| `ios.deploymentTarget`       | `16.0` oder neuer                                     | Das Deployment Target des Targets                                                       | —                                                                                                                                  |
| `linkDomains`                | keine, oder Domains wie `example.com`                 | Je ein `applinks:`-Eintrag im Associated-Domains-Entitlement                            | Ein verifizierter (`autoVerify`) `VIEW`-/`BROWSABLE`-Intent-Filter für `https` auf jedem Host ([Linking](linking.md#link-domains)) |
| `ios.associatedDomains`      | keine, oder Einträge wie `webcredentials:example.com` | Das Entitlement `com.apple.developer.associated-domains`, neben denen von `linkDomains` | —                                                                                                                                  |
| `ios.backgroundModes`        | keine, oder `audio`, `location`, `fetch`, ...         | `UIBackgroundModes`                                                                     | —                                                                                                                                  |
| `permissions.locationAlways` | keine, oder die Begründung, die iOS anzeigt           | `UIBackgroundModes` `location`, neben der Begründung                                    | Der Foreground-Service `KuitoLocationService` und `FOREGROUND_SERVICE_LOCATION` ([Standort](location.md#background-updates))      |
| `android.softInputMode`      | `resize`, `pan`                                       | —                                                                                       | `android:windowSoftInputMode` der Activity: `adjustResize` oder `adjustPan`                                                        |
| `android.minSdk`             | `26`, bis `35`                                        | —                                                                                       | Gradles `minSdk`                                                                                                                   |

Ein auf seinem Standard belassener Schlüssel schreibt nichts, die eigene Einstellung der Shell
bleibt also bestehen: die Ausrichtungen des Geräts, Hell oder Dunkel des Systems, die Statusleiste, die dem folgt. Der
`style` der Statusleiste benennt ihren Inhalt: `light` für einen dunklen Hintergrund. `StatusBar` ändert beides zur
Laufzeit; dies ist, womit die App startet. `portrait` lässt iPads weiterhin auf den Kopf
drehen, wie Apples Vorlagen es tun; auf dem iPad braucht eine App, die nicht jede Ausrichtung unterstützt, für
den App Store außerdem `ios.requiresFullScreen`.

`android.softInputMode` bleibt `resize`, es sei denn, die App weicht der Tastatur selbst aus. Die
Shell ist randlos, `adjustResize` ändert also keine Größe; es reicht die Insets der Tastatur
an die Views weiter, die fokussierte Eingaben von ihr freihalten ([Tastatur](keyboard.md#avoidance)).
`pan` lässt das System zusätzlich das ganze Fenster nach oben schieben, Inhalte bewegen sich also doppelt, sofern
die Vermeidung nicht abgeschaltet ist (`keyboard={{ inset: false }}`).

Nicht einstellbar: die Shell ist immer randlos (wie neue React-Native-Apps, und wie
Android 15 es verlangt), und Androids `targetSdk` ist das `compileSdk` des Frameworks, 35.

#### Info.plist-, Entitlements-, Manifest- und Theme-Einträge

Alles ohne typisierten Schlüssel bleibt Daten, nie eine native Datei oder ein XML-String:

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

| Schlüssel                          | Geschrieben nach                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ios.infoPlist`                    | Die generierte `Info.plist`. Werte sind Strings, Zahlen, Booleans, Arrays und Objekte.                 |
| `ios.entitlements`                 | Die generierte `KuitoIOS.entitlements`, das `CODE_SIGN_ENTITLEMENTS` des Targets.                     |
| `android.manifest.application`     | `<application>`-Attribute, benannt ohne `android:`.                                                    |
| `android.manifest.activity`        | Attribute der einen Activity der App, benannt ohne `android:`.                                         |
| `android.manifest.metaData`        | `<meta-data>` unter `<application>`.                                                                   |
| `android.manifest.usesPermissions` | `<uses-permission>`, neben denen, die `permissions` und Module hinzufügen.                             |
| `android.manifest.usesFeatures`    | `<uses-feature>`; `required` ist standardmäßig `true`.                                                 |
| `android.manifest.queries`         | `<queries>`: `packages` und `intents` (eine `action` und optionale `data`), für die Paketsichtbarkeit. |
| `android.manifest.intentFilters`   | `<intent-filter>`s auf der Activity: `actions`, `categories`, `data` und `autoVerify`.                 |
| `android.theme`                    | `<item>`s von `AppTheme`, nach Name, in seiner hellen wie in seiner Nachtvariante.                     |

Jeder Eintrag wird wie jeder andere Schlüssel geprüft: ein unbekannter Schlüssel, ein Name, der keiner ist, ein Wert,
der Markup enthält oder keine plist-Daten sind, schlägt mit dem Pfad des Schlüssels fehl.

**Ein Eigentümer pro Eintrag.** Jede Quelle von Einträgen durchläuft eine einzige Zusammenführung
(`src/cli/native-entries.ts`): die typisierten Schlüssel und `permissions` der Konfiguration, die Spezifikationen der
eingebundenen nativen Module (`ios.infoPlist`, `android.permissions`, ...), diese rohen Einträge und was die Shell selbst setzt. Zwei, die sich
bei einem Schlüssel widersprechen, lassen den Build fehlschlagen und werden beide genannt, etwa `Info.plist key UISupportedInterfaceOrientations
is set by both kuito.config.ts: orientation and kuito.config.ts: ios.infoPlist`. Ein roher Eintrag kann also
weder einem typisierten Schlüssel noch einem Modul widersprechen, und wovon der Code der Shell abhängt
(`UIApplicationSceneManifest`; `launchMode`, `exported` und `configChanges` der Activity; Label,
Symbol und Theme der Application), lässt sich gar nicht setzen. Zwei Ausnahmen: eine deklarierte
`permissions`-Begründung ersetzt den Standard eines Moduls für denselben Usage-Schlüssel, und Listenschlüssel, zu denen
mehrere Quellen beitragen (`UIBackgroundModes`, `LSApplicationQueriesSchemes`, `UIAppFonts`,
`BGTaskSchedulerPermittedIdentifiers`, Associated Domains), werden zusammengefügt.

Auf Android landen die rohen und typisierten Einträge im Manifest-Overlay, das Gradle über das der
Shell zusammenführt (`kuito.manifest`); ein Attribut, das auch das Manifest der Shell setzt, wird mit
`tools:replace` ersetzt, das das Overlay selbst hinzufügt. `AppTheme` wird nach
`.kuito/android/settings` generiert (`values` und `values-night`, `kuito.settingsRes`) und ersetzt das des
Frameworks.

### Umgebungen

Die Konfiguration selbst ist die Produktions-App. Eine Umgebung ist ein Name und die Schlüssel, die davon
abweichen; jeder andere Schlüssel wird geerbt, verschachtelte Schlüssel einzeln (`ios: { icon: { dark } }`
behält `ios.bundleIdentifier`; `buildNumber` kann für einen Staging-Upload abweichen; `permissions: { microphone }` fügt denen der Basis eine hinzu). Maps von Einträgen (`ios.infoPlist`,
`ios.entitlements`, `android.theme` sowie `application`, `activity` und
`metaData` von `android.manifest`) werden ebenfalls Schlüssel für Schlüssel zusammengeführt; eine Liste (`fonts`, `urlSchemes`,
`android.manifest.intentFilters`) wird als Ganzes ersetzt. `idSuffix` wird sowohl an die Bundle-ID als auch an die
applicationId angehängt, sodass jede Umgebung als eigene App neben den anderen installiert wird.

```sh
kuito dev ios                   # development
kuito dev ios --env staging     # MyApp Staging, com.example.myapp.staging
kuito build android             # production
```

`--env` wählt eine aus. `kuito dev` führt `development` aus und `kuito build` baut `production`, wenn
es nicht angegeben ist. Beide existieren immer und sind die Konfiguration, wie sie geschrieben steht, sofern nicht deklariert; jeder andere
Name muss unter `environments` deklariert werden. Namen bestehen aus Kleinbuchstaben, Ziffern und `-`.

Umgebungen sind Daten, kein Code: ein Objekt pro Umgebung, ein Fehler ist also ein Fehler, der
seinen Schlüssel nennt, und spätere Schlüssel werden ohne neue Mechanismen überschreibbar: das
`splash: { background }` einer Umgebung ändert die Farbe und behält das Logo. Die Umgebung ist nur eine Build-Einstellung; das JS der App sieht sie noch nicht.

### App-Symbole

Ein 1024×1024-PNG genügt. Bei jedem Build generiert die CLI, was jede Plattform braucht, nach
`.kuito/` (`src/cli/app-icons.ts`):

- **iOS**: `.kuito/ios/AppIcon.xcassets`, ein `AppIcon` in einer einzigen Größe von 1024 mit seiner dunklen und
  getönten Darstellung, wenn die Konfiguration sie hat. Xcode leitet jede andere Größe ab. iOS-Symbole sind
  deckend: ein Symbol mit Transparenz wird auf Weiß abgeflacht, und die Sitzung zeigt eine Warnung,
  die den Schlüssel nennt; ohne Alpha exportieren, um den Hintergrund selbst zu wählen.
- **Android**: `.kuito/android/res`: ein adaptives Symbol (`mipmap-anydpi-v26`) mit 108dp-Ebenen für
  Vordergrund, Hintergrund und Monochrom, und 48dp-Legacy-Symbole, die aus denselben
  Ebenen zusammengesetzt sind, in jeder Dichte von mdpi bis xxxhdpi. Ohne `adaptiveIcon` wird das ganze Symbol
  in die 72dp gezeichnet, die die Maske eines Launchers zeigt, über der eigenen Eckfarbe des Symbols, sodass kein Teil davon
  abgeschnitten wird; für Grafiken, die in den Rand hineinlaufen, `adaptiveIcon.foreground` setzen.

Die Quellen werden zuerst geprüft: jede muss ein PNG (nicht interlaced), quadratisch und mindestens 1024px sein,
sonst schlägt der Build fehl und nennt den Schlüssel. Die Bilder werden von einem kleinen
PNG-Codec auf `node:zlib` (`src/cli/png.ts`) dekodiert, neu abgetastet und kodiert, sodass kein Bildwerkzeug und kein Paket nötig ist und es
überall läuft, wo Gradle läuft. Die Generierung wird übersprungen, wenn sich seit dem letzten Build weder die Bytes der Quellen noch die Konfiguration
geändert haben (ein Stempel neben dem generierten Verzeichnis).

## Generierte Shells

`kuito dev` und `kuito build` laufen im Verzeichnis des Projekts und schreiben in dessen `.kuito/`:

- **iOS**: `.kuito/ios/project.json` ist eine XcodeGen-Spezifikation, die die
  `native/ios/project.yml` des Frameworks einbindet und das gebündelte JS und die Migrationen der App (`Resources/`), Bundle-ID, Anzeigename,
  Version, Build-Nummer, Info.plist-Einträge und Entitlements ([native Einstellungen](#native-settings)),
  den Symbolkatalog, den Katalog der importierten Bilder (`Assets.xcassets`, [Assets](assets.md)), den Startbildschirm (`Splash/`, [Splash-Screen](splash.md)), gebündelte Schriften (`fonts/`, aufgeführt in `UIAppFonts`), die Quellen der eingebundenen nativen
  Module und die generierte Link-Tabelle (`Generated/KuitoLink.swift`) hinzufügt; eingebundene Spezifikationen werden zusammengeführt, die
  Spezifikation des Frameworks wird also nicht bearbeitet. `KUITO_NATIVE` zeigt die eigenen Pfade der Framework-Spezifikation
  zurück nach `native/ios`. Hermes ist ein lokales Swift-Paket, `HermesEngine`, unter
  `KUITO_HERMES` (`~/.cache/kuito/hermes-ios-<version>`, siehe [die CLI](cli.md)); die
  Swift-Pakete der Module kommen dazu. xcodebuild baut `KuitoIOS.xcodeproj` und löst
  die Pakete selbst auf. Derived Data geht nach `.kuito/build/ios`.
- **Android**: Gradle baut das `native/android` des Frameworks mit `-Pkuito.applicationId`,
  `kuito.appName`, `kuito.assets` (das gebündelte JS, Schriften und Migrationen), `kuito.buildDir`, den `kuito.sources` und
  `kuito.dependencies` der nativen Module, `kuito.manifest` (die Berechtigungen, die die App und
  ihre Module deklarieren, der Hintergrund-Task-Service und jeder Manifest-Eintrag ihrer
  Einstellungen, zusammengeführt über das Manifest des Frameworks), `kuito.settingsRes` (das `AppTheme` der
  App), `kuito.versionName`, `kuito.versionCode`, `kuito.minSdk` (wenn angehoben) und
  `kuito.res` (das generierte Symbol, wenn es eines gibt), `kuito.splashRes` (die Ressourcen des Splash-Themes,
  wenn es eines gibt), `kuito.imagesRes` (die importierten Bilder, wenn die App welche
  importiert, [Assets](assets.md)) und
  `--project-cache-dir .kuito/android/.gradle`. Die Link-Tabelle wird ebenfalls generiert (`generated/dev/kuito/link/KuitoLink.kt`), das
  Projekt baut also nur über die CLI (`kuito build android`).

Jede App wird als eigene App installiert, neben anderen Kuito-Apps auf demselben Gerät.

## Native Module

`modules/<name>/` enthält die eigenen nativen Module einer App: die Spezifikation `<name>.ts`, `ios/*.swift`
und `android/*.kt`. `kuito module create <Name>` erstellt eines. Die CLI entdeckt sie neben
den eingebauten Modulen von Kuito, bindet in jede Shell nur die Module ein, die das Bundle der App aufruft, und
generiert die Link-Tabelle der Funktionen, die es aufruft, sodass niemand das Framework bearbeitet. Siehe
[native Module](native-modules.md#write-your-own-module).

Lifecycle-Hooks, Pakete von Drittanbieter-Modulen und `kuito prebuild` kommen später.
