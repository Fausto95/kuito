# Develop on a physical phone

Use a phone to test camera input, permissions, haptics and real frame timing. `kuito dev` builds the native shell, installs it and sends code changes while it runs.

## Run on iPhone

1. Pair the phone with the Mac in Xcode and trust the Mac on the phone.
2. Set `ios.teamId` in `kuito.config.ts` to your development team.
3. Select the device returned by `kuito devices`.

```sh
kuito devices
kuito dev ios --device "My iPhone"
```

Kuito uses the paired CoreDevice tunnel over USB or Wi-Fi. The CLI discovers the tunnel address, starts the dev server there and launches the app with the URL and a per-session token. No manual LAN address or pairing code is needed.

Launch the development app through `kuito dev`. Opening it from the home screen does not provide the server URL or token. If the tunnel changes, relaunch with `r` in the CLI.

## Run on Android

Enable USB debugging, connect the phone and accept its debugging prompt. Select its identifier:

```sh
adb devices
kuito dev android --device DEVICE_SERIAL
```

Android uses `adb reverse` to reach the development server on the computer's loopback interface. Wireless debugging uses the Android pairing flow.

## Fix a connection

| Symptom                          | Next step                                                         |
| -------------------------------- | ----------------------------------------------------------------- |
| Device absent                    | Check pairing, cable, trust prompt and the platform tools         |
| iOS signing failure              | Check `ios.teamId` and Xcode's account/certificates               |
| No unique iOS tunnel address     | Reconnect the device and retry the CLI launch                     |
| Token rejected                   | Relaunch from the current `kuito dev` session                     |
| Phone disconnected after a crash | Reopen it; inspect platform logs and the next-launch crash report |

The dev server requires the session token for every route and socket. Do not share debugger URLs. The token is passed through the process environment, not embedded in the app. Release builds have no development connection.

Use Console.app for iPhone logs; the terminal's `l` shortcut streams simulator logs. See [DevTools](devtools.md), [signing](release-builds.md) and [crash reports](crash-reports.md).
