# Read device information

Use device metadata for support diagnostics and platform-specific presentation. These fields describe the device and operating system; they are not a stable user identity.

## Build a support summary

```tsx
import { device } from 'kuito';

device.model; // 'iPhone 16 Pro', 'Pixel 8'
device.type === 'tablet';
if (!device.physical) console.log('on a simulator');
```

## Behavior and limits

Read `osName`, `osVersion`, model, type and physical-device information to explain a bug report. Android-specific fields such as API level do not have equivalent values on every platform. Test capability-dependent features directly rather than inferring availability from a marketing model name.

## Continue

Read [Window](window.md) for the related workflow. The API reference lists every method, option, event and return type.
