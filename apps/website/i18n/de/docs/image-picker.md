# mediaPicker

Der Foto-Picker und die Kamera des Systems, für Bilder und Videos:
`PHPickerViewController` und `UIImagePickerController` auf iOS, der Photo
Picker (`PickVisualMedia`) und die System-Kamera-App auf Android.

```tsx
import { Image, mediaPicker } from 'kuito';

const result = await mediaPicker.pick({ selectionLimit: 0, maxWidth: 1600 });

if (!result.canceled) photo.value = result.assets[0].uri;

<Image src={{ uri: photo.value }} aspectRatio={1.5} />;
```

`pick(options?)` und `capture(options?)` lösen
`{ canceled: true, assets: null }` auf, wenn der Nutzer den Picker schließt,
ohne etwas auszuwählen, und andernfalls `{ canceled: false, assets }`. Jedes
Asset ist:

| Feld       | Bedeutung                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------ |
| `uri`      | Eine `file://`-URI im Cache-Verzeichnis der App. `<Image src>` und `fileSystem` lesen sie. |
| `width`    | In Pixeln, aufrecht: Die EXIF-Ausrichtung ist bereits angewendet.                          |
| `height`   | In Pixeln, aufrecht.                                                                       |
| `type`     | `'image'` oder `'video'`.                                                                  |
| `mimeType` | `image/jpeg` oder `image/png` für Bilder; der eigene Typ der Datei für Videos.             |
| `fileName` | Der Name der Mediathek dafür, mit der geschriebenen Erweiterung (siehe unten).             |
| `fileSize` | In Bytes, der Datei unter `uri`.                                                           |
| `duration` | Nur Videos, in Millisekunden.                                                              |

| Option           | Standard   | Bedeutung                                                                                                               |
| ---------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `mediaTypes`     | `'images'` | `'images'`, `'videos'` oder beide als Liste.                                                                            |
| `selectionLimit` | `1`        | Nur Mediathek. Wie viele Assets der Nutzer auswählen darf; `0` für das Limit des Systems.                               |
| `quality`        | `1`        | JPEG-Qualität der geschriebenen Bilder, 0 bis 1.                                                                        |
| `maxWidth`       | keiner     | Bilder, die breiter sind als dies, in Pixeln, werden passend verkleinert, unter Beibehaltung ihres Seitenverhältnisses. |
| `maxHeight`      | keiner     | Dasselbe für die Höhe. Beide zusammen passen das Bild in die Box ein.                                                   |
| `allowsEditing`  | `false`    | Nur iOS: Der System-Editor schneidet das Bild zu (oder kürzt das Video), bevor der Aufruf aufgelöst wird.               |

Eine Option außerhalb ihres Bereichs wirft beim Aufruf einen `TypeError`,
bevor ein Picker geöffnet wird: eine `quality` außerhalb von 0 bis 1, ein
negatives oder gebrochenes `selectionLimit`, ein unbekanntes oder leeres
`mediaTypes`, eine Größe, die keine positive Zahl ist, oder `allowsEditing`
mit einem `selectionLimit` ungleich 1. `maxWidth` und `maxHeight` gehen über
Expo hinaus, das keine Größenänderung hat.

## Was im Cache landet

Ausgewählte und aufgenommene Medien werden nach `ImagePicker/` im
Cache-Verzeichnis der App (`fileSystem.cache`) geschrieben, abseits des
Main-Threads, ein Asset nach dem anderen:

- **Bilder werden neu kodiert.** Dekodiert in der kleinsten Größe, die
  `maxWidth` und `maxHeight` abdeckt, aufrecht gedreht und als JPEG mit
  `quality` geschrieben. Ein Bild mit Transparenz wird stattdessen als PNG
  geschrieben, und `quality` gilt nicht. EXIF-Metadaten, einschließlich
  Standort, werden nicht kopiert. HEIC aus der iOS-Mediathek wird zu JPEG,
  damit die Datei überall funktioniert.
- **Videos werden unverändert kopiert.** Kein Transcoding; `width` und
  `height` berücksichtigen die Rotation der Spur.

Das System kann den Cache leeren, wenn der Speicher knapp wird. Ein Asset, das
die App behält, nach `fileSystem.documents` verschieben
([fileSystem](file-system.md)).

## Berechtigungen

Die Auswahl aus der Mediathek braucht auf keiner der beiden Plattformen eine
Berechtigung: Beide Picker laufen außerhalb des Prozesses und übergeben nur,
was der Nutzer auswählt.

`capture` fragt zuerst über [permissions](permissions.md) nach der
Berechtigung `camera` und weist mit `ERR_PERMISSION` zurück, wenn sie nicht
erteilt wird. Auf Android geschieht das nur, wenn die App die
Kameraberechtigung deklariert (`permissions: { camera: … }` in
`kuito.config.ts`): Die System-Kamera-App braucht keine, aber Android
verweigert den Intent einer App, die sie deklariert, ohne sie zu haben.

Das Modul liefert `NSCameraUsageDescription` und `NSMicrophoneUsageDescription`
(Video nimmt Ton auf) in seiner Spezifikation,
`native/modules/image-picker/image-picker.ts`. Die Begründungen
`permissions.camera` und `permissions.microphone` der App ersetzen sie.

## Plattformunterschiede

|                         | iOS                                  | Android                                                                                                      |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Mediathek               | `PHPickerViewController`             | der Photo Picker; androidx.activity portiert ihn auf Geräte ohne einen zurück                                |
| `allowsEditing`         | `UIImagePickerController`, ein Asset | weist mit `ERR_UNSUPPORTED` zurück: Android hat keinen System-Editor                                         |
| Kamera mit beiden Typen | die Kamera bietet Foto und Video an  | nimmt ein Foto auf: Die Kamera-App macht das eine oder das andere; für Aufnahmen `'videos'` allein anfordern |
| `fileName`              | der Name der Mediathek               | der Name des Photo Pickers, also die Medien-ID (`1000000020.jpg`); bei einer Aufnahme der der Datei          |
| Keine Kamera            | `ERR_CAMERA_UNAVAILABLE`             | `ERR_CAMERA_UNAVAILABLE`, wenn keine App auf den Capture-Intent antwortet                                    |

Ein zweiter Aufruf, während ein Picker geöffnet ist, weist auf iOS mit
`ERR_BUSY` zurück.

Auf Android laufen die Picker als andere Activities, gestartet über
`KuitoActivityResults` ([native Module](native-modules.md)). Die Kamera
schreibt auf eine `content://`-URI, die der eigene FileProvider des Moduls
(`KuitoImagePickerFileProvider`) nur für die Aufnahme gewährt, im Verzeichnis
`ImagePicker/` des Caches. Beendet Android die App, während ein Picker
geöffnet ist, geht das Ergebnis mit dem JavaScript verloren, das darauf
gewartet hat.

### Simulatoren und Emulatoren

- Der iOS-Simulator (iOS 27) zeigt die Kamera-UI ohne Bild: Der Auslöser tut
  nichts, daher lässt sich die Aufnahme nur auf einem Gerät testen. Abbrechen
  funktioniert. Ältere Simulatoren haben gar keine Kamera, und `capture`
  weist mit `ERR_CAMERA_UNAVAILABLE` zurück.
- Die Kamera-App des Android-Emulators nimmt Fotos aus seiner virtuellen
  Szene auf. Seine Videoaufnahme kann einfrieren (API-34-Image); der Aufruf
  löst dann `canceled` auf.
- `xcrun simctl addmedia <device> file…` und `adb push` plus ein Media-Scan
  legen Fotos und Videos in den Mediatheken ab.
