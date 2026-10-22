# Open URLs and handle incoming links

Open external websites or apps, and receive URLs that launched or returned to your app. Use typed routes for navigation between your own screens.

## Open a URL and inspect incoming links

```tsx
import { watch, linking } from 'kuito';

await linking.open('https://www.tvmaze.com');
if (await linking.canOpen('mailto:hi@example.com')) await linking.open('mailto:hi@example.com');

linking.url.value; // 'kuito://show/42', or null
watch(linking.url, (url) => console.log(url)); // in a component
```

## Behavior and limits

`canOpen` checks whether the platform can handle a URL; its answer can depend on platform query declarations. `open` attempts the action and can reject. `linking.url` follows incoming URLs. Enable router linking explicitly and declare URL schemes or verified domains in config before expecting the OS to open your app. Verify associated-domain files on your server for universal/app links.

## Continue

Read [Navigation](navigation.md) for the related workflow. The API reference lists every method, option, event and return type.
