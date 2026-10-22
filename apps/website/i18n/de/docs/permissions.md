# permissions

`permissions` prüft und fordert Laufzeitberechtigungen an, mit einem einheitlichen Statusmodell auf
iOS und Android. Module, die Gerätezugriff brauchen (Camera, Location, Image
Picker, Audioaufnahme, Notifications), fragen nativ darüber, sodass ein Status
in jedem Modul dasselbe bedeutet.

```tsx
import { app, permissions } from 'kuito';

const { status, canAskAgain } = await permissions.check('camera');

if (status === 'undetermined') await permissions.request('camera');
else if (status === 'denied' && !canAskAgain) await app.openSettings();
```

| Funktion        | Tut                                                                            |
| --------------- | ------------------------------------------------------------------------------ |
| `check(name)`   | Löst mit dem aktuellen Status auf, ohne Abfrage.                               |
| `request(name)` | Zeigt die Systemabfrage, wenn das System es tut, und löst mit der Antwort auf. |

`check` und `request` lösen mit `{ status, canAskAgain }` auf:

| `status`       | Bedeutung                                                                             |
| -------------- | ------------------------------------------------------------------------------------- |
| `granted`      | Die App hat Zugriff.                                                                  |
| `limited`      | Der Benutzer hat einen Teil davon erlaubt: eine Auswahl von Fotos.                    |
| `denied`       | Der Benutzer hat abgelehnt, oder eine Richtlinie (Kindersicherung, MDM) verbietet es. |
| `undetermined` | Die App hat noch nicht gefragt. `request` wird abfragen.                              |

`canAskAgain` ist `false`, wenn `request` die Abfrage nicht mehr anzeigen kann. Nur
der Benutzer kann die Antwort dann ändern, in den Einstellungen: Ihn mit
[`app.openSettings()`](app-state.md) dorthin schicken. Ist es `true`, fragt `request` entweder ab oder antwortet
sofort mit einem Status, der keine Abfrage braucht (`granted`).

Ein unbekannter Name wird mit `ERR_ARGUMENT` abgelehnt.

## Berechtigungsnamen

| Name             | iOS                                              | Android                                                                       |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `camera`         | `AVCaptureDevice` (Video)                        | `CAMERA`                                                                      |
| `microphone`     | `AVCaptureDevice` (Audio)                        | `RECORD_AUDIO`                                                                |
| `photos`         | `PHPhotoLibrary`, Lesen und Schreiben            | `READ_MEDIA_IMAGES` + `READ_MEDIA_VIDEO` (13+), `READ_EXTERNAL_STORAGE` (≤12) |
| `location`       | Bei Verwendung (`requestWhenInUseAuthorization`) | `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`                             |
| `locationAlways` | Immer (`requestAlwaysAuthorization`)             | `location`, dann `ACCESS_BACKGROUND_LOCATION` (10+)                           |
| `notifications`  | Hinweise, Kennzeichen und Töne                   | `POST_NOTIFICATIONS` (13+), der Benachrichtigungsschalter der App (≤12)       |

