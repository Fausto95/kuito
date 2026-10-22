# Live Patch on an iPhone

`kuito dev ios --device <phone>` builds, installs and launches the app on a paired
iPhone and patches it over the CoreDevice tunnel. The phone builds with automatic
signing, so `ios.teamId` must be set ([signing](cli.md#signing)).

## Transport: the CoreDevice tunnel

A paired iPhone that Xcode or `devicectl` talks to has a point-to-point IPv6 tunnel to
the Mac, on a `utun` interface with a ULA `/64`: the phone is `::1`, the Mac `::2`
(`xcrun devicectl device info details` prints the phone's side as `Tunnel IP Address`).
CoreDevice brings it up for any request, over Wi-Fi or USB, and authenticates and
encrypts it with the pairing record the user created when they trusted the Mac.

The phone reaches the Mac through it. Measured on an iPhone 16 Pro Max (iOS 27.2):
with a listener on `[fdd1:2ad:47c1::2]:8799` and the unchanged Debug shell launched
with `KUITO_DEV_URL=ws://[fdd1:2ad:47c1::2]:8799`, the shell connected, sent its
`hello` and devtools frames, with no App Transport Security or local-network prompt.

So the dev server listens on loopback, as it does now, and on the Mac's tunnel address
of the chosen phone, never on the Wi-Fi or Ethernet interface. A pinned self-signed TLS
certificate on the LAN address was the alternative: it needs a certificate the shell
trusts, a local-network prompt, and a pairing step of our own, where CoreDevice already
has all three.

## Pairing: a session token

The tunnel admits only the paired phone, but any process on that phone, or on the Mac,
could open a socket to the server. Each `kuito dev` session therefore makes a random
256-bit token. The CLI passes it to the app with the URL at launch, and the shell sends
it in the WebSocket upgrade (`Authorization: Bearer <token>`). The server requires it
on every listener, loopback included ([devtools](devtools.md#debugging-with-chrome-devtools)):
it refuses a request without it, before the upgrade, with a 401 that says the token is
wrong or missing, and compares it in constant time.

The token lives in the CLI process and the app's environment only: not in the build,
not on disk, a new one each session. There is no code for the user to type.

## How the shell learns the URL

`xcrun devicectl device process launch` with `DEVICECTL_CHILD_KUITO_DEV_URL` and
`DEVICECTL_CHILD_KUITO_DEV_TOKEN` in its environment sets the app's, as `SIMCTL_CHILD_`
does on a simulator, over the same encrypted channel. The shell keeps reading `KUITO_DEV_URL`, and reads the token next to
it once, then removes it from its environment. A phone app opened from the home screen
has neither, and dials no server: a phone's `127.0.0.1` is the phone, so only a
simulator falls back to the Mac's loopback. It says to start the app from `kuito dev`.
A server that refuses the app's token (another session's) shows as that, not as an
unreachable server.

The CLI finds the Mac's side of the tunnel by asking `devicectl` for the phone's tunnel
address and picking the local interface address in the same `/64`
(`os.networkInterfaces()`). Only a unique local address (`fc00::/7`) on a `utun`
interface counts, and exactly one must match: none, or several, fails the step and says
what to do. A relaunch (`r`, or a native rebuild) reaches the phone again and follows
its tunnel if it has a new address, restarting the server there.

The server listens only on loopback or such an address, checked against the
interfaces before it listens and against the address it got after: never a wildcard
(`::`, `0.0.0.0`) or a LAN address.

## On a hostile network

The server listens on no LAN address. That does not make the port unreachable from the
Wi-Fi: macOS uses the weak host model, so a host on the network that routes the
tunnel's unique local address to this Mac may reach the listener through the Wi-Fi
interface. The token is the boundary, there as everywhere: without it, every request is
refused before the server does anything. Traffic between the phone and the Mac is
CoreDevice's tunnel, encrypted and bound to the pairing; an attacker on the network can
drop it but neither read nor inject patches. A dropped tunnel looks like a dropped dev
server: the shell retries, and the CLI shows the device as disconnected.

The token never appears on a command line, which `ps` shows every local user: the CLI
hands it to the server and to `devicectl` in their environments, and to Android over
stdin. A process of your own user can still read those environments. On the Mac
measured above, the unified log held no trace of the launch environment
(`log show --predicate 'subsystem BEGINSWITH "com.apple.CoreDevice"'`).

## Release builds

The client side is the Debug shell (`native/ios/App/Debug`, `Devtools`, `LogBox`), which
the Release configuration excludes from compilation (`native/ios/project.yml`,
`EXCLUDED_SOURCE_FILE_NAMES`). A release app has no dev link, reads neither variable and
opens no socket. The server side exists only in `kuito dev`.

## Where it lives

- `src/cli/devices.ts`: `parseTunnelAddress` reads the phone's tunnel address from
  `devicectl device info details`; `hostOnTunnel` finds the Mac's.
- `src/cli/platforms.ts`: `phoneLinkAddress`, and `launchIOS`, which installs and launches
  a phone through `devicectl` with `DEVICECTL_CHILD_KUITO_DEV_URL` and
  `DEVICECTL_CHILD_KUITO_DEV_TOKEN`. In the environment, the token stays out of the
  process list.
- `src/cli/dev.ts`: the session's token, and a server that restarts when the tunnel it
  must listen on changes.
- `src/dev/device-server.ts`: the tunnel listener, which answers 401 without the token.
- `native/ios/App/Devtools/KuitoInspector.mm`: `devRequestTo:` reads the token once and
  adds it to the dev link's and the inspector's upgrade requests.

The Mac cannot reach its own tunnel address, so only the phone can connect to that
listener. A phone's process is not one the Mac can watch, so `kuito dev` watches no
crash for it: a crash shows as the device disconnecting, and the app records it at its
next launch ([crash reports](crash-reports.md)). The `l` shortcut
streams a simulator's logs; a phone's are in Console.app.

Android phones keep `adb reverse` onto loopback and need none of this: adb authenticates
the Mac by its key, and wireless debugging runs over TLS.
