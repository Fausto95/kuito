# Camera

`Camera` est un aperçu caméra en direct qui prend des photos et enregistre des vidéos :
AVFoundation sur iOS, CameraX sur Android. C'est une
[vue native](native-modules.md#views) du module `Camera`, donc elle se dispose comme n'importe quelle
vue, et c'est sa ref qui prend les photos.

```tsx
import { Image, signal, Camera, cameraRef } from 'kuito';

const camera = cameraRef(); // while a component sets up, like ref()
const photo = signal<string | null>(null);

<Camera ref={camera} flex={1} facing="back" onError={(event) => warn(event.message)} />;

<Text>{camera.ready.value ? 'Ready' : 'Starting…'}</Text>;

const picture = await camera.current?.takePicture({ quality: 0.8 });

photo.value = picture?.uri ?? null; // file:// in the cache: <Image src> and fileSystem read it
```

`demo/camera.tsx` exerce tout ce qui suit (`--entry camera.tsx` dans `demo/`).

## Props

| Prop        | Défaut      | Signification                                                                                              |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `facing`    | `'back'`    | `'back'` ou `'front'`. Changer de valeur relie la caméra.                                                  |
| `mode`      | `'picture'` | `'picture'`, ou `'video'` pour enregistrer. Le mode vidéo peut toujours prendre des photos.                |
| `flash`     | `'off'`     | `'off'`, `'on'` ou `'auto'`, pour les photos. Une caméra sans flash l'ignore.                              |
| `torch`     | `false`     | Garde la lampe allumée pendant que l'aperçu tourne.                                                        |
| `zoom`      | `0`         | De 0 (aucun) à 1 (le maximum de la caméra), linéairement ; borné à cette plage.                            |
| `mute`      | `false`     | Enregistre sans le son, et sans demander le microphone.                                                    |
| `barcodes`  | aucun       | Scanne ces codes pendant que l'aperçu tourne. Voir [Codes-barres](#barcodes).                              |
| `onReady`   |             | L'aperçu a démarré : les photos et les enregistrements peuvent commencer. De nouveau après chaque reprise. |
| `onError`   |             | `{ code, message }`. Voir [Erreurs](#errors).                                                              |
| `onBarcode` |             | `{ format, data, bounds }` chaque fois qu'un code entre dans le champ ; `bounds` en points.                |

L'aperçu remplit la vue et rogne ce qui dépasse (`aspectFill`), donc donnez à la
vue la forme que vous voulez montrer à l'utilisateur. La photo capturée est l'image
entière du capteur, pas le rognage.

## Méthodes de la ref

`cameraRef()` crée une ref qui contient aussi l'état de la caméra sous forme de signaux :
`ready` pendant que l'aperçu tourne et que la caméra peut prendre des photos et enregistrer,
et `error`, le dernier `{ code, message }` avec lequel elle a échoué. Un simple
`ref<CameraHandle>()` suffit pour les méthodes seules. `current` contient l'élément de la
vue, avec celles-ci ([comment les vues natives reçoivent des méthodes](native-modules.md#how-views-work)) :

| Méthode                    | Se résout avec                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `takePicture(options?)`    | `{ uri, width, height, base64? }` : un JPEG redressé dans le répertoire de cache.              |
| `startRecording(options?)` | `{ uri, duration }` (secondes), une fois l'enregistrement terminé, quelle qu'en soit la cause. |
| `stopRecording()`          | Le même `{ uri, duration }`, une fois le fichier complet.                                      |
| `pausePreview()`           | Fige la dernière image et arrête la caméra, en gardant la vue.                                 |
| `resumePreview()`          | Redémarre la caméra ; `onReady` suit.                                                          |

`takePicture` prend `{ quality, base64 }` : la qualité JPEG de 0 à 1 (1 par
défaut), et le JPEG en base64 sans préfixe `data:`. `startRecording`
prend `{ maxDuration }` en secondes, et exige `mode="video"`. Un enregistrement se termine
sur `stopRecording`, à `maxDuration`, quand l'app quitte le premier plan, ou
quand la vue est démontée ; le fichier est complet dans chaque cas et
`startRecording` se résout avec lui. Les vidéos sont en MPEG-4 avec de la vidéo H.264, en HD
quand la caméra le peut.

Les appels rejettent avec une `NativeModuleError` :

| Code                 | Quand                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `ERR_NOT_READY`      | La caméra ne tourne pas : avant `onReady`, en pause ou en arrière-plan.                    |
| `ERR_MODE`           | `startRecording` sans `mode="video"`.                                                      |
| `ERR_RECORDING`      | Enregistrer deux fois, arrêter sans enregistrement en cours, ou l'enregistrement a échoué. |
| `ERR_PERMISSION`     | Le microphone a été refusé ; enregistrez avec `mute`, ou redemandez.                       |
| `ERR_VIEW_NOT_FOUND` | La vue a été démontée ([vues natives](native-modules.md#a-view-on-the-wire)).              |

## Cycle de vie

- **Permission.** La vue demande `camera` via
  [Permissions](permissions.md) la première fois qu'elle doit tourner, et de nouveau chaque
  fois qu'elle revient à l'écran après un refus. Un refus est un `onError` avec
  `ERR_PERMISSION`. Demandez plus tôt avec `permissions.request('camera')` pour choisir
  quand l'invite s'affiche. Enregistrer avec le son demande `microphone` de la même
  façon, à `startRecording`.
- **Quand elle tourne.** La caméra tourne tant que la vue est à l'écran (dans une fenêtre
  et visible), que l'app est au
  premier plan ([AppState](app-state.md)) et que l'aperçu n'est pas en pause. Elle s'arrête
  sinon, pour qu'une autre app puisse l'utiliser, et `onReady` se déclenche chaque fois qu'elle
  redémarre.
- **Libération.** Démonter la vue libère la caméra, et un rechargement du runtime
  aussi : les deux atteignent l'`unmount` de la vue ([vues natives](native-modules.md#views)).
  Un enregistrement en cours se termine, et `startRecording` se résout avec lui.
  Quitter l'écran, par exemple sous un écran empilé, ne fait qu'arrêter la caméra ; la
  vue garde sa configuration et redémarre quand elle revient.
- **Les erreurs sont signalées une fois** jusqu'à ce que la caméra redémarre : la vue réessaie
  ce qui a échoué à chaque changement, et un échec répété reste silencieux.

## Erreurs

`onError` reçoit `{ code, message }` :

| Code                     | Signification                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `ERR_PERMISSION`         | L'accès à la caméra est refusé, ou iOS n'a pas de texte d'usage pour le demander.      |
| `ERR_CAMERA_UNAVAILABLE` | Cet appareil n'a pas de caméra orientée dans ce sens. Le simulateur iOS n'en a aucune. |
| `ERR_CAMERA`             | La session a échoué ou le système a arrêté la caméra (une autre app l'a prise).        |

## Codes-barres

`barcodes` scanne les formats `qr`, `aztec`, `datamatrix`, `pdf417`, `ean13`,
`ean8`, `upc_e`, `code39`, `code93`, `code128` et `itf14`.
`onBarcode` se déclenche une fois par code lorsqu'il entre dans le champ, avec ses
`format`, `data` et `bounds`, la boîte du code en points de la vue depuis son
coin supérieur gauche. Le `type` propre à l'événement est `barcodeScanned`. Un code qui
sort de la vue et y revient se déclenche de nouveau.

- **iOS** scanne avec `AVCaptureMetadataOutput`, qui ne coûte rien de plus.
- **Android** ajoute un cas d'usage `ImageAnalysis` tant que `barcodes` est
  non vide, et décode ses images avec le scanner de codes-barres de ML Kit, avec le
  modèle embarqué dans l'app. Une image est décodée à la fois ; celles qui arrivent
  entre-temps sont abandonnées. Les boîtes sont projetées depuis l'image d'analyse à travers
  `PreviewView`, de sorte qu'elles tombent là où le code apparaît dans l'aperçu rogné.

Les deux plateformes signalent un code UPC-A comme `ean13`, ses données avec un zéro en tête.
Le `itf14` d'Android lit les codes Interleaved 2 of 5 de n'importe quelle longueur ; iOS ne lit
que ceux à 14 chiffres.

### Pourquoi ML Kit embarqué sur Android

Android n'a pas de décodeur de codes-barres à lui. Les choix étaient :

- **ML Kit, variante Play Services** (`play-services-mlkit-barcode-scanning`)
  n'ajoute presque rien à l'APK, mais le modèle se télécharge via Google
  Play Services au premier usage : le scan ne trouve rien tant qu'il n'est pas arrivé, et
  jamais sur les appareils sans Play Services (Huawei, Amazon, builds AOSP, de nombreuses
  images d'émulateur).
- **ZXing core** est en Java pur et pèse environ 0,5 Mo, mais il est en mode
  maintenance, nous laisse la conversion des images de la caméra, et lit les codes petits, inclinés ou
  flous nettement moins bien que ML Kit.
- **ML Kit, embarqué** (`com.google.mlkit:barcode-scanning:17.3.0`) fonctionne sur
  chaque appareil dès la première image, lit les onze formats, et décode
  les codes inclinés et partiellement abîmés.

ML Kit embarqué coûte environ 2,4 Mo par app, payés par chaque app qui importe
`Camera`, qu'elle scanne ou non. Cela achète le même comportement sur chaque appareil
Android, ce qu'une prop de caméra devrait avoir.

## Pourquoi CameraX sur Android

Camera2 en direct ne coûterait rien en taille, mais chaque app paierait en
comportement : Camera2 laisse les tailles de flux, les transformations de l'aperçu, l'orientation, la
rotation du capteur, l'enregistrement avec `MediaRecorder`, et des dizaines de particularités d'appareils
à l'appelant. CameraX est la couche de Google par-dessus et les prend en charge, avec
`PreviewView`, `ImageCapture` et `VideoCapture` que ce module utilise tels quels.
Le coût : CameraX 1.5.3 (`camera-core`, `camera-camera2`, `camera-lifecycle`,
`camera-video`, `camera-view`) représente environ 2,5 Mo de fichiers de classes avant dexing ;
on l'estime couramment à environ 1 Mo dans un APK de release réduit (non mesuré ici :
la CLI n'a pas encore de build de release). Les modules ne sont livrés que dans les apps qui les importent
([quels modules un shell inclut](native-modules.md#which-modules-a-shell-includes)),
donc seules les apps qui rendent un `Camera` le paient. CameraX 1.6 exige compileSdk
36 et AGP 8.9 ; le shell est en 35 et 8.7, donc le module reste en 1.5.

Chaque vue est son propre `LifecycleOwner` CameraX : à l'état resumed tant que la caméra
doit tourner, created tant qu'elle ne le doit pas (détachée, masquée, en arrière-plan ou
en pause), et destroyed quand la vue est démontée, de sorte que CameraX ouvre, ferme et
délie l'appareil sans code de notre part dans l'activité.

## Le module

`native/modules/camera` : sa spec, `camera.ts`, importe `Permissions` et
`AppState`, donc un shell avec la caméra a les deux. Elle déclare les textes d'usage iOS de la
caméra et du microphone (les `permissions` de l'app dans `kuito.config.ts`
les remplacent), les `CAMERA` et `RECORD_AUDIO` d'Android, et
`android.hardware.camera.any` et `android.hardware.microphone` comme fonctionnalités
optionnelles, pour que Google Play liste toujours l'app pour les appareils qui en sont dépourvus.

## Notes par plateforme

- **iOS** exécute chaque session de capture sur sa propre file série ; rien ne bloque
  le thread principal. Les photos et vidéos sont orientées comme l'interface. Le
  simulateur iOS n'a pas de caméra : la vue demande la permission et signale
  `ERR_CAMERA_UNAVAILABLE`. Les photos, l'enregistrement, le flash, la lampe, le zoom et
  les codes-barres exigent un appareil.
- **Le zoom iOS** s'arrête à 10× : au-delà, le zoom numérique n'est que du flou.
- **Android** réencode les photos redressées à la qualité demandée, hors
  du thread UI. Un aperçu en pause garde sa dernière image (`PreviewView` en
  mode compatible, une TextureView).
- **Les photos de la caméra frontale** ne sont inversées en miroir sur aucune des deux plateformes, alors que
  l'aperçu l'est.

## Pas encore

- Photos et vidéos vers la photothèque : enregistrez avec
  [fileSystem](file-system.md) ou partagez l'URI ; un module de médiathèque en
  aurait la charge.
- Points de mise au point et d'exposition, HDR, RAW, et réglages de stabilisation vidéo.
