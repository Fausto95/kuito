# location

La position de l'appareil, son cap et ses adresses. Sur iOS, c'est Core Location ; sur
Android, le `LocationManager`, le `Geocoder` de la plateforme et le capteur de
vecteur de rotation. Rien ne requiert les Play Services, le module n'ajoute donc
aucune dépendance à l'app. Les radios ne fonctionnent que pendant qu'une requête
attend ou qu'une veille est en cours.

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

| Membre                                    | Est                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `current({ accuracy? })`                  | Un relevé frais.                                                                                        |
| `last({ maxAge?, requiredAccuracy? })`    | Le dernier relevé que la plateforme avait, immédiatement, ou `null` sans relevé respectant les limites. |
| `watch(options?)`                         | Localise dans `position` tant que sa portée dure ; renvoie son abonnement.                              |
| `position`                                | Un signal : le relevé le plus récent apporté par une veille, ou `null`.                                 |
| `error`                                   | Un signal : l'erreur qui a mis fin à une veille, ou `null` tant qu'aucune n'a pris fin.                 |
| `watchHeading(callback)`                  | Appelle `callback(heading)` quand l'appareil tourne, jusqu'à `remove()`.                                |
| `geocode(address)`                        | Les positions d'une adresse.                                                                            |
| `reverseGeocode({ latitude, longitude })` | Les lieux à une position, le plus proche en premier.                                                    |
| `servicesEnabled()`                       | Si les services de localisation sont activés sur l'appareil.                                            |
| `defineUpdates(name, task)`               | La tâche qui reçoit les relevés des mises à jour en arrière-plan. À appeler au niveau du module.        |
| `startUpdates(name, options?)`            | Localise aussi en arrière-plan, pour la tâche, jusqu'à `stopUpdates(name)`.                             |
| `stopUpdates(name)`                       | Arrête les mises à jour de la tâche.                                                                    |
| `updating(name)`                          | Si les mises à jour de la tâche sont en cours, ou reprendront au prochain lancement de l'app.           |

`maxAge` est en millisecondes et `requiredAccuracy` en mètres. Un `watch` dans un
composant démarre quand le composant est monté et s'arrête quand il est démonté ;
ailleurs, le `remove()` de l'abonnement l'arrête. Une veille que la plateforme refuse
définit `error` et ne laisse rien en cours. `watchHeading` résout son
abonnement une fois la boussole démarrée, un appareil qui n'en a pas rejette donc.

## Permission

Toutes les fonctions sauf `geocode`, `watchHeading`, `servicesEnabled` et les
`stop` et `has` des mises à jour en arrière-plan requièrent la permission `location`, et le
module ne demande jamais rien à l'utilisateur. Demandez-la avec
[`permissions.request('location')`](permissions.md) ; sans elle, un appel rejette
avec `ERR_PERMISSION`. La localisation approximative compte comme accordée, comme dans Expo :
l'`accuracy` du relevé dit à quel point il est précis.

