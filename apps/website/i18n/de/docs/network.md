# network

Das Netzwerk des Geräts: sein Typ, ob es verfügbar ist und ob es das Internet
erreicht. Auf iOS ist es `NWPathMonitor`; auf Android der
Default-Network-Callback des `ConnectivityManager`. Keines von beiden pollt,
und keines braucht Play Services.

```tsx
import { Text, network } from 'kuito';

network.state.value; // the state now, synchronously
await network.refresh(); // the same, read off the JS thread

function OfflineBanner() {
  return <Text>{network.state.value.isInternetReachable ? '' : 'You are offline'}</Text>;
}
```

| Member      | Ist                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `state`     | Ein Signal des Zustands. Beobachtet folgt es jeder Änderung; unbeobachtet fragt ein Lesen nach. |
| `refresh()` | Der Zustand jetzt, als Promise. Verwenden Sie es dort, wo blockierendes JS unerwünscht ist.     |

## Der Zustand

```ts
{
  type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown',
  isConnected: boolean,
  isInternetReachable: boolean,
  details: { isExpensive: boolean, cellularGeneration: '2g' | '3g' | '4g' | '5g' | null },
}
```

| Feld                         | iOS (`NWPath`)                                                  | Android (`NetworkCapabilities` des Standardnetzwerks)      |
| ---------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `type`                       | die Schnittstelle, die der Pfad nutzt; `none`, wenn unsatisfied | der Transport des Netzwerks; `none` ohne Netzwerk          |
| `isConnected`                | `status` ist nicht `unsatisfied`                                | `NET_CAPABILITY_INTERNET`                                  |
| `isInternetReachable`        | `status` ist `satisfied`                                        | `NET_CAPABILITY_VALIDATED`                                 |
| `details.isExpensive`        | `isExpensive` (Mobilfunk, ein persönlicher Hotspot)             | nicht `NET_CAPABILITY_NOT_METERED`                         |
| `details.cellularGeneration` | das Datenfunknetz von `CTTelephonyNetworkInfo`                  | `TelephonyManager.dataNetworkType`, mit `READ_PHONE_STATE` |

Jeder andere Transport (ein VPN ohne darunterliegenden, Bluetooth, Loopback)
wird als `unknown` gelesen. `cellularGeneration` ist null außerhalb des
Mobilfunks.

### Warum keine Erreichbarkeitsprüfung

`isInternetReachable` ist das Urteil der Plattform selbst, und Kuito stellt
keine eigene Anfrage. Android validiert jedes Netzwerk selbst: Es prüft einmal,
wenn das Netzwerk verfügbar wird, prüft erneut, wenn Apps Fehler melden, und
hält ein Captive Portal unvalidiert, bis es angemeldet ist, sodass `VALIDATED`
so gut ist wie die Prüfung einer App, ohne den Datenverkehr. iOS hat kein
Validierungs-Flag; ein `satisfied`-Pfad bedeutet eine Route, die Datenverkehr
tragen kann, sodass ein WLAN mit Captive Portal dort als erreichbar gelesen
werden kann. Die Prüfung von netinfo würde diesen Fall erfassen, um den Preis
einer Anfrage an eine feste URL bei jeder Änderung, einer Serverabhängigkeit
und einer Verzögerung vor der Antwort. Prüfen Sie Ihr eigenes Backend, wenn
Ihre App diesbezüglich Gewissheit braucht.

## Beobachten

`state` ändert sich, wenn sich ein beliebiges Feld vom letzten Zustand
unterscheidet. Die Plattform überwacht nur, solange etwas sie beobachtet: Die
erste Komponente, die `network.state` in JSX oder einem `watch` liest, startet
`NWPathMonitor` oder registriert den Netzwerk-Callback, und die letzte, die
unmountet, stoppt ihn.

## Plattformhinweise

- **`cellularGeneration` auf Android braucht `READ_PHONE_STATE`.** Die Shell
  deklariert oder fordert es nicht an, sodass die Generation null ist, bis der
  App diese Berechtigung erteilt wird. 5G Non-Standalone wird als `4g`
  gelesen: Android meldet es nur über `TelephonyDisplayInfo`, das einen
  Listener pro Änderung braucht.
- **Android braucht `ACCESS_NETWORK_STATE`,** eine normale Berechtigung, die
  die Spezifikation des Moduls deklariert, sodass nur Apps, die `network`
  verwenden, danach fragen.
- **Der iOS-Simulator folgt dem Netzwerk des Mac.** Er meldet die Verbindung
  des Mac als `wifi` (oder `ethernet`), nie als `cellular`, und
  `cellularGeneration` ist null. Das Ausschalten des WLAN des Mac erreicht die
  App als `none`. Der Network Link Conditioner formt Geschwindigkeit und
  Verlust, lässt den Pfad aber `satisfied`. Mobilfunk und der
  Datensparmodus brauchen ein Gerät.
- **Ein unbeobachtetes Lesen auf iOS** startet einen einmaligen
  `NWPathMonitor` und wartet auf seinen ersten Pfad, was Millisekunden dauert;
  nach einer Sekunde gibt es mit `unknown` auf. Solange etwas den Zustand
  beobachtet, antwortet ein Lesen aus dem laufenden Monitor.
