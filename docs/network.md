# Respond to connectivity changes

Show an offline hint or defer a large download using the platform network state. Always handle the actual request result as well.

## Display an offline hint

```tsx
import { Text, network } from 'kuito';

network.state.value; // the state now, synchronously
await network.refresh(); // the same, read off the JS thread

function OfflineBanner() {
  return <Text>{network.state.value.isInternetReachable ? '' : 'You are offline'}</Text>;
}
```

## Behavior and limits

`network.state` tracks connection type, connection status, reachability and cost. `refresh()` gets a fresh snapshot asynchronously. Reachability is the platform verdict, not a probe of your server. On iOS a satisfied route can still lead to a captive portal. A connected device can still fail a request, so network status must not replace error handling. Monitoring starts while the signal is observed and stops when the last observer leaves.

## Continue

Read [Web apis](web-apis.md) for the related workflow. The API reference lists every method, option, event and return type.
