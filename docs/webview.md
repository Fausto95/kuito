# WebView

Embed a web page in a native view. Use it for hosted help, web content or a service that only offers a web interface.

## Embed a hosted help page

```tsx
import { WebView } from 'kuito';

export default function Help() {
  return <WebView flex={1} src="https://example.com/help" />;
}
```

## Behavior

Give the view a bounded size. Use `allowedOrigins` to restrict the origins that may load. Use `webViewRef` for navigation and messaging; do not expose privileged app actions to arbitrary page messages.

## Continue

Read [Linking](linking.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/WebView#members) for types and documented defaults.
