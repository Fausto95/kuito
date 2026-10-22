# network

The device's network: its type, whether it is up and whether it reaches the
internet. On iOS it is `NWPathMonitor`; on Android, `ConnectivityManager`'s
default-network callback. Neither polls, and neither needs Play Services.

```tsx
import { Text, network } from 'kuito';

network.state.value; // the state now, synchronously
await network.refresh(); // the same, read off the JS thread

function OfflineBanner() {
  return <Text>{network.state.value.isInternetReachable ? '' : 'You are offline'}</Text>;
}
```

| Member      | Is                                                                              |
| ----------- | ------------------------------------------------------------------------------- |
| `state`     | A signal of the state. Watched, it follows each change; unwatched, a read asks. |
| `refresh()` | The state now, as a Promise. Use it where blocking JS is unwelcome.             |

## The state

```ts
import { network } from 'kuito';

type NetworkState = {
  type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';
  isConnected: boolean;
  isInternetReachable: boolean;
  details: { isExpensive: boolean; cellularGeneration: '2g' | '3g' | '4g' | '5g' | null };
};

const now: NetworkState = network.state.value;
```

| Field                        | iOS (`NWPath`)                                       | Android (`NetworkCapabilities` of the default network)      |
| ---------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| `type`                       | the interface the path uses; `none` when unsatisfied | the network's transport; `none` without a network           |
| `isConnected`                | `status` is not `unsatisfied`                        | `NET_CAPABILITY_INTERNET`                                   |
| `isInternetReachable`        | `status` is `satisfied`                              | `NET_CAPABILITY_VALIDATED`                                  |
| `details.isExpensive`        | `isExpensive` (cellular, a personal hotspot)         | not `NET_CAPABILITY_NOT_METERED`                            |
| `details.cellularGeneration` | `CTTelephonyNetworkInfo`'s radio for data            | `TelephonyManager.dataNetworkType`, with `READ_PHONE_STATE` |

Any other transport (a VPN without an underlying one, Bluetooth, loopback)
reads as `unknown`. `cellularGeneration` is null off cellular.

### Why no reachability probe

`isInternetReachable` is the platform's own verdict, and Kuito makes no
request of its own. Android validates each network itself: it probes once
when the network comes up, re-checks when apps report failures, and keeps a
captive portal unvalidated until it is signed in, so `VALIDATED` is as good
as an app's probe without the traffic. iOS has no validation flag; a
`satisfied` path means a route that can carry traffic, so a Wi-Fi with a
captive portal can read as reachable there. netinfo's probe would catch that
case at the cost of a request to a fixed URL on every change, a server
dependency and a delay before the answer. Probe your own backend if your app
needs certainty about it.

## Watching

`state` changes when any field differs from the last state. The platform
monitors only while something watches it: the first component that reads
`network.state` in JSX or a `watch` starts `NWPathMonitor` or registers the
network callback, and the last one to unmount stops it.

## Platform notes

- **Android `cellularGeneration` needs `READ_PHONE_STATE`.** The shell does
  not declare or request it, so the generation is null until the app is
  granted that permission. 5G non-standalone reads as `4g`: Android reports
  it only through `TelephonyDisplayInfo`, which needs a listener per change.
- **Android needs `ACCESS_NETWORK_STATE`,** a normal permission the module's
  spec declares, so only apps that use `network` ask for it.
- **The iOS simulator follows the Mac's network.** It reports the Mac's
  connection as `wifi` (or `ethernet`), never `cellular`, and
  `cellularGeneration` is null. Turning the Mac's Wi-Fi off reaches the app as
  `none`. Network Link Conditioner shapes speed and loss but leaves the path
  `satisfied`. Cellular and Low Data Mode need a device.
- **An unwatched read on iOS** starts a one-shot `NWPathMonitor` and waits
  for its first path, which takes milliseconds; it gives up after a second
  with `unknown`. While something watches the state, a read answers from the
  running monitor.
