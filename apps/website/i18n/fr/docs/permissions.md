# permissions

`permissions` vérifie et demande les permissions d'exécution avec un seul modèle de statut sur
iOS et Android. Les modules qui ont besoin d'accéder à l'appareil (Camera, Location, Image
Picker, enregistrement audio, Notifications) passent par lui nativement, de sorte qu'un statut
signifie la même chose dans chaque module.

```tsx
import { app, permissions } from 'kuito';

const { status, canAskAgain } = await permissions.check('camera');

if (status === 'undetermined') await permissions.request('camera');
else if (status === 'denied' && !canAskAgain) await app.openSettings();
```

| Fonction        | Rôle                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| `check(name)`   | Se résout avec le statut actuel sans afficher d'invite.                         |
| `request(name)` | Affiche l'invite système si le système l'accepte, et se résout avec la réponse. |

`check` et `request` se résolvent avec `{ status, canAskAgain }` :

| `status`       | Signification                                                                 |
| -------------- | ----------------------------------------------------------------------------- |
| `granted`      | L'app a l'accès.                                                              |
| `limited`      | L'utilisateur en a autorisé une partie : une sélection de photos.             |
| `denied`       | L'utilisateur a refusé, ou une politique (contrôle parental, MDM) l'interdit. |
| `undetermined` | L'app n'a pas encore demandé. `request` affichera l'invite.                   |

`canAskAgain` est `false` quand `request` ne peut plus afficher l'invite. Seul
l'utilisateur peut alors changer la réponse, dans les Réglages : envoyez-l'y avec
[`app.openSettings()`](app-state.md). Quand c'est `true`, `request` affiche l'invite ou répond
aussitôt avec un statut qui n'en nécessite pas (`granted`).

Un nom inconnu rejette avec `ERR_ARGUMENT`.

## Noms des permissions

| Nom              | iOS                                                     | Android                                                                       |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `camera`         | `AVCaptureDevice` (vidéo)                               | `CAMERA`                                                                      |
| `microphone`     | `AVCaptureDevice` (audio)                               | `RECORD_AUDIO`                                                                |
| `photos`         | `PHPhotoLibrary`, lecture et écriture                   | `READ_MEDIA_IMAGES` + `READ_MEDIA_VIDEO` (13+), `READ_EXTERNAL_STORAGE` (≤12) |
| `location`       | Pendant l'utilisation (`requestWhenInUseAuthorization`) | `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`                             |
| `locationAlways` | Toujours (`requestAlwaysAuthorization`)                 | `location`, puis `ACCESS_BACKGROUND_LOCATION` (10+)                           |
| `notifications`  | Alertes, badges et sons                                 | `POST_NOTIFICATIONS` (13+), l'interrupteur de notifications de l'app (≤12)    |

