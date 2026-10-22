# network

Le réseau de l'appareil : son type, s'il est actif et s'il atteint Internet.
Sur iOS c'est `NWPathMonitor` ; sur Android, le callback de réseau par défaut
de `ConnectivityManager`. Aucun des deux ne sonde en boucle, et aucun n'a
besoin de Play Services.

```tsx
import { Text, network } from 'kuito';

network.state.value; // the state now, synchronously
await network.refresh(); // the same, read off the JS thread

function OfflineBanner() {
  return <Text>{network.state.value.isInternetReachable ? '' : 'You are offline'}</Text>;
}
```

| Membre      | Est                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------- |
| `state`     | Un signal de l'état. Observé, il suit chaque changement ; non observé, une lecture interroge. |
| `refresh()` | L'état actuel, sous forme de Promise. Utilisez-le là où bloquer JS est malvenu.               |

## L'état

```ts
{
  type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown',
  isConnected: boolean,
  isInternetReachable: boolean,
  details: { isExpensive: boolean, cellularGeneration: '2g' | '3g' | '4g' | '5g' | null },
}
```

| Champ                        | iOS (`NWPath`)                                                          | Android (`NetworkCapabilities` du réseau par défaut)        |
| ---------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `type`                       | l'interface que le chemin utilise ; `none` quand il n'est pas satisfait | le transport du réseau ; `none` sans réseau                 |
| `isConnected`                | `status` n'est pas `unsatisfied`                                        | `NET_CAPABILITY_INTERNET`                                   |
| `isInternetReachable`        | `status` est `satisfied`                                                | `NET_CAPABILITY_VALIDATED`                                  |
| `details.isExpensive`        | `isExpensive` (cellulaire, un partage de connexion)                     | pas `NET_CAPABILITY_NOT_METERED`                            |
| `details.cellularGeneration` | la radio de données de `CTTelephonyNetworkInfo`                         | `TelephonyManager.dataNetworkType`, avec `READ_PHONE_STATE` |

Tout autre transport (un VPN sans transport sous-jacent, Bluetooth, boucle
locale) se lit comme `unknown`. `cellularGeneration` est null hors cellulaire.

### Pourquoi pas de sonde de joignabilité

`isInternetReachable` est le verdict de la plateforme elle-même, et Kuito ne
fait aucune requête de son côté. Android valide chaque réseau lui-même : il
sonde une fois quand le réseau apparaît, revérifie quand les apps signalent des
échecs, et garde un portail captif non validé jusqu'à ce qu'on s'y connecte,
`VALIDATED` vaut donc la sonde d'une app sans le trafic. iOS n'a pas de drapeau
de validation ; un chemin `satisfied` signifie une route qui peut porter du
trafic, un Wi-Fi avec portail captif peut donc s'y lire comme joignable. La
sonde de netinfo attraperait ce cas au prix d'une requête vers une URL fixe à
chaque changement, d'une dépendance à un serveur et d'un délai avant la
réponse. Sondez votre propre backend si votre app a besoin de certitude à son
sujet.

## Observation

`state` change quand un champ quelconque diffère de l'état précédent. La
plateforme ne surveille que tant que quelque chose l'observe : le premier
composant qui lit `network.state` dans du JSX ou un `watch` démarre
`NWPathMonitor` ou enregistre le callback réseau, et le dernier à se démonter
l'arrête.

## Notes par plateforme

- **`cellularGeneration` sur Android nécessite `READ_PHONE_STATE`.** Le shell
  ne la déclare ni ne la demande, la génération est donc null tant que l'app
  n'a pas obtenu cette permission. La 5G non autonome se lit comme `4g` :
  Android ne la rapporte que par `TelephonyDisplayInfo`, qui nécessite un
  écouteur par changement.
- **Android nécessite `ACCESS_NETWORK_STATE`,** une permission normale que la
  spec du module déclare, seules les apps qui utilisent `network` la demandent
  donc.
- **Le simulateur iOS suit le réseau du Mac.** Il rapporte la connexion du Mac
  comme `wifi` (ou `ethernet`), jamais `cellular`, et `cellularGeneration` est
  null. Couper le Wi-Fi du Mac parvient à l'app comme `none`. Network Link
  Conditioner façonne le débit et les pertes mais laisse le chemin
  `satisfied`. Le cellulaire et le mode Données faibles nécessitent un
  appareil.
- **Une lecture non observée sur iOS** démarre un `NWPathMonitor` ponctuel et
  attend son premier chemin, ce qui prend quelques millisecondes ; elle
  abandonne après une seconde avec `unknown`. Tant que quelque chose observe
  l'état, une lecture répond depuis le moniteur en cours.
