# location

Position, Ausrichtung und Adressen des Geräts. Auf iOS ist das Core Location; auf
Android der `LocationManager` der Plattform, der `Geocoder` und der
Rotationsvektorsensor. Nichts davon braucht Play Services, das Modul fügt der App
also keine Abhängigkeit hinzu. Die Funkmodule laufen nur, solange eine Anfrage
wartet oder ein Watch läuft.

```tsx
import { Text, location, permissions } from 'kuito';

const { status } = await permissions.request('location');

if (status === 'granted') {
  const here = await location.current({ accuracy: 'high' });
  const [place] = await location.reverseGeocode(here.coords);
}

function Here() {
  // Locates while Here is mounted; the fixes land in location.position.
  location.watch({ distanceInterval: 20 });

  return <Text>{`${location.position.value?.coords.latitude ?? '…'}`}</Text>;
}
```

| Mitglied                                  | Ist                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `current({ accuracy? })`                  | Ein frischer Fix.                                                                                    |
| `last({ maxAge?, requiredAccuracy? })`    | Der Fix, den die Plattform zuletzt hatte, sofort, oder `null`, wenn keiner die Grenzen erfüllt.      |
| `watch(options?)`                         | Ortet nach `position`, solange sein Gültigkeitsbereich besteht; gibt sein Abonnement zurück.         |
| `position`                                | Ein Signal: der neueste Fix, den ein Watch geliefert hat, oder `null`.                               |
| `error`                                   | Ein Signal: der Fehler, der einen Watch beendet hat, oder `null`, solange keiner beendet wurde.      |
| `watchHeading(callback)`                  | Ruft `callback(heading)` auf, während sich das Gerät dreht, bis `remove()`.                          |
| `geocode(address)`                        | Die Positionen einer Adresse.                                                                        |
| `reverseGeocode({ latitude, longitude })` | Die Orte an einer Position, nächstgelegene zuerst.                                                   |
| `servicesEnabled()`                       | Ob die Ortungsdienste für das Gerät eingeschaltet sind.                                              |
| `defineUpdates(name, task)`               | Der Task, der die Fixes der Hintergrundaktualisierungen erhält. Auf Modulebene aufrufen.             |
| `startUpdates(name, options?)`            | Ortet auch im Hintergrund, für den Task, bis `stopUpdates(name)`.                                    |
| `stopUpdates(name)`                       | Stoppt die Aktualisierungen des Tasks.                                                               |
| `updating(name)`                          | Ob die Aktualisierungen des Tasks laufen oder beim nächsten Start der App wieder aufgenommen werden. |

`maxAge` ist in Millisekunden und `requiredAccuracy` in Metern angegeben. `watch`
in einer Komponente startet, wenn die Komponente gemountet wird, und stoppt, wenn
sie unmountet wird; andernorts stoppt es das `remove()` des Abonnements. Ein
Watch, den die Plattform ablehnt, setzt `error` und lässt nichts laufen.
`watchHeading` löst sein Abonnement erst auf, sobald der Kompass gestartet ist,
ein Gerät ohne Kompass lehnt daher ab.

## Berechtigung

Jede Funktion außer `geocode`, `watchHeading`, `servicesEnabled` sowie `stop` und
`has` der Hintergrundaktualisierungen braucht die Berechtigung `location`, und
das Modul fragt nie selbst nach. Mit
[`permissions.request('location')`](permissions.md) anfragen; ohne sie lehnt ein
Aufruf mit `ERR_PERMISSION` ab. Ein ungefährer Standort gilt als gewährt, wie in
Expo: die `accuracy` des Fix sagt, wie genau er ist.

