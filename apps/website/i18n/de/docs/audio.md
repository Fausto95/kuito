# audio

Sounds abspielen und das Mikrofon aufnehmen: AVPlayer und AVAudioRecorder auf iOS,
MediaPlayer und MediaRecorder auf Android. Mehrere Player können gleichzeitig
abspielen; die Audio-Session der App (Stummschalter, Mischen, Ducking, Hintergrund)
ist ein einziger Aufruf; Unterbrechungen wie ein Telefonanruf pausieren alles und
informieren die App.

```tsx
import { Box, Button, VStack, Text, audio } from 'kuito';

function Track() {
  // The component owns it: made when it mounts, released when it unmounts.
  const song = audio.player('https://example.com/song.mp3', { loop: true });
  const { time, duration } = song;

  return (
    <VStack>
      {/* A 280-point bar that fills from the left, moved on the UI thread. */}
      <Box width={280} height={4} overflow="hidden">
        <Box
          width={280}
          height={4}
          backgroundColor="#e50914"
          translateX={duration.value > 0 ? (time.value / duration.value - 1) * 280 : -280}
        />
      </Box>
      <Button onPress={() => (song.playing.value = !song.playing.value)}>
        {song.playing.value ? 'Pause' : 'Play'}
      </Button>
      <Button onPress={() => void song.seek(time.value + 30)}>Skip</Button>
    </VStack>
  );
}

function Memo() {
  const recorder = audio.recorder({ quality: 'medium', metering: true });

  onMount(() => void audio.configure({ allowsRecording: true }));

  return (
    <VStack>
      <Box height={8} backgroundColor="#e5484d" opacity={1 + recorder.level.value / 60} />
      <Button onPress={() => void recorder.start()}>Record</Button>
      <Button onPress={async () => console.log((await recorder.stop()).uri)}>Stop</Button>
    </VStack>
  );
}
```

## Player

