# Camera

`Camera` ist eine Live-Kameravorschau, die Bilder aufnimmt und Videos aufzeichnet:
AVFoundation auf iOS, CameraX auf Android. Es ist eine
[native View](native-modules.md#views) des `Camera`-Moduls, wird also wie jede
View gelayoutet, und seine Ref nimmt die Bilder auf.

```tsx
import { Image, signal, Camera, cameraRef } from 'kuito';

const camera = cameraRef(); // while a component sets up, like ref()
const photo = signal<string | null>(null);

<Camera ref={camera} flex={1} facing="back" onError={(event) => warn(event.message)} />;

<Text>{camera.ready.value ? 'Ready' : 'Starting…'}</Text>;

const picture = await camera.current?.takePicture({ quality: 0.8 });

photo.value = picture?.uri ?? null; // file:// in the cache: <Image src> and fileSystem read it
```

`demo/camera.tsx` übt alles Folgende aus (`--entry camera.tsx` in `demo/`).

## Props

| Prop        | Standard    | Bedeutung                                                                                       |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `facing`    | `'back'`    | `'back'` oder `'front'`. Ein Wechsel bindet die Kamera neu.                                     |
| `mode`      | `'picture'` | `'picture'`, oder `'video'` zum Aufzeichnen. Der Videomodus kann weiterhin Bilder aufnehmen.    |
| `flash`     | `'off'`     | `'off'`, `'on'` oder `'auto'`, für Bilder. Eine Kamera ohne Blitz ignoriert es.                 |
| `torch`     | `false`     | Lässt das Licht an, während die Vorschau läuft.                                                 |
| `zoom`      | `0`         | 0 (keiner) bis 1 (das Maximum der Kamera), linear; auf diesen Bereich begrenzt.                 |
| `mute`      | `false`     | Zeichnet ohne Ton auf, und ohne nach dem Mikrofon zu fragen.                                    |
| `barcodes`  | keine       | Sucht nach diesen Codes, während die Vorschau läuft. Siehe [Barcodes](#barcodes).               |
| `onReady`   |             | Die Vorschau ist gestartet: Bilder und Aufnahmen können beginnen. Erneut nach jedem Fortsetzen. |
| `onError`   |             | `{ code, message }`. Siehe [Fehler](#errors).                                                   |
| `onBarcode` |             | `{ format, data, bounds }` jedes Mal, wenn ein Code ins Bild kommt; `bounds` in Punkten.        |

Die Vorschau füllt die View aus und schneidet ab, was überläuft (`aspectFill`); der
View also die Form geben, die der Benutzer sehen soll. Das aufgenommene Bild ist das gesamte
Sensorbild, nicht der Ausschnitt.

## Ref-Methoden

`cameraRef()` erzeugt eine Ref, die auch den Zustand der Kamera als Signale hält:
`ready`, solange die Vorschau läuft und die Kamera Bilder aufnehmen und aufzeichnen kann,
und `error`, das letzte `{ code, message }`, mit dem sie fehlgeschlagen ist. Eine einfache
`ref<CameraHandle>()` genügt für die Methoden allein. `current` hält das Element der View
mit diesen ([wie native Views Methoden erhalten](native-modules.md#how-views-work)):

| Methode                    | Löst auf mit                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `takePicture(options?)`    | `{ uri, width, height, base64? }`: ein aufrecht stehendes JPEG im Cache-Verzeichnis. |
| `startRecording(options?)` | `{ uri, duration }` (Sekunden), sobald die Aufnahme endet, egal wodurch.             |
| `stopRecording()`          | Dasselbe `{ uri, duration }`, sobald die Datei vollständig ist.                      |
| `pausePreview()`           | Friert das letzte Bild ein und stoppt die Kamera, behält die View.                   |
| `resumePreview()`          | Startet die Kamera erneut; `onReady` folgt.                                          |

`takePicture` nimmt `{ quality, base64 }`: JPEG-Qualität von 0 bis 1 (standardmäßig

1. und das JPEG als base64 ohne `data:`-Präfix. `startRecording`
   nimmt `{ maxDuration }` in Sekunden und braucht `mode="video"`. Eine Aufnahme endet
   bei `stopRecording`, bei `maxDuration`, wenn die App den Vordergrund verlässt oder
   wenn die View unmontiert wird; die Datei ist in jedem Fall vollständig und
   `startRecording` löst mit ihr auf. Videos sind MPEG-4 mit H.264-Video, in HD,
   wo die Kamera es kann.

Aufrufe werden mit einem `NativeModuleError` abgelehnt:

| Code                 | Wann                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| `ERR_NOT_READY`      | Die Kamera läuft nicht: vor `onReady`, während sie pausiert oder im Hintergrund ist. |
| `ERR_MODE`           | `startRecording` ohne `mode="video"`.                                                |
| `ERR_RECORDING`      | Zweimal aufzeichnen, stoppen ohne Aufnahme, oder die Aufnahme ist fehlgeschlagen.    |
| `ERR_PERMISSION`     | Das Mikrofon wurde verweigert; mit `mute` aufzeichnen oder erneut fragen.            |
| `ERR_VIEW_NOT_FOUND` | Die View wurde unmontiert ([native Views](native-modules.md#a-view-on-the-wire)).    |

## Lebenszyklus

- **Berechtigung.** Die View fragt über
  [Permissions](permissions.md) nach `camera`, wenn sie zum ersten Mal laufen soll, und erneut jedes
  Mal, wenn sie nach einer Verweigerung wieder auf den Bildschirm kommt. Eine Verweigerung ist ein `onError` mit
  `ERR_PERMISSION`. Früher mit `permissions.request('camera')` fragen, um zu wählen,
  wann die Abfrage erscheint. Eine Aufnahme mit Ton fragt auf dieselbe Weise nach `microphone`,
  bei `startRecording`.
- **Wann sie läuft.** Die Kamera läuft, während die View auf dem Bildschirm ist (in einem Fenster
  und sichtbar), die App im
  Vordergrund ist ([AppState](app-state.md)) und die Vorschau nicht pausiert ist. Andernfalls
  stoppt sie, damit eine andere App sie nutzen kann, und `onReady` feuert jedes Mal, wenn sie
  wieder startet.
- **Freigabe.** Das Unmounten der View gibt die Kamera frei, ebenso ein Runtime-
  Reload: Beide erreichen das `unmount` der View ([native Views](native-modules.md#views)).
  Eine laufende Aufnahme wird abgeschlossen, und `startRecording` löst mit ihr auf.
  Das Verlassen des Bildschirms, etwa unter einem gepushten Bildschirm, stoppt nur die Kamera; die
  View behält ihre Konfiguration und startet erneut, wenn sie zurückkommt.
- **Fehler werden einmal gemeldet**, bis die Kamera erneut startet: Die View versucht bei
  jeder Änderung erneut, was fehlgeschlagen ist, und ein wiederholtes Fehlschlagen bleibt still.

## Fehler

`onError` erhält `{ code, message }`:

| Code                     | Bedeutung                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `ERR_PERMISSION`         | Der Kamerazugriff ist verweigert, oder iOS hat keinen Verwendungstext zum Fragen.                            |
| `ERR_CAMERA_UNAVAILABLE` | Dieses Gerät hat keine Kamera in dieser Richtung. Der iOS-Simulator hat keine.                               |
| `ERR_CAMERA`             | Die Session ist fehlgeschlagen oder das System hat die Kamera gestoppt (eine andere App hat sie übernommen). |

## Barcodes

`barcodes` sucht nach `qr`, `aztec`, `datamatrix`, `pdf417`, `ean13`,
`ean8`, `upc_e`, `code39`, `code93`, `code128` und `itf14`.
`onBarcode` feuert einmal pro Code, sobald er ins Bild kommt, mit seinem
`format`, `data` und `bounds`, dem Rahmen des Codes in Punkten der View ab ihrer
oberen linken Ecke. Der eigene `type` des Ereignisses ist `barcodeScanned`. Ein Code, der
die View verlässt und zurückkommt, feuert erneut.

- **iOS** scannt mit `AVCaptureMetadataOutput`, was nichts zusätzlich kostet.
- **Android** fügt einen `ImageAnalysis`-Use-Case hinzu, solange `barcodes`
  nicht leer ist, und dekodiert dessen Frames mit dem Barcode-Scanner von ML Kit, mit dem
  in der App gebündelten Modell. Es wird ein Frame zur Zeit dekodiert; Frames, die währenddessen
  eintreffen, werden verworfen. Rahmen werden aus dem Analyse-Frame über
  `PreviewView` abgebildet, sodass sie dort landen, wo der Code in der beschnittenen Vorschau erscheint.

Beide Plattformen melden einen UPC-A-Code als `ean13`, seine Daten mit einer führenden Null.
Androids `itf14` liest Interleaved-2-of-5-Codes beliebiger Länge; iOS liest
nur die 14-stelligen.

### Warum gebündeltes ML Kit auf Android

Android hat keinen eigenen Barcode-Decoder. Die Optionen waren:

- **ML Kit, Play-Services-Variante** (`play-services-mlkit-barcode-scanning`)
  fügt dem APK fast nichts hinzu, aber das Modell wird bei der ersten Nutzung über Google
  Play Services heruntergeladen: Das Scannen findet nichts, bis es ankommt, und
  nie auf Geräten ohne Play Services (Huawei, Amazon, AOSP-Builds, viele
  Emulator-Images).
- **ZXing core** ist reines Java und etwa 0,5 MB groß, befindet sich aber im Wartungsmodus,
  überlässt uns das Konvertieren der Kamera-Frames und liest kleine, schiefe oder
  unscharfe Codes spürbar schlechter als ML Kit.
- **ML Kit, gebündelt** (`com.google.mlkit:barcode-scanning:17.3.0`) funktioniert auf
  jedem Gerät ab dem ersten Frame, liest alle elf Formate und dekodiert
  schiefe und teilweise beschädigte Codes.

Gebündeltes ML Kit kostet etwa 2,4 MB pro App, bezahlt von jeder App, die
`Camera` importiert, ob sie scannt oder nicht. Das erkauft dasselbe Verhalten auf jedem Android-
Gerät, das eine Kamera-Prop haben sollte.

## Warum CameraX auf Android

Camera2 direkt würde nichts an Größe kosten, aber jede App würde mit
Verhalten bezahlen: Camera2 überlässt Stream-Größen, Vorschau-Transformationen, Ausrichtung, die
Rotation des Sensors, Aufzeichnung mit `MediaRecorder` und Dutzende Geräte-Eigenheiten
dem Aufrufer. CameraX ist Googles Schicht darüber und übernimmt das, mit
`PreviewView`, `ImageCapture` und `VideoCapture`, die dieses Modul unverändert verwendet.
Die Kosten: CameraX 1.5.3 (`camera-core`, `camera-camera2`, `camera-lifecycle`,
`camera-video`, `camera-view`) ist vor dem Dexing etwa 2,5 MB an Klassendateien;
in einem geschrumpften Release-APK wird es üblicherweise mit etwa 1 MB angegeben (hier nicht gemessen:
die CLI hat noch keinen Release-Build). Module werden nur in Apps ausgeliefert, die sie importieren
([welche Module eine Shell enthält](native-modules.md#which-modules-a-shell-includes)),
sodass nur Apps, die eine `Camera` rendern, dafür zahlen. CameraX 1.6 braucht compileSdk
36 und AGP 8.9; die Shell ist auf 35 und 8.7, also bleibt das Modul auf 1.5.

Jede View ist ihr eigener CameraX-`LifecycleOwner`: resumed, während die Kamera
laufen soll, created, während sie es nicht soll (abgelöst, verborgen, im Hintergrund oder
pausiert), und destroyed, wenn die View unmontiert wird, sodass CameraX das Gerät ohne
Code von uns in der Activity öffnet, schließt und löst.

## Das Modul

`native/modules/camera`: Seine Spezifikation, `camera.ts`, importiert `Permissions` und
`AppState`, sodass eine Shell mit der Kamera beide hat. Es deklariert die iOS-Verwendungstexte
für Kamera und Mikrofon (die `permissions` der App in `kuito.config.ts`
ersetzen sie), Androids `CAMERA` und `RECORD_AUDIO`, sowie
`android.hardware.camera.any` und `android.hardware.microphone` als optionale
Features, damit Google Play die App weiterhin für Geräte ohne sie listet.

## Plattformhinweise

- **iOS** führt jede Capture-Session auf ihrer eigenen seriellen Queue aus; nichts blockiert
  den Hauptthread. Bilder und Videos stehen so, wie die Oberfläche steht. Der
  iOS-Simulator hat keine Kamera: Die View fragt nach der Berechtigung und meldet
  `ERR_CAMERA_UNAVAILABLE`. Bilder, Aufnahme, Blitz, Taschenlampe, Zoom und
  Barcodes brauchen ein Gerät.
- **iOS-Zoom** endet bei 10×: Darüber ist digitaler Zoom nur Unschärfe.
- **Android**-Bilder werden aufrecht in der angeforderten Qualität neu kodiert, abseits
  des UI-Threads. Eine pausierte Vorschau behält ihr letztes Bild (`PreviewView` im
  Kompatibilitätsmodus, eine TextureView).
- **Frontkamera**-Bilder werden auf keiner Plattform gespiegelt, obwohl die
  Vorschau es ist.

## Noch nicht

- Foto und Video in die Mediathek: mit
  [fileSystem](file-system.md) speichern oder die URI teilen; ein Medienbibliotheksmodul würde
  das übernehmen.
- Fokus- und Belichtungspunkte, HDR, RAW und Einstellungen zur Videostabilisierung.