Das Modul deklariert in den
[nativen Anforderungen](native-modules.md#native-needs) seiner Spezifikation, was
es anfragt, sodass eine App, die `location` importiert,
`NSLocationWhenInUseUsageDescription` sowie Androids `ACCESS_FINE_LOCATION` und
`ACCESS_COARSE_LOCATION` mitliefert, und eine App, die das nicht tut, keines
davon. Die Begründung, die iOS anzeigt, gehört in `kuito.config.ts`; sie ersetzt
die generische des Moduls:

```ts
permissions: { location: 'Find screenings near you.' },
```

[Hintergrundaktualisierungen](#background-updates) brauchen zusätzlich ein
deklariertes `locationAlways`.

## Genauigkeit

| `accuracy`            | iOS `desiredAccuracy`                  | Android-Provider, in Reihenfolge |
| --------------------- | -------------------------------------- | -------------------------------- |
| `lowest`              | `kCLLocationAccuracyThreeKilometers`   | network, gps                     |
| `low`                 | `kCLLocationAccuracyKilometer`         | network, gps                     |
| `balanced` (Standard) | `kCLLocationAccuracyHundredMeters`     | network, gps                     |
| `high`                | `kCLLocationAccuracyNearestTenMeters`  | gps, network                     |
| `highest`             | `kCLLocationAccuracyBest`              | gps, network                     |
| `bestForNavigation`   | `kCLLocationAccuracyBestForNavigation` | gps, network                     |

Ein Watch nutzt den ersten Provider, den das Gerät eingeschaltet hat. Ein
einzelner Fix fragt die eingeschalteten Provider der Reihe nach bis zum GPS an
und nimmt den ersten Fix: der Netzwerk-Provider kann eingeschaltet sein, ohne
etwas zu melden (kein WLAN und keine Mobilfunkdaten, ein Emulator), und ein
GPS-Fix ist für jede Anfrage genau genug. Der `fused`-Provider der Plattform wird
nicht verwendet: über den `LocationManager` fragt er Googles Fused-Dienst nach
einem Fix mit ausgewogenem Energieverbrauch, den dieser allein aus der
Netzwerkortung beantwortet. Sind alle Provider aus, lehnt Android mit
`ERR_SERVICES_DISABLED` ab; iOS meldet ausgeschaltete Dienste als verweigerte
Berechtigung.

## Überwachen

```ts
{ accuracy?: LocationAccuracy, timeInterval?: number, distanceInterval?: number }
```

`distanceInterval` sind die Meter, die sich das Gerät bewegt, bevor die nächste
Aktualisierung kommt (0, der Standard, ist jeder Fix). `timeInterval` ist die
Mindestzeit zwischen Aktualisierungen in Millisekunden, standardmäßig 1000; es
gilt nur für Android, da iOS Fixes liefert, sobald sie eintreffen. Jeder Watch
hat seine eigene Anfrage auf der Plattform, zwei Watches behalten also ihre
eigenen Optionen, und der letzte, der endet, oder ein Neuladen, stoppt die
Funkmodule.

`location.error` enthält den Fehler, der einen Watch beendet. Auf iOS ist das ein
während der Laufzeit der App entzogener Zugriff (`ERR_PERMISSION`); ein Fix, den
die Plattform noch nicht ermitteln kann, ist kein Fehler, und der Watch versucht
es weiter. Android beendet den Prozess der App, wenn der Zugriff entzogen wird,
ein Watch endet dort also nicht mit einem Fehler.

## Hintergrundaktualisierungen

Ein Standort-Task erhält weiter Fixes, während die App im Hintergrund ist, und
über ihre Neustarts hinweg. Er ist ein
[Hintergrund-Task](background-tasks.md), den die Plattform mit jedem Stapel von
Fixes ausführt, in der UI-Laufzeitumgebung der App, wenn diese läuft, und in
einer Headless-Laufzeitumgebung, wenn nicht.

```tsx
import { location, permissions } from 'kuito';

// At module scope: a background launch runs the app's modules, not its UI.
location.defineUpdates('run', async ({ locations }) => {
  await saveTrack(locations);
});

async function startRun() {
  const { status } = await permissions.request('location');

  if (status === 'granted')
    await location.startUpdates('run', {
      accuracy: 'high',
      distanceInterval: 10,
      notification: { title: 'Recording your run' },
    });
}
```

```ts
// kuito.config.ts
permissions: {
  location: 'Map your runs.',
  locationAlways: 'Record your runs with the screen off.',
},
```

`startUpdates` nimmt [die Optionen von `watch`](#watching) und diese:

| Option                             | Plattform | Bewirkt                                                                                                                         |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pausesUpdatesAutomatically`       | iOS       | Lässt Core Location die Aktualisierungen pausieren, während das Gerät an Ort und Stelle bleibt. Standardmäßig aus, wie in Expo. |
| `showsBackgroundLocationIndicator` | iOS       | Zeigt die blaue Pille in der Statusleiste, während die App im Hintergrund ortet.                                                |
| `notification: { title?, body? }`  | Android   | Die Benachrichtigung des Foreground-Service. Standardmäßig der Name der App und eine generische Zeile.                          |

Der Task erhält `{ name, deadline, locations }`: die Fixes des Stapels, älteste
zuerst, und wann die Plattform aufhört, auf den Lauf zu warten, in Millisekunden
seit der Epoche. Auflösen, wenn sie verarbeitet sind; ein Task, der wirft oder
ablehnt, meldet einen fehlgeschlagenen Lauf an die LogBox oder das
Geräteprotokoll, und die Aktualisierungen gehen weiter. Ein Lauf kommt mit jedem
Fix, den Task also kurz halten oder die Arbeit über mehrere Läufe bündeln.
`startUpdates` für einen Namen, den `defineUpdates` nicht definiert hat, lehnt
sofort ab. Einen Task erneut zu starten ersetzt seine Optionen.

**Ein deklariertes `locationAlways` schaltet es ein.** Die CLI fügt der
Info.plist den Hintergrundmodus `location` hinzu, und auf Android den
Foreground-Service `KuitoLocationService` (Typ `location`) mit
`FOREGROUND_SERVICE` und `FOREGROUND_SERVICE_LOCATION`. Ohne die Deklaration
lehnt `startUpdates` mit `ERR_UNDECLARED` ab: iOS beendet eine App, die ohne den
Modus im Hintergrund ortet. Die Prüfungen von App Store und Google Play fragen,
wofür die App die Hintergrundortung nutzt, also nur in einer App deklarieren,
die sie nutzt.

**Berechtigungen.** Aktualisierungen starten mit der Berechtigung `location`,
wie in Expo, aus dem Vordergrund: iOS ortet dann im Hintergrund weiter mit dem
blauen Indikator, Android mit seiner Benachrichtigung. `locationAlways` geht
weiter: auf iOS ohne den Indikator und, dort, mit dem Neustart der App, nachdem
sie beendet wurde (unten). Android 12 und neuer verweigern das Starten eines
Foreground-Service aus dem Hintergrund, `startUpdates` lehnt dort also mit
`ERR_UNAVAILABLE` ab; aus einer Aktion des Benutzers heraus starten.

**Neustarts.** Die Plattform behält die gestarteten Tasks über Starts hinweg,
und `defineUpdates` nimmt die Aktualisierungen eines Tasks wieder auf, wenn die
Module der App erneut laufen, bis `stopUpdates`. Eine entzogene Berechtigung
stoppt sie endgültig.

- **iOS**: Die Aktualisierungen stoppen, wenn die App beendet wird. Mit
  gewährtem `locationAlways` achtet iOS zusätzlich auf wesentliche Änderungen
  (etwa 500 m) und startet die App für eine solche ohne UI neu; die Shell
  startet eine Headless-Laufzeitumgebung, die Definition des Tasks nimmt die
  Aktualisierungen wieder auf, und Läufe folgen. Ohne es werden die
  Aktualisierungen wieder aufgenommen, wenn der Benutzer die App das nächste
  Mal öffnet.
- **Android**: Der Foreground-Service ist sticky. Beendet Android den Prozess
  der App, startet es den Service neu, und der erste Fix startet eine
  Headless-Laufzeitumgebung. Der Service stoppt mit dem letzten Task, und wenn
  der Benutzer die App über die Einstellungen stoppt.

Während die UI läuft, gehen die Läufe an ihre Laufzeitumgebung; eine für sie
gestartete Headless-Laufzeitumgebung bleibt zwischen Fixes bestehen, und die UI
übernimmt die Läufe, sobald sie sich öffnet. Das Ergebnis jedes Laufs erreicht
das Geräteprotokoll nur, wenn er fehlschlägt.

## Werte

```ts
// A fix: current, last, position
{
  coords: {
    latitude: number, longitude: number,
    altitude: number | null, accuracy: number | null, altitudeAccuracy: number | null,
    heading: number | null, speed: number | null,
  },
  timestamp: number, // ms since the epoch
  mocked: boolean,
}

// watchHeading
{ trueHeading: number | null, magHeading: number, accuracy: number }
```

Ein Feld, das die Plattform nicht kennt, ist `null`: keine Höhe ohne vertikalen
Fix, kein `heading` und kein `speed` im Stillstand. `mocked` ist ein simulierter
Standort: der des iOS-Simulators oder der einer Mock-Location-App auf Android.
`adb emu geo fix` des Emulators erreicht die App als echter GPS-Fix.

Die `accuracy` der Ausrichtung unterscheidet sich wie in Expo: Grad Abweichung
auf iOS, die Kalibrierung des Kompasses von 0 (keine) bis 3 (hoch) auf Android.
Android leitet `trueHeading` aus der magnetischen Ausrichtung und der Deklination
am letzten bekannten Fix ab, es ist also `null`, bis es einen gibt; iOS meldet
es so, wie Core Location es tut. Ein Gerät ohne Kompass (der iOS-Simulator)
lehnt `watchHeading` mit `ERR_UNAVAILABLE` ab.

`geocode` löst für jeden Treffer `{ latitude, longitude, altitude, accuracy }`
auf; Androids Geocoder liefert weder Höhe noch Genauigkeit. `reverseGeocode`
löst Adressen auf:

| Feld               | iOS (`CLPlacemark`)     | Android (`Address`)   |
| ------------------ | ----------------------- | --------------------- |
| `name`             | `name`                  | `featureName`         |
| `streetNumber`     | `subThoroughfare`       | `subThoroughfare`     |
| `street`           | `thoroughfare`          | `thoroughfare`        |
| `district`         | `subLocality`           | `subLocality`         |
| `city`             | `locality`              | `locality`            |
| `subregion`        | `subAdministrativeArea` | `subAdminArea`        |
| `region`           | `administrativeArea`    | `adminArea`           |
| `postalCode`       | `postalCode`            | `postalCode`          |
| `country`          | `country`               | `countryName`         |
| `isoCountryCode`   | `isoCountryCode`        | `countryCode`         |
| `timezone`         | `timeZone`              | `null`                |
| `formattedAddress` | `null`                  | die erste Adresszeile |

Beide Geocoder sind Onlinedienste mit Ratenbegrenzung: bei einer Aktion des
Benutzers geocodieren, nicht bei jedem Fix. Eine Adresse ohne Treffer löst `[]`
auf. Androids Geocoder ist Teil der Systemdienste von Google; ein Gerät ohne
sie (manche AOSP-Builds) lehnt mit `ERR_UNAVAILABLE` ab.

## Fehler

| Code                       | Bedeutung                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_PERMISSION`           | Die App hat die Berechtigung `location` nicht.                                                                                              |
| `ERR_SERVICES_DISABLED`    | Android: jeder Standort-Provider ist aus.                                                                                                   |
| `ERR_LOCATION_UNAVAILABLE` | iOS: Core Location konnte keinen Fix ermitteln.                                                                                             |
| `ERR_UNAVAILABLE`          | Kein Kompass für `watchHeading`, kein Geocoder auf Android, oder Hintergrundaktualisierungen aus dem Hintergrund gestartet auf Android 12+. |
| `ERR_GEOCODE`              | Der Geocoder ist fehlgeschlagen: offline oder ratenbegrenzt.                                                                                |
| `ERR_UNDECLARED`           | Hintergrundaktualisierungen ohne deklariertes `locationAlways`.                                                                             |

Ungültige Optionen (eine unbekannte `accuracy`, ein negatives Intervall, ein
Breitengrad jenseits von ±90) werfen einen `TypeError` als Ablehnung, bevor
irgendetwas die Plattform erreicht.

## Unterschiede zu Expo

- **Berechtigungen liegen in `permissions`.** Expos
  `requestForegroundPermissionsAsync` ist `permissions.request('location')`,
  und `requestBackgroundPermissionsAsync` ist
  `permissions.request('locationAlways')`, für jedes Modul auf dieselbe Weise
  ([warum](permissions.md#differences-from-expo)).
- **Standort-Tasks werden in `location` definiert.** Expos
  `TaskManager.defineTask(name, ({ data: { locations } }) => …)` ist
  `location.defineUpdates(name, ({ locations }) => …)`: typisierte Fixes, kein
  `data` zum Auspacken, und ein `error` ist ein fehlgeschlagener Lauf statt
  eines Arguments. Expos `deferredUpdatesInterval`, `deferredUpdatesDistance`
  und `activityType` gibt es noch nicht.
- **Namen lassen `Async` und `get` weg, die Position ist ein Signal, und die
  Genauigkeit ist ein String.** `getCurrentPositionAsync` ist `current`,
  `watchPositionAsync` ist `watch` und `position`; `Accuracy.High` ist `'high'`.
- **Keine Play Services auf Android.** Expo nutzt Googles
  `FusedLocationProviderClient`, rund ein Megabyte Abhängigkeit. Die Provider
  der Plattform liefern auf einem Telefon mit GPS dieselben Fixes; in
  Innenräumen ohne WLAN-Scanning kann ein `high`-Fix länger brauchen. `current`
  wartet auf den ersten Fix, den der Provider liefert, ohne eigenes Timeout.

## Noch nicht

- **Geofencing** (`startGeofencingAsync`) und `enableNetworkProviderAsync`.