`audio.player(src, options)` gibt sofort einen Player zurück. Er gehört der
Komponente, die ihn während ihres Aufbaus aufruft (ein [Scope-Effekt](native-modules.md#scope-effects)):
der native Player wird erzeugt, wenn die Komponente gemountet wird, und freigegeben,
wenn sie unmountet wird; ein erneutes Rendern oder ein Live Patch behält denselben
bei. Außerhalb einer Komponente wird `{ scope: app }` übergeben, um einen Player zu
erhalten, den die App für ihre gesamte Lebensdauer hält; ein Aufruf ohne beides
wirft einen Fehler, der dies benennt.

Die Quelle wird im Hintergrund geladen, und `loaded` wird true, sobald sie bereit
ist. Ein Abspielen davor startet, sobald sie es ist; auf Android wird `seek` davor
mit `ERR_NOT_LOADED` abgelehnt.

| Quelle                                        | Hinweise                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `'https://…'`, `{ uri }`                      | gestreamt; Android blockiert unverschlüsseltes `http://` standardmäßig |
| `'file://…'`, z. B. ein `fileSystem`-Download | schlägt mit `ERR_NOT_FOUND` fehl, wenn dort nichts liegt               |
| `'asset:///name'`, `fileSystem.bundle`        | eine Datei im App-Bundle (iOS) oder in den Assets der APK (Android)    |

| Option   | Standard | Hinweise                               |
| -------- | -------- | -------------------------------------- |
| `volume` | `1`      | 0 bis 1                                |
| `rate`   | `1`      | 0,5 bis 2; die Tonhöhe bleibt erhalten |
| `loop`   | `false`  | beginnt am Ende von vorn               |
| `scope`  | —        | `app` für den app-eigenen Player       |

| Member                   | Ist                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `playing`                | Ein Zwei-Wege-Signal: die Zuweisung von `true` spielt ab, `false` pausiert. Nach dem Ende beginnt das Abspielen von vorn. |
| `volume`, `rate`, `loop` | Zwei-Wege-Signale: eine Zuweisung ist sofort sichtbar und wird an die Plattform weitergereicht.                           |
| `loaded`, `buffering`    | Signale des Plattformzustands.                                                                                            |
| `error`                  | Ein Signal: warum die Quelle nicht geladen oder abgespielt werden konnte, oder `null`.                                    |
| `time`                   | Ein Motion-Wert: Sekunden seit dem Anfang, während des Abspielens vom UI-Thread bewegt.                                   |
| `duration`               | Ein Motion-Wert: Sekunden, 0 bis zum Laden und bei einem Live-Stream.                                                     |
| `play()`, `pause()`      | Dasselbe wie die Zuweisung von `playing`, als Promise.                                                                    |
| `seek(seconds)`          | Exakt, nicht zum nächsten Keyframe.                                                                                       |
| `watch('ended', fn)`     | Ruft `fn` jedes Mal auf, wenn das Abspielen das Ende erreicht; bei einem loopenden Player bei jedem Durchlauf.            |

Ein Schreibvorgang, den die Plattform ablehnt, setzt das Signal zurück und geht
durch die Fehlerschnittstelle; ein Wert außerhalb des Bereichs (eine Lautstärke
über 1) wird auf dieselbe Weise abgelehnt. Argumentfehler in `audio.player` selbst
(eine Quelle, die keine URI ist) sind `TypeError`s, bevor irgendetwas die Grenze
überquert.

### Zeit ohne Events

Die Plattform meldet einen Player nur, wenn sich sein Zustand ändert: er startet
oder stoppt, puffert, springt, endet oder ändert die Geschwindigkeit. Es gibt
keinen periodischen Fortschrittsbericht. Jeder Bericht verankert `time`: während
der Player abspielt, gibt der Kernel dem UI-Thread ein lineares Timing von der
gemeldeten Zeit bis zum Ende in der Geschwindigkeit des Players, und der
UI-Thread bewegt `time` in jedem Frame daran entlang; pausiert, ladend oder
puffernd hält `time` dort, wo die Plattform es gemeldet hat. Eine an `time`
gebundene Fortschrittsleiste kostet den JS-Thread also nichts, während der Song
läuft, und ein Lesen von `time.value` auf dem JS-Thread liefert, wo der UI-Thread
es gerade hat.

## Recorder

`audio.recorder(options)` gibt einen Recorder zurück, der auf dieselbe Weise
besessen wird; nichts berührt das Mikrofon bis zu `start`.

| Option     | Standard | Hinweise                                                     |
| ---------- | -------- | ------------------------------------------------------------ |
| `format`   | `'aac'`  | `'aac'` schreibt `.m4a`; `'wav'` ist 16-Bit-PCM, **nur iOS** |
| `quality`  | `'high'` | siehe unten                                                  |
| `metering` | `false`  | misst den Eingangspegel in `level`                           |
| `scope`    | —        | `app` für den app-eigenen Recorder                           |

| Qualität | Abtastrate | Kanäle | AAC-Bitrate |
| -------- | ---------- | ------ | ----------- |
| `low`    | 22 050 Hz  | 1      | 64 kbps     |
| `medium` | 44 100 Hz  | 1      | 96 kbps     |
| `high`   | 44 100 Hz  | 2      | 128 kbps    |

| Member      | Ist                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `start()`   | Fragt nach dem Mikrofon, beginnt dann eine neue Datei im Cache-Verzeichnis oder setzt eine pausierte fort.              |
| `pause()`   | Pausiert die Datei; `start` setzt sie fort.                                                                             |
| `stop()`    | Schließt die Datei ab und löst `{ uri, duration }` auf; der nächste `start` beginnt eine neue Datei.                    |
| `recording` | Ein Signal.                                                                                                             |
| `time`      | Ein Motion-Wert: aufgenommene Sekunden, während der Aufnahme vom UI-Thread bewegt.                                      |
| `level`     | Ein Motion-Wert: der Eingangspegel in dBFS, −160 (Stille) bis 0, beim Metering zwischen den Samples weich interpoliert. |
| `error`     | Ein Signal: warum der Recorder nicht erzeugt werden konnte.                                                             |

Beim Metering tastet die Plattform den Pegel alle 100 ms ab, und der UI-Thread
führt `level` über dieselbe Zeitspanne weich an jedes Sample heran; ohne Metering
meldet ein Recorder nur, wenn er startet und stoppt. Das Unmounten seiner
Komponente stoppt ihn, löscht eine unfertige Datei und gibt ihn frei.

Die Mikrofonberechtigung läuft über [permissions](permissions.md):
`permissions.microphone` in `kuito.config.ts` deklarieren, sonst wird `start`
mit `ERR_PERMISSION` abgelehnt und benennt dies. `start` fragt nach, wenn der
Benutzer noch nicht geantwortet hat, und wird mit `ERR_PERMISSION` abgelehnt,
wenn er ablehnt. Auf iOS ist außerdem zuerst
`audio.configure({ allowsRecording: true })` nötig, sonst wird mit
`ERR_AUDIO_MODE` abgelehnt.

Android hat keinen WAV-Encoder in MediaRecorder: ein `'wav'`-Recorder schlägt
dort mit `ERR_UNSUPPORTED` fehl, und sein `error` benennt dies.

## Der Audio-Modus

`audio.configure(changes)` führt `changes` mit dem bisher gesetzten Modus
zusammen; Schlüssel, die es auslässt, behalten ihren Wert. Player und Recorder
verwenden die Standardwerte, bis die App sie konfiguriert.

| Schlüssel                 | Standard | iOS (AVAudioSession)                                            | Android                                              |
| ------------------------- | -------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| `playsInSilentMode`       | `true`   | `.playback`; sonst `.soloAmbient`, oder `.ambient` beim Mischen | kein Stummschalter: ignoriert                        |
| `mixWithOthers`           | `false`  | `.mixWithOthers`                                                | fordert keinen Audiofokus an                         |
| `duckOthers`              | `false`  | `.duckOthers` (und `.playback`)                                 | `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`                 |
| `allowsRecording`         | `false`  | `.playAndRecord`, auf den Lautsprecher und Bluetooth            | ignoriert: die Aufnahme braucht nur die Berechtigung |
| `staysActiveInBackground` | `false`  | `.playback`; braucht `ios.backgroundModes: ['audio']`           | ein Foreground-Service für Medienwiedergabe          |

Der Modus gehört der App, nicht allein den Playern von `audio`: [Videos](video.md#audio-the-background-and-picture-in-picture)
spielen ebenfalls darunter.

Ohne `staysActiveInBackground` pausieren Player und Recorder, wenn die App in den
Hintergrund geht, auf beiden Plattformen. Mit ihm braucht iOS den
Audio-Hintergrundmodus in `kuito.config.ts`
([native Einstellungen](apps.md#native-settings)); `configure` wird mit
`ERR_AUDIO_MODE` abgelehnt und benennt dies, wenn er fehlt.

Auf Android startet ein Player, der in diesem Modus abspielt, oder ein
[Video](video.md#audio-the-background-and-picture-in-picture), einen
Foreground-Service für Medienwiedergabe, der den Prozess am Leben hält und eine
Medienbenachrichtigung mit dem Namen der App und einer Play/Pause-Steuerung zeigt
(ab Android 13 in den Mediensteuerungen der Schnelleinstellungen). Das Modul
deklariert den Service und die Berechtigungen `FOREGROUND_SERVICE` und
`FOREGROUND_SERVICE_MEDIA_PLAYBACK` in seiner Spezifikation
(`native/modules/audio/audio.ts`), sodass eine App, die `audio` importiert, keine
eigene Einstellung braucht. Medienbenachrichtigungen brauchen die
Benachrichtigungsberechtigung nicht. Die Benachrichtigung folgt den Playern:

| Was passiert                                                    | Der Service und die Benachrichtigung                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ein Player oder ein Video spielt ab                             | im Vordergrund; die Steuerung pausiert alle                                              |
| die Pause der Benachrichtigung                                  | aus dem Vordergrund; die Benachrichtigung bleibt, kann weggewischt werden und setzt fort |
| ein Anruf oder eine andere vorübergehende Unterbrechung         | bleibt im Vordergrund, damit die App fortsetzen kann, wenn `ended` eintrifft             |
| die App pausiert, der letzte Player endet oder wird freigegeben | gestoppt, und die Benachrichtigung verschwunden                                          |
| `configure` schaltet `staysActiveInBackground` aus              | gestoppt                                                                                 |

Ab Android 12 startet ein Foreground-Service nur, während die App im Vordergrund
ist, oder aus seiner Benachrichtigung heraus: `play` in diesem Modus aus dem
Hintergrund wird mit `ERR_AUDIO_MODE` abgelehnt, und der Player bleibt pausiert.
Das Abspielen sollte gestartet werden, bevor die App den Bildschirm verlässt. Die
Benachrichtigung nennt keinen Titel: Player tragen keine Metadaten.

## Unterbrechungen

Ein Telefonanruf, ein Wecker oder eine andere App, die den Audiofokus übernimmt,
pausiert jeden Player und Recorder, und `audio.watch('interruption', fn)` empfängt
`{ type: 'began' }`, dann `{ type: 'ended', shouldResume }`, wenn sie vorbei ist.
Das Fortsetzen ist Sache der App: `shouldResume` ist der Vorschlag des Systems. In
einer Komponente endet der Watch, wenn sie unmountet wird; andernorts beendet ihn
das `remove()` des zurückgegebenen Abonnements.

- iOS: `AVAudioSession.interruptionNotification`; `shouldResume` ist dessen
  Option `.shouldResume`.
- Android: Verlust des Audiofokus. Ein vorübergehender Verlust (ein Anruf) endet
  mit der Rückkehr des Fokus und `shouldResume: true`; ein dauerhafter Verlust
  (eine andere Medien-App) endet nie. Eine Ducking-Anfrage wird vom System
  behandelt, das die Lautstärke dieser App selbst senkt.

## Player und Recorder sind native Objekte

Jeder Player und Recorder ist ein natives Objekt, das das Modul unter einer ID
hält. Sein Scope gibt ihn frei: die Komponente, die ihn erzeugt hat, wenn sie
unmountet wird, oder, bei `{ scope:
app }`, ein Reload, der jedes zusammen mit der Runtime freigibt. Es gibt kein
`release()`, das vergessen werden könnte. Die Plattform vergibt die IDs, sodass
ein Live Patch, der dieses Modul neu auswertet, nie eine wiederverwendet, die ein
lebendes Objekt noch hat.

## Warum MediaPlayer und nicht Media3

Android spielt über MediaPlayer ab und nimmt über MediaRecorder auf, beide in der
Plattform, und seine Hintergrundbenachrichtigung verwendet die MediaSession der
Plattform: das Modul fügt keine Abhängigkeit hinzu. Media3 (ExoPlayer) fügt etwa
1,5 MB hinzu und bringt lückenlose Wiedergabelisten, adaptive Streams (HLS, DASH)
und eine Media-Session, von denen diese API nichts bereitstellt. [Video](video.md)
braucht diese und verwendet Media3. `audio` kann darauf umziehen, ohne seine
JavaScript-API zu ändern, und eine App, die Videos rendert, würde dann einmal für
Media3 zahlen; eine, die nur `audio` importiert, zahlt nichts. iOS verwendet
AVFoundation, das mit dem System ausgeliefert wird.

## Fehler

| Code                | Bedeutung                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_NOT_FOUND`     | Nichts an einer `file://`- oder `asset:///`-Quelle, oder der Player wurde freigegeben.                                             |
| `ERR_PERMISSION`    | Die Mikrofonberechtigung wurde verweigert oder ist nicht in `kuito.config.ts` deklariert.                                         |
| `ERR_AUDIO_MODE`    | iOS: Aufnahme ohne `allowsRecording`, oder Hintergrund ohne den Modus. Android: Abspielen im Hintergrundmodus aus dem Hintergrund. |
| `ERR_RECORDING`     | Der Recorder konnte nicht starten oder wurde gestoppt, bevor er Audio geschrieben hat.                                             |
| `ERR_NOT_RECORDING` | `stop` ohne Aufnahme seit dem letzten `stop`.                                                                                      |
| `ERR_NOT_LOADED`    | Android: `seek`, bevor die Quelle geladen war.                                                                                     |
| `ERR_UNSUPPORTED`   | Android: ein `'wav'`-Recorder.                                                                                                     |

Das native Modul ist `Audio` (`native/modules/audio`); eine App, die `audio` nie
importiert, liefert nichts davon aus.