`locationAlways` ist der Standort, während die App im Hintergrund ist, für
[Hintergrund-Updates](location.md#background-updates). Es fragt zuerst nach `location`,
wenn die App es noch nicht hat: iOS bietet "Bei Verwendung" in derselben
Abfrage an, und Android 11 und neuer nehmen Hintergrundzugriff erst, wenn der Vordergrundzugriff
gewährt ist, sodass `request` die Vordergrundabfrage zeigt, dann die
Hintergrundabfrage (Androids ist die Standortseite der App in den Einstellungen). Auf
Android 9 und älter ist `locationAlways` gleich `location`.

## Unterschiede zu Expo

Kuito folgt den Statuswerten von Expo und seinem `canAskAgain`, mit diesen bewussten
Unterschieden:

- **Ein Modul, Namen als Argumente.** Expo verteilt Berechtigungen über jedes
  Modul (`Camera.requestCameraPermissionsAsync()`). Kuito hat ein einziges
  `permissions`-Modul, und die Gerätemodule nutzen es nativ. App-Code
  muss die Kamera nicht importieren, um nach der Kamera zu fragen.
- **`limited` ist ein Status.** Expo meldet eine Fotoauswahl als `granted` mit
  `accessPrivileges: 'limited'`. Eine teilweise Gewährung verhält sich anders als eine
  vollständige, also macht Kuito sie zu einem eigenen Status.
- **Kein `granted`-Boolean und kein `expires`.** `status === 'granted'` sagt
  dasselbe. Laufzeitberechtigungen laufen nicht ab.
- **Ungefährer Standort und vorläufige Benachrichtigungen sind `granted`,** wie in
  Expo. [Location](location.md) meldet die Genauigkeit in `coords.accuracy` jeder
  Positionsbestimmung; sie ist eine Eigenschaft der Positionsbestimmung, nicht der Berechtigung.

## Plattformhinweise

- **iOS fragt einmal.** Nach einer Ablehnung ist `canAskAgain` `false`, und nur
  die Einstellungen können es ändern. `limited`-Fotozugriff behält `canAskAgain: true`.
- **Android kann nach einer Ablehnung erneut fragen.** Die zweite Ablehnung ist endgültig
  (`canAskAgain: false`). Android meldet "nie gefragt" und "endgültig abgelehnt"
  auf dieselbe Weise, also merkt sich Kuito, welche Berechtigungen es angefragt hat. Ein Fall
  rutscht durch, wie auch in Expo: Die Abfrage ohne Antwort zu schließen
  oder die Fotoauswahl von Android 14 ohne Auswahl zu schließen, liest sich als endgültige
  Ablehnung, obwohl Android erneut fragen würde.
- **Ausgewählte Fotos unter Android 14** sind `limited`. Ein erneutes Anfordern von `photos`
  zeigt die Abfrage, damit der Benutzer die Auswahl ändern kann.
- **iOS bietet "Immer" einmal an.** Mit gewährtem "Bei Verwendung" ist `locationAlways`
  `undetermined`, bis `request` die Erweiterung anbietet, und `denied` mit
  `canAskAgain: false`, nachdem der Benutzer bei "Bei Verwendung" bleibt. Aus einem
  unbestimmten Status gibt die Wahl von "Beim Verwenden der App erlauben" iOS'
  vorläufiges "Immer": `granted`, bis iOS den Benutzer erneut fragt, wenn die App
  den Standort zum ersten Mal im Hintergrund verwendet.
- **Android 12 und älter haben keine Benachrichtigungsberechtigung.** `notifications`
  ist `granted`, wenn die Benachrichtigungen der App an sind, und andernfalls `denied`
  mit `canAskAgain: false`.

## In kuito.config.ts deklarieren

Eine App listet die Berechtigungen, die sie verwendet, in [`kuito.config.ts`](apps.md#kuitoconfigts),
jede mit dem Grund, den iOS in seiner Abfrage zeigt:

```ts
export default {
  name: 'Reel',
  ios: { bundleIdentifier: 'com.example.reel' },
  android: { applicationId: 'com.example.reel' },
  permissions: {
    camera: 'Scan tickets at the door.',
    location: 'Find screenings near you.',
    notifications: true,
  },
} satisfies KuitoConfig;
```

Die CLI schreibt genau diese in die Shells, die sie generiert:

- **iOS**: jeden Grund unter seinem `Info.plist`-Schlüssel: `NSCameraUsageDescription`,
  `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`,
  `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription` oder
  `NSFaceIDUsageDescription`.
  Benachrichtigungen brauchen keinen Grund, daher ist ihr Wert `true`.
- **Android**: die Laufzeitberechtigungen aus der Tabelle oben, plus
  `USE_BIOMETRIC` für `biometrics`, in einem Manifest unter
  `.kuito/android/AndroidManifest.xml`, das Gradle über das des
  Frameworks (`kuito.manifest`) zusammenführt.

`biometrics` ist nur eine Deklaration, kein Name, den `check` oder `request`
annimmt: Das System fragt nach Face ID, wenn
[`secureStore`](secure-store.md#authentication) es zum ersten Mal verwendet.

Eine Berechtigung, die die Konfiguration nicht deklariert, kann nicht gewährt werden. iOS beendet eine App,
die ohne Verwendungstext fragt, also vor dem Aufruf von `request` deklarieren.
Android verweigert eine nicht deklarierte Berechtigung ohne Abfrage. Ein falsch geschriebener
Name oder ein leerer Grund lässt den Build mit einem Fehler fehlschlagen, der den Schlüssel nennt.

`locationAlways` braucht auch `location` deklariert: iOS zeigt zuerst den Grund für
"Bei Verwendung". Es zu deklarieren schaltet außerdem
[Standort-Updates im Hintergrund](location.md#background-updates) ein.

Die Demo-App dieses Checkouts deklariert jede Berechtigung, damit jede Demo nach
ihrer eigenen fragen kann (`demo/kuito.config.ts`). Wird `native/android` ohne die CLI in Android
Studio geöffnet, wird es ohne jede gebaut.

## Aus einem anderen Modul

Ein Modul, das eine Berechtigung braucht, fragt über den nativen Helfer und ruft
die System-API nicht selbst auf:

```swift
// iOS. Call on the main thread; the completion runs there too.
KuitoPermissions.request(.camera) { response in
    guard response.status == .granted else {
        return promise.reject("ERR_PERMISSION", "Camera access is \(response.status.rawValue)")
    }
    // …
}
```

```kotlin
// Android. Call on the main thread; the completion runs there too.
KuitoPermissions.request(context.activity, KuitoPermission.CAMERA) { response ->
    if (response.status != KuitoPermissionStatus.GRANTED)
        return@request promise.reject("ERR_PERMISSION", "Camera access is ${response.status.wire}")
    // …
}
```

Um eine Berechtigung hinzuzufügen, ihren Namen zu `PermissionName` in
`src/native/permissions.ts` hinzufügen, einen Fall zu `KuitoPermission` und eine Quelle zur
Tabelle in `KuitoPermissions.swift`, sowie eine Zeile zu `KuitoPermission.kt`. Dann
sie deklarierbar machen: ein Schlüssel in `KuitoPermissions` (`src/cli/kuito-config.ts`)
mit seiner Prüfung, seinem `Info.plist`-Schlüssel und Manifest-Einträgen in der Tabelle in
`src/cli/shells.ts`, und ein Grund in `demo/kuito.config.ts`.
`test/native-modules.test.ts` und `test/cli-shell.test.ts` schlagen fehl, bis jeder
Teil sie hat.
