# App-Projekte

Eine mit `kuito create` erstellte App enthält nur TypeScript und Konfiguration. Alles Native liegt im Framework, und die CLI generiert und baut die nativen Shells jeder App bei Bedarf.

```text
MyApp/
  app/                 the app: file-based routes
  assets/              icon.png and icon-staging.png, the app icons; splash.png
  modules/             the app's own native modules
  kuito.config.ts      native settings: name, ids, icon, environments
  package.json         one dependency: kuito
  .kuito/              generated shells and builds; never committed
```

Die App committet kein `ios/`- oder `android/`-Projekt. `kuito` ist ihre einzige Abhängigkeit, und die Shells werden bei jedem Build aus dem installierten Framework neu generiert, sodass eine neue Version neue Shells bringt.

## kuito.config.ts

`kuito.config.ts` ist die einzige native Eingabe. Jeder `kuito`-Befehl, der eine App baut oder ausführt, braucht eine im Verzeichnis, in dem er läuft, und schlägt ohne sie fehl.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  version: '1.2.0',
  buildNumber: 14,
  icon: './assets/icon.png',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
} satisfies KuitoConfig;
```

| Schlüssel                                       | Wirkung                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `name`                                          | Der Name unter dem App-Symbol.                                                                   |
| `version`                                       | Was Benutzer sehen. Bis zu drei Zahlen. `1.0.0`.                                                 |
| `buildNumber`                                   | Wonach die Stores Uploads ordnen. Pro Upload erhöhen. `1`.                                       |
| `icon`                                          | Das App-Symbol auf beiden Plattformen: ein quadratisches PNG von mindestens 1024x1024. Optional. |
| `ios.bundleIdentifier`, `android.applicationId` | Reverse-DNS-IDs (`com.example.app`); was `kuito dev` installiert und startet.                    |

Andere Schlüssel haben eigene Seiten: `permissions` ([Berechtigungen](../../../../docs/permissions.md#declare-them-in-kuitoconfigts)), `backgroundTasks` ([Hintergrundaufgaben](../../../../docs/background-tasks.md)), `fonts` ([Schriften](../../../../docs/fonts.md#bundle-fonts)), `migrations` ([Speicher](../../../../docs/storage.md#migrations)) und `splash` ([Splash-Screen](../../../../docs/splash.md)).

Die CLI prüft die Datei: ein fehlender oder unbekannter Schlüssel, eine fehlerhafte ID, ein Symbol, das kein `.png`-Pfad ist, oder eine fehlerhafte Farbe ist ein Fehler, der Datei und Schlüssel nennt. Bildpfade sind relativ zu `kuito.config.ts`.

## Native Einstellungen

Was sonst das Bearbeiten von `Info.plist`, Entitlements, `AndroidManifest.xml` oder einem Theme bedeuten würde, ist ein Schlüssel in der Konfiguration. Typisierte Schlüssel kommen zuerst: ein Wert, in die eigene Einstellung jeder Plattform geschrieben. Ein Schlüssel auf seinem Standard schreibt nichts, sodass die eigene Einstellung der Shell gilt.

```ts
export default {
  // ...
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#101418',
  statusBar: { style: 'light' },
  urlSchemes: ['myapp'],
  linkDomains: ['example.com'],
} satisfies KuitoConfig;
```

Alles ohne typisierten Schlüssel ist weiterhin Daten, nie eine native Datei oder ein XML-String: `ios.infoPlist`, `ios.entitlements`, `android.manifest` und `android.theme`. Jede Quelle von Einträgen durchläuft einen Merge; zwei, die sich bei einem Schlüssel widersprechen, lassen den Build fehlschlagen und nennen beide, sodass ein roher Eintrag keinem typisierten Schlüssel und keinem Modul widersprechen kann.

## Umgebungen

Die Konfiguration selbst ist die Produktions-App. Eine Umgebung ist ein Name und die Schlüssel, die davon abweichen; jeder andere Schlüssel wird geerbt, verschachtelte Schlüssel einzeln. Eine Liste (`fonts`, `urlSchemes`, `android.manifest.intentFilters`) wird als Ganzes ersetzt. `idSuffix` hängt sich an Bundle-ID und applicationId an, sodass jede Umgebung als eigene App neben den anderen installiert wird.

```ts
export default {
  // ...
  environments: {
    staging: {
      name: 'MyApp Staging',
      idSuffix: '.staging',
      icon: './assets/icon-staging.png',
    },
  },
} satisfies KuitoConfig;
```

```sh
kuito dev ios                   # development
kuito dev ios --env staging     # MyApp Staging, com.example.myapp.staging
kuito build android             # production
```

`--env` wählt eine. `kuito dev` führt `development` aus und `kuito build` baut `production`, wenn keine angegeben ist; jeder andere Name muss unter `environments` deklariert sein. Die Umgebung ist nur eine Build-Einstellung; das JS der App sieht sie noch nicht.

## Native Module

`modules/<name>/` enthält die eigenen nativen Module einer App: die Spezifikation `<name>.ts`, `ios/*.swift` und `android/*.kt`. `kuito module create <Name>` erstellt eines. Die CLI nimmt in jede Shell nur die Module auf, die das Bundle der App aufruft, sodass niemand das Framework bearbeitet ([native Module](../../../../docs/native-modules.md#write-your-own-module)).

## Vertiefung

[App-Projekte](../../../../docs/apps.md) behandelt jeden Konfigurationsschlüssel, die vollständige Tabelle der nativen Einstellungen, rohe `Info.plist`- und Manifest-Einträge, die Generierung des App-Symbols und was die generierten Xcode- und Gradle-Shells enthalten.