Le module déclare ce qu'il demande dans les
[besoins natifs](native-modules.md#native-needs) de sa spec, si bien qu'une app qui
importe `location` embarque `NSLocationWhenInUseUsageDescription` et les
`ACCESS_FINE_LOCATION` et `ACCESS_COARSE_LOCATION` d'Android, et qu'une app qui ne l'importe pas
n'embarque ni l'un ni l'autre. Donnez la raison qu'iOS affiche dans `kuito.config.ts` ; elle remplace celle,
générique, du module :

```ts
permissions: { location: 'Find screenings near you.' },
```

Les [mises à jour en arrière-plan](#background-updates) requièrent aussi la déclaration de
`locationAlways`.

## Précision

| `accuracy`              | iOS `desiredAccuracy`                  | Fournisseurs Android, dans l'ordre |
| ----------------------- | -------------------------------------- | ---------------------------------- |
| `lowest`                | `kCLLocationAccuracyThreeKilometers`   | network, gps                       |
| `low`                   | `kCLLocationAccuracyKilometer`         | network, gps                       |
| `balanced` (par défaut) | `kCLLocationAccuracyHundredMeters`     | network, gps                       |
| `high`                  | `kCLLocationAccuracyNearestTenMeters`  | gps, network                       |
| `highest`               | `kCLLocationAccuracyBest`              | gps, network                       |
| `bestForNavigation`     | `kCLLocationAccuracyBestForNavigation` | gps, network                       |

Une veille utilise le premier fournisseur activé sur l'appareil. Un relevé unique interroge les
fournisseurs activés dans l'ordre jusqu'au GPS et prend le premier relevé : le fournisseur réseau
peut être activé sans rien à signaler (pas de Wi-Fi ni de données cellulaires, un émulateur), et un
relevé GPS est assez fin pour n'importe quelle requête. Le fournisseur `fused` de la plateforme n'est pas
utilisé : via `LocationManager`, il demande au service fusionné de Google un relevé
à consommation équilibrée, auquel celui-ci répond à partir de la seule localisation réseau. Avec tous les
fournisseurs désactivés, Android rejette avec `ERR_SERVICES_DISABLED` ; iOS signale les
services désactivés comme une permission refusée.

## Veille

```ts
{ accuracy?: LocationAccuracy, timeInterval?: number, distanceInterval?: number }
```

`distanceInterval` est la distance en mètres que l'appareil parcourt avant la prochaine mise à jour (0,
la valeur par défaut, est chaque relevé). `timeInterval` est le délai minimal entre deux mises à jour en
millisecondes, 1000 par défaut ; il ne concerne qu'Android, car iOS livre les relevés au fur
et à mesure. Chaque veille a sa propre requête sur la plateforme, deux veilles gardent donc
leurs propres options, et la dernière qui se termine, ou un rechargement, arrête les radios.

`location.error` contient l'erreur qui met fin à une veille. Sur iOS, c'est l'accès révoqué
pendant que l'app tourne (`ERR_PERMISSION`) ; un relevé que la plateforme ne peut pas encore obtenir n'est pas
une erreur, et la veille continue d'essayer. Android termine le processus de l'app quand
l'accès est révoqué, une veille n'y prend donc pas fin par une erreur.

## Mises à jour en arrière-plan

Une tâche de localisation continue de recevoir des relevés pendant que l'app est en arrière-plan, et
à travers ses redémarrages. C'est une
[tâche d'arrière-plan](background-tasks.md) que la plateforme exécute à chaque
lot de relevés, dans le runtime UI de l'app quand il tourne et dans un runtime headless
quand il ne tourne pas.

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

`startUpdates` prend [les options de `watch`](#watching) et celles-ci :

| Option                             | Plateforme | Fait                                                                                                                       |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pausesUpdatesAutomatically`       | iOS        | Laisse Core Location suspendre les mises à jour tant que l'appareil reste immobile. Désactivé par défaut, comme dans Expo. |
| `showsBackgroundLocationIndicator` | iOS        | Affiche la pastille bleue de la barre d'état pendant que l'app localise en arrière-plan.                                   |
| `notification: { title?, body? }`  | Android    | La notification du service de premier plan. Le nom de l'app et une ligne générique par défaut.                             |

La tâche reçoit `{ name, deadline, locations }` : les relevés du lot, le plus ancien
en premier, et le moment où la plateforme cesse d'attendre l'exécution, en millisecondes depuis
l'epoch. Résolvez une fois qu'ils sont traités ; une tâche qui lève ou rejette
signale une exécution échouée à la LogBox ou au journal de l'appareil, et les mises à jour continuent.
Une exécution accompagne chaque relevé, gardez donc la tâche courte, ou regroupez le travail sur plusieurs
exécutions. `startUpdates` pour un nom que `defineUpdates` n'a pas défini
rejette immédiatement. Redémarrer une tâche remplace ses options.

**Déclarer `locationAlways` l'active.** La CLI ajoute le mode d'arrière-plan `location`
à l'Info.plist, et sur Android le service de premier plan
`KuitoLocationService` (type `location`) avec
`FOREGROUND_SERVICE` et `FOREGROUND_SERVICE_LOCATION`. Sans la
déclaration, `startUpdates` rejette avec `ERR_UNDECLARED` : iOS termine une
app qui localise en arrière-plan sans ce mode. Les revues de l'App Store et de Google
Play demandent à quoi l'app utilise la localisation en arrière-plan, ne la déclarez donc
que dans une app qui s'en sert.

**Permissions.** Les mises à jour démarrent avec la permission `location`, comme dans Expo,
depuis le premier plan : iOS continue alors de localiser en arrière-plan avec
l'indicateur bleu, et Android avec sa notification. `locationAlways` va
plus loin : sans l'indicateur sur iOS, et, là, en relançant l'app après
qu'elle a été terminée (ci-dessous). Android 12 et les versions ultérieures refusent de démarrer un service
de premier plan depuis l'arrière-plan, `startUpdates` y rejette donc avec
`ERR_UNAVAILABLE` ; démarrez-le depuis une action de l'utilisateur.

**Redémarrages.** La plateforme conserve les tâches démarrées d'un lancement à l'autre, et
`defineUpdates` reprend les mises à jour d'une tâche quand les modules de l'app s'exécutent
de nouveau, jusqu'à `stopUpdates`. Une permission révoquée les arrête pour
de bon.

- **iOS** : les mises à jour s'arrêtent quand l'app est terminée. Avec `locationAlways`
  accordée, iOS surveille aussi les changements significatifs (environ 500 m) et
  relance l'app sans UI à chacun ; le shell démarre un runtime headless,
  la définition de la tâche reprend les mises à jour, et les exécutions suivent. Sans elle,
  les mises à jour reprennent la prochaine fois que l'utilisateur ouvre l'app.
- **Android** : le service de premier plan est persistant (sticky). Quand Android termine le
  processus de l'app, il redémarre le service, et le premier relevé démarre un
  runtime headless. Le service s'arrête avec la dernière tâche, et quand l'utilisateur
  arrête l'app depuis les Réglages.

Pendant que l'UI tourne, les exécutions vont à son runtime ; un runtime headless démarré pour
elles reste actif entre les relevés, et l'UI reprend les exécutions une fois ouverte. Le
résultat de chaque exécution n'atteint le journal de l'appareil que lorsqu'elle échoue.

## Valeurs

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

Un champ que la plateforme ne connaît pas vaut `null` : pas d'altitude sans relevé
vertical, pas de `heading` ni de `speed` à l'arrêt. `mocked` est une localisation simulée :
celle du simulateur iOS, ou celle d'une app de localisation fictive sur Android. Le
`adb emu geo fix` de l'émulateur atteint l'app comme un vrai relevé GPS.

L'`accuracy` du cap diffère comme dans Expo : des degrés d'erreur sur iOS, le
calibrage de la boussole de 0 (aucun) à 3 (élevé) sur Android. Android dérive
`trueHeading` du cap magnétique et de la déclinaison au dernier relevé
connu, il vaut donc `null` tant qu'il n'y en a pas ; iOS le signale comme Core Location le fait.
Un appareil sans boussole (le simulateur iOS) rejette `watchHeading` avec
`ERR_UNAVAILABLE`.

`geocode` résout `{ latitude, longitude, altitude, accuracy }` pour chaque
correspondance ; le géocodeur d'Android ne donne ni altitude ni précision. `reverseGeocode`
résout des adresses :

| Champ              | iOS (`CLPlacemark`)     | Android (`Address`)         |
| ------------------ | ----------------------- | --------------------------- |
| `name`             | `name`                  | `featureName`               |
| `streetNumber`     | `subThoroughfare`       | `subThoroughfare`           |
| `street`           | `thoroughfare`          | `thoroughfare`              |
| `district`         | `subLocality`           | `subLocality`               |
| `city`             | `locality`              | `locality`                  |
| `subregion`        | `subAdministrativeArea` | `subAdminArea`              |
| `region`           | `administrativeArea`    | `adminArea`                 |
| `postalCode`       | `postalCode`            | `postalCode`                |
| `country`          | `country`               | `countryName`               |
| `isoCountryCode`   | `isoCountryCode`        | `countryCode`               |
| `timezone`         | `timeZone`              | `null`                      |
| `formattedAddress` | `null`                  | la première ligne d'adresse |

Les deux géocodeurs sont des services en ligne avec des limites de débit : géocodez sur une action
de l'utilisateur, pas à chaque relevé. Une adresse sans correspondance résout `[]`. Le
géocodeur d'Android fait partie des services système de Google ; un appareil qui en est dépourvu (certaines
builds AOSP) rejette avec `ERR_UNAVAILABLE`.

## Erreurs

| Code                       | Signification                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_PERMISSION`           | L'app n'a pas la permission `location`.                                                                                                             |
| `ERR_SERVICES_DISABLED`    | Android : tous les fournisseurs de localisation sont désactivés.                                                                                    |
| `ERR_LOCATION_UNAVAILABLE` | iOS : Core Location n'a pas pu obtenir de relevé.                                                                                                   |
| `ERR_UNAVAILABLE`          | Pas de boussole pour `watchHeading`, pas de géocodeur sur Android, ou mises à jour en arrière-plan démarrées depuis l'arrière-plan sur Android 12+. |
| `ERR_GEOCODE`              | Le géocodeur a échoué : hors ligne, ou limite de débit atteinte.                                                                                    |
| `ERR_UNDECLARED`           | Mises à jour en arrière-plan sans `locationAlways` déclarée.                                                                                        |

Des options invalides (une `accuracy` inconnue, un intervalle négatif, une latitude au-delà de
±90) lèvent un `TypeError` sous forme de rejet, avant que quoi que ce soit n'atteigne la plateforme.

## Différences avec Expo

- **Les permissions vivent dans `permissions`.** Le
  `requestForegroundPermissionsAsync` d'Expo est `permissions.request('location')`,
  et `requestBackgroundPermissionsAsync` est
  `permissions.request('locationAlways')`, de la même manière pour chaque module
  ([pourquoi](permissions.md#differences-from-expo)).
- **Les tâches de localisation sont définies dans `location`.** Le
  `TaskManager.defineTask(name, ({ data: { locations } }) => …)` d'Expo est
  `location.defineUpdates(name, ({ locations }) => …)` : des relevés typés, pas de
  `data` à déballer, et une `error` est une exécution échouée plutôt qu'un argument.
  Les `deferredUpdatesInterval`, `deferredUpdatesDistance` et
  `activityType` d'Expo n'y sont pas encore.
- **Les noms perdent `Async` et `get`, la position est un signal, et la précision est
  une chaîne.** `getCurrentPositionAsync` est `current`, `watchPositionAsync` est
  `watch` et `position` ; `Accuracy.High` est `'high'`.
- **Pas de Play Services sur Android.** Expo utilise le
  `FusedLocationProviderClient` de Google, environ un mégaoctet de dépendance. Les fournisseurs
  de la plateforme donnent les mêmes relevés sur un téléphone avec GPS ; en intérieur sans
  balayage Wi-Fi, un relevé `high` peut mettre plus de temps à arriver. `current` attend
  le premier relevé que le fournisseur livre, sans délai d'expiration propre.

## Pas encore

- **Geofencing** (`startGeofencingAsync`) et `enableNetworkProviderAsync`.