`locationAlways` est la localisation pendant que l'app est en arrière-plan, pour les
[mises à jour en arrière-plan](location.md#background-updates). Elle demande d'abord `location`
quand l'app ne l'a pas encore : iOS propose « pendant l'utilisation » dans la même
invite, et Android 11 et ultérieur n'accordent l'accès en arrière-plan qu'une fois l'accès au
premier plan accordé, donc `request` affiche l'invite de premier plan, puis celle
d'arrière-plan (celle d'Android est la page de localisation de l'app dans les Paramètres). Sur
Android 9 et antérieur, `locationAlways` équivaut à `location`.

## Différences avec Expo

Kuito suit les statuts d'Expo et son `canAskAgain`, avec ces différences
délibérées :

- **Un seul module, les noms en arguments.** Expo répartit les permissions sur chaque
  module (`Camera.requestCameraPermissionsAsync()`). Kuito a un seul module
  `permissions`, et les modules d'appareil l'utilisent nativement. Le code de l'app
  n'a pas besoin d'importer la caméra pour demander la caméra.
- **`limited` est un statut.** Expo signale une sélection de photos comme `granted` avec
  `accessPrivileges: 'limited'`. Un accord partiel se comporte différemment d'un
  accord complet, donc Kuito en fait un statut à part entière.
- **Pas de booléen `granted` ni d'`expires`.** `status === 'granted'` dit la
  même chose. Les permissions d'exécution n'expirent pas.
- **La localisation approximative et les notifications provisoires sont `granted`,** comme dans
  Expo. [Location](location.md) rapporte la précision dans le
  `coords.accuracy` de chaque position ; c'est une propriété de la position, pas de la permission.

## Notes par plateforme

- **iOS ne demande qu'une fois.** Après un refus, `canAskAgain` est `false` et seuls
  les Réglages peuvent le changer. L'accès `limited` aux photos garde `canAskAgain: true`.
- **Android peut redemander après un refus.** Le second refus est définitif
  (`canAskAgain: false`). Android signale « jamais demandé » et « refusé pour de bon »
  de la même façon, donc Kuito se souvient des permissions qu'il a demandées. Un cas
  passe entre les mailles, comme dans Expo : fermer l'invite sans répondre,
  ou fermer le sélecteur de photos d'Android 14 sans rien choisir, est lu comme un refus
  définitif, alors qu'Android redemanderait.
- **Les photos sélectionnées sur Android 14** sont `limited`. Redemander `photos`
  affiche l'invite pour que l'utilisateur puisse changer la sélection.
- **iOS ne propose « toujours » qu'une fois.** Avec « pendant l'utilisation » accordé, `locationAlways`
  est `undetermined` jusqu'à ce que `request` propose le passage au niveau supérieur, et `denied` avec
  `canAskAgain: false` une fois que l'utilisateur garde « pendant l'utilisation ». Depuis un
  statut indéterminé, choisir « Autoriser lorsque l'app est active » donne le « toujours »
  provisoire d'iOS : `granted`, jusqu'à ce qu'iOS redemande à l'utilisateur la première
  fois que l'app utilise la localisation en arrière-plan.
- **Android 12 et antérieur n'ont pas de permission de notifications.** `notifications`
  est `granted` quand les notifications de l'app sont activées, et sinon `denied`
  avec `canAskAgain: false`.

## Les déclarer dans kuito.config.ts

Une app liste les permissions qu'elle utilise dans [`kuito.config.ts`](apps.md#kuitoconfigts),
chacune avec la raison qu'iOS affiche dans son invite :

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

La CLI écrit exactement celles-ci dans les shells qu'elle génère :

- **iOS** : chaque raison sous sa clé `Info.plist` : `NSCameraUsageDescription`,
  `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`,
  `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription` ou
  `NSFaceIDUsageDescription`.
  Les notifications ne prennent pas de raison, donc leur valeur est `true`.
- **Android** : les permissions d'exécution du tableau ci-dessus, plus
  `USE_BIOMETRIC` pour `biometrics`, dans un manifeste à
  `.kuito/android/AndroidManifest.xml` que Gradle fusionne par-dessus celui du
  framework (`kuito.manifest`).

`biometrics` est une déclaration seulement, pas un nom que `check` ou `request`
accepte : le système demande Face ID la première fois que
[`secureStore`](secure-store.md#authentication) l'utilise.

Une permission que la config ne déclare pas ne peut pas être accordée. iOS termine une app
qui demande sans texte d'usage, donc déclarez avant d'appeler `request`.
Android refuse une permission non déclarée sans afficher d'invite. Un nom mal
orthographié ou une raison vide fait échouer le build avec une erreur nommant la clé.

`locationAlways` exige que `location` soit déclaré aussi : iOS affiche d'abord la raison
« pendant l'utilisation ». Le déclarer active aussi les
[mises à jour de localisation en arrière-plan](location.md#background-updates).

L'app de démo de ce dépôt déclare chaque permission, pour que chaque démo puisse demander
la sienne (`demo/kuito.config.ts`). Ouvrir `native/android` dans Android
Studio sans la CLI la compile sans aucune.

## Depuis un autre module

Un module qui a besoin d'une permission passe par le helper natif et n'appelle pas
lui-même l'API système :

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

Pour ajouter une permission, ajoutez son nom à `PermissionName` dans
`src/native/permissions.ts`, un cas à `KuitoPermission` et une source au
tableau de `KuitoPermissions.swift`, et une ligne à `KuitoPermission.kt`. Puis
rendez-la déclarable : une clé dans `KuitoPermissions` (`src/cli/kuito-config.ts`)
avec sa vérification, sa clé `Info.plist` et ses entrées de manifeste dans le tableau de
`src/cli/shells.ts`, et une raison dans `demo/kuito.config.ts`.
`test/native-modules.test.ts` et `test/cli-shell.test.ts` échouent tant que chaque
partie ne l'a pas.
