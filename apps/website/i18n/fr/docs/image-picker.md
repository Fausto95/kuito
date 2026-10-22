# mediaPicker

Le sélecteur de photos et l'appareil photo du système, pour les images et les
vidéos : `PHPickerViewController` et `UIImagePickerController` sur iOS, le
Photo Picker (`PickVisualMedia`) et l'application appareil photo du système
sur Android.

```tsx
import { Image, mediaPicker } from 'kuito';

const result = await mediaPicker.pick({ selectionLimit: 0, maxWidth: 1600 });

if (!result.canceled) photo.value = result.assets[0].uri;

<Image src={{ uri: photo.value }} aspectRatio={1.5} />;
```

`pick(options?)` et `capture(options?)` se résolvent en
`{ canceled: true, assets: null }` quand l'utilisateur ferme le sélecteur
sans rien choisir, et en `{ canceled: false, assets }` sinon. Chaque asset
est :

| Champ      | Signification                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `uri`      | Une URI `file://` dans le répertoire de cache de l'application. `<Image src>` et `fileSystem` la lisent. |
| `width`    | En pixels, à l'endroit : l'orientation EXIF est déjà appliquée.                                          |
| `height`   | En pixels, à l'endroit.                                                                                  |
| `type`     | `'image'` ou `'video'`.                                                                                  |
| `mimeType` | `image/jpeg` ou `image/png` pour les images ; le type propre du fichier pour les vidéos.                 |
| `fileName` | Le nom que la bibliothèque lui donne, avec l'extension écrite (voir ci-dessous).                         |
| `fileSize` | En octets, du fichier à `uri`.                                                                           |
| `duration` | Vidéos seulement, en millisecondes.                                                                      |

| Option           | Défaut     | Signification                                                                                                  |
| ---------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `mediaTypes`     | `'images'` | `'images'`, `'videos'`, ou les deux sous forme de liste.                                                       |
| `selectionLimit` | `1`        | Bibliothèque seulement. Combien d'assets l'utilisateur peut choisir ; `0` pour la limite du système.           |
| `quality`        | `1`        | Qualité JPEG des images écrites, de 0 à 1.                                                                     |
| `maxWidth`       | aucun      | Les images plus larges que cela, en pixels, sont réduites pour tenir, en gardant leurs proportions.            |
| `maxHeight`      | aucun      | Idem pour la hauteur. Les deux ensemble font tenir l'image dans la boîte.                                      |
| `allowsEditing`  | `false`    | iOS seulement : l'éditeur du système recadre l'image (ou raccourcit la vidéo) avant que l'appel ne se résolve. |

Une option hors de sa plage lève une `TypeError` à l'appel, avant qu'aucun
sélecteur ne s'ouvre : une `quality` hors de 0 à 1, un `selectionLimit`
négatif ou fractionnaire, un `mediaTypes` inconnu ou vide, une taille qui
n'est pas un nombre positif, ou `allowsEditing` avec un `selectionLimit`
autre que 1. `maxWidth` et `maxHeight` vont plus loin qu'Expo, qui n'a pas de
redimensionnement.

## Ce qui atterrit dans le cache

Les médias choisis et capturés sont écrits dans `ImagePicker/` dans le
répertoire de cache de l'application (`fileSystem.cache`), hors du thread
principal, un asset après l'autre :

- **Les images sont ré-encodées.** Décodées à la plus petite taille qui couvre
  `maxWidth` et `maxHeight`, remises à l'endroit, et écrites en JPEG à
  `quality`. Une image avec transparence est écrite en PNG à la place, et
  `quality` ne s'applique pas. Les métadonnées EXIF, position incluse, ne sont
  pas copiées. Le HEIC de la bibliothèque iOS devient du JPEG, de sorte que le
  fichier fonctionne partout.
- **Les vidéos sont copiées telles quelles.** Pas de transcodage ; `width` et
  `height` tiennent compte de la rotation de la piste.

Le système peut vider le cache quand le stockage vient à manquer. Déplacez un
asset que l'application conserve vers `fileSystem.documents`
([fileSystem](file-system.md)).

## Permissions

Choisir dans la bibliothèque ne demande aucune permission sur l'une ou l'autre
plateforme : les deux sélecteurs s'exécutent hors du processus et ne remettent
que ce que l'utilisateur choisit.

`capture` demande d'abord la permission `camera` via
[permissions](permissions.md) et rejette avec `ERR_PERMISSION` quand elle
n'est pas accordée. Sur Android, cela n'arrive que si l'application déclare
la permission appareil photo (`permissions: { camera: … }` dans
`kuito.config.ts`) : l'application appareil photo du système n'en a pas
besoin, mais Android refuse l'intent à une application qui la déclare sans la
détenir.

Le module embarque `NSCameraUsageDescription` et
`NSMicrophoneUsageDescription` (la vidéo enregistre le son) dans sa spec,
`native/modules/image-picker/image-picker.ts`. Les raisons
`permissions.camera` et `permissions.microphone` de l'application les
remplacent.

## Différences entre plateformes

|                            | iOS                                      | Android                                                                                                     |
| -------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Bibliothèque               | `PHPickerViewController`                 | le Photo Picker ; androidx.activity le rétroporte sur les appareils qui n'en ont pas                        |
| `allowsEditing`            | `UIImagePickerController`, un seul asset | rejette avec `ERR_UNSUPPORTED` : Android n'a pas d'éditeur système                                          |
| Appareil photo, deux types | l'appareil photo propose photo et vidéo  | prend une photo : l'application appareil photo fait l'un ou l'autre ; demandez `'videos'` seul pour filmer  |
| `fileName`                 | le nom de la bibliothèque                | le nom du Photo Picker, qui est l'id du média (`1000000020.jpg`) ; celui d'une capture est celui du fichier |
| Pas d'appareil photo       | `ERR_CAMERA_UNAVAILABLE`                 | `ERR_CAMERA_UNAVAILABLE` quand aucune application ne répond à l'intent de capture                           |

Un second appel pendant qu'un sélecteur est ouvert rejette avec `ERR_BUSY`
sur iOS.

Sur Android, les sélecteurs s'exécutent comme d'autres activités, démarrées
via `KuitoActivityResults` ([modules natifs](native-modules.md)). L'appareil
photo écrit vers une URI `content://` que le FileProvider propre du module
(`KuitoImagePickerFileProvider`) accorde pour la capture seulement, dans le
répertoire `ImagePicker/` du cache. Si Android tue l'application pendant
qu'un sélecteur est ouvert, le résultat est perdu avec le JavaScript qui
l'attendait.

### Simulateurs et émulateurs

- Le simulateur iOS (iOS 27) affiche l'interface de l'appareil photo sans
  flux : le déclencheur ne fait rien, donc la capture ne peut être testée que
  sur un appareil. Annuler fonctionne. Les simulateurs plus anciens n'ont pas
  d'appareil photo du tout, et `capture` rejette avec
  `ERR_CAMERA_UNAVAILABLE`.
- L'application appareil photo de l'émulateur Android capture des photos
  depuis sa scène virtuelle. Son enregistrement vidéo peut cesser de répondre
  (image API 34) ; l'appel se résout alors en `canceled`.
- `xcrun simctl addmedia <device> file…` et `adb push` suivi d'un scan des
  médias placent des photos et des vidéos dans les bibliothèques.
