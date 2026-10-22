# Video

Eine Videoplayer-View, nach dem Vorbild von react-native-video und expo-video:
AVPlayer auf iOS, Media3 ExoPlayer auf Android. Sie spielt HLS-Streams,
progressives MP4 und lokale Dateien ab, mit oder ohne die Steuerelemente der
Plattform, geht in den Vollbildmodus und auf iOS in Bild-im-Bild. Mehrere können
gleichzeitig abspielen.

```tsx
import { Box, Button, VStack, Text, Video, videoRef } from 'kuito';

function Trailer() {
  const player = videoRef();

  player.watch('ended', () => console.log('done'));

  return (
    <VStack>
      <Video
        ref={player}
        src={{ uri: 'https://example.com/trailer/master.m3u8' }}
        height={220}
        controls
        onLoad={(event) => console.log(`${event.duration}s`, event.naturalSize)}
        onError={(event) => console.log(event.code, event.message)}
      />
      <Text>{player.playing.value ? 'Playing' : 'Paused'}</Text>
      {/* Moves on the UI thread with player.time. */}
      <Box
        height={4}
        opacity={player.duration.value > 0 ? 0.3 + player.time.value / player.duration.value : 0.3}
      />
      <Button onPress={() => void player.current?.seek(90)}>Skip intro</Button>
      <Button onPress={() => void player.current?.enterFullscreen()}>Fullscreen</Button>
    </VStack>
  );
}
```

Ein `Video` ist eine [native View](native-modules.md#views): es nimmt Style- und
Layout-Props an und hat, wie die View jedes Moduls, keine eigene Größe. Es
braucht eine `height` (und eine `width`, oder man lässt es sich dehnen).

## Quellen

| `src.uri`                                     | Hinweise                                                             |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `https://…/*.m3u8`                            | HLS, adaptiv; ein Live-Stream meldet `duration: null`                |
| `https://…/*.mp4`                             | progressiver Download; Android blockiert unverschlüsseltes `http://` |
| `file://…`, z. B. ein `fileSystem`-Download   | schlägt sofort mit `ERR_NOT_FOUND` fehl, wenn dort nichts liegt      |
| eine [ImagePicker](image-picker.md)-Video-URI | die `file://`-URI, die der Picker zurückgibt, spielt unverändert ab  |

Android erkennt HLS am `.m3u8` in der URI; ein Stream, der von einer URI ohne
diese Endung ausgeliefert wird, spielt als progressives Medium ab und schlägt
fehl. Eine Änderung von `src` lädt die neue Quelle; dieselbe Quelle erneut (ein
erneutes Rendern, ein Live Patch) spielt weiter.

## Props

| Prop               | Standard    | Hinweise                                                                                           |
| ------------------ | ----------- | -------------------------------------------------------------------------------------------------- |
| `src`              | keiner      | `{ uri }`                                                                                          |
| `paused`           | `false`     | false spielt nach dem Laden ab; die Prop gilt, wenn sie sich ändert                                |
| `muted`            | `false`     |                                                                                                    |
| `volume`           | `1`         | 0 bis 1                                                                                            |
| `rate`             | `1`         | über 0; die Tonhöhe bleibt erhalten                                                                |
| `loop`             | `false`     | beginnt am Ende von vorn, mit einem `onEnd` bei jedem Durchlauf                                    |
| `objectFit`        | `'contain'` | `object-fit` aus CSS: `'contain'` setzt Letterbox-Balken, `'cover'` beschneidet, `'fill'` verzerrt |
| `controls`         | `false`     | die Steuerelemente der Plattform: AVPlayerViewController, PlayerView von Media3                    |
| `progressInterval` | `250`       | Millisekunden zwischen `onProgress`-Events während des Abspielens                                  |

Ein Wert außerhalb des Bereichs (eine Lautstärke von 2, eine `ftp://`-Quelle)
schlägt als `unsupportedValue`-Fehler der Prop fehl, wie jede ungültige Prop.

`paused` und `play()`/`pause()` entscheiden beide, ob das Video abspielt. Die
Aufrufe der Ref wirken sofort, und die Prop gilt nur, wenn sich ihr Wert ändert,
sodass ein Video, das der Benutzer über die Steuerelemente pausiert hat,
pausiert bleibt, bis die App etwas anderes sagt. Was es gerade tut, erfährt man
über `onPlaybackStateChange`.

## Events

| Event                      | Payload                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `onLoad`                   | `{ duration, currentTime, naturalSize: { width, height } }`                          |
| `onProgress`               | `{ currentTime, playableDuration }`, während des Abspielens                          |
| `onBuffer`                 | `{ isBuffering }`, wenn es anfängt und aufhört, auf Daten zu warten                  |
| `onPlaybackStateChange`    | `{ isPlaying }`, was auch immer die Änderung ausgelöst hat (auch die Steuerelemente) |
| `onEnd`                    | keiner; beim Loopen bei jedem Durchlauf                                              |
| `onError`                  | `{ code, message }`                                                                  |
| `onFullscreenChange`       | `{ fullscreen }`, beim Betreten und Verlassen, auch über die Steuerelemente          |
| `onPictureInPictureChange` | `{ active }`                                                                         |

Zeiten sind Sekunden. `duration` ist `null` bei einem Live-Stream.
`playableDuration` ist, wie weit der Player gepuffert hat.

**Der Fortschritt bleibt vom heißen Pfad fern.** Ein `Video` ohne `onProgress`
meldet überhaupt keinen Fortschritt: die Komponente sendet der nativen View ein
Intervall von 0. Mit ihm meldet die native View höchstens alle
`progressInterval` Millisekunden, und nur während des Abspielens.

## Die Ref

`videoRef()` erzeugt eine Ref, die auch den Zustand des Players hält; sie wird
als `ref` des Videos übergeben. Wie `ref()` wird sie aufgerufen, während eine
Komponente sich aufbaut, der sie dann gehört.

| Member                           | Ist                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `current`                        | Das Element der View, mit den Methoden unten; `null`, solange sie nicht gemountet ist.              |
| `playing`, `loaded`, `buffering` | Signale des Player-Zustands.                                                                        |
| `fullscreen`, `pictureInPicture` | Signale.                                                                                            |
| `error`                          | Ein Signal: warum das Video fehlgeschlagen ist, oder `null`.                                        |
| `time`                           | Ein Motion-Wert: Sekunden seit dem Anfang, vom UI-Thread zwischen den Berichten des Players bewegt. |
| `duration`                       | Ein Motion-Wert: Sekunden, 0 bis zum Laden und bei einem Live-Stream.                               |
| `watch('ended', fn)`             | Ruft `fn` jedes Mal auf, wenn das Abspielen das Ende erreicht.                                      |

Der Player meldet, wenn er startet oder stoppt, mit seiner Position und seiner
Geschwindigkeit, und jeder Bericht, `onProgress` eingeschlossen, verankert `time`
als lineares Timing, das der UI-Thread ausführt. Eine an `time` gebundene
Fortschrittsleiste braucht kein `onProgress`; mit `progressInterval={0}` hört der
JS-Thread während des Abspielens nichts.
Eine einfache `ref<VideoHandle>()` funktioniert weiterhin für die Methoden allein.

## Ref-Methoden

`current` hält das Element der View mit diesen Funktionen. Jede gibt ein Promise
zurück, das aufgelöst wird, sobald der Player es erledigt hat, und abgelehnt wird,
sobald die View nicht mehr gemountet ist ([View-Methoden](native-modules.md#how-views-work)).

| Methode                   | Tut                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `seek(seconds)`           | exakt, nicht zum nächsten Keyframe                                                             |
| `play()`, `pause()`       | nach dem Ende beginnt `play` von vorn                                                          |
| `enterFullscreen()`       | präsentiert das Video über der App mit den Steuerelementen der Plattform                       |
| `exitFullscreen()`        | zurück inline; der Benutzer kann auch über den Schließen-Button, Wischen oder Zurück verlassen |
| `startPictureInPicture()` | **nur iOS**; wird auf Android mit `ERR_UNSUPPORTED` abgelehnt                                  |
| `stopPictureInPicture()`  | **nur iOS**                                                                                    |

Der Vollbildmodus ist eine zweite Player-View auf demselben Player, sodass das
Abspielen ohne Unterbrechung weiterläuft: ein über der App präsentierter
AVPlayerViewController auf iOS, ein Dialog mit einer PlayerView auf Android. Der
eigene Vollbild-Button der Steuerelemente tut dasselbe, und beide melden
`onFullscreenChange`.

## Audio, der Hintergrund und Bild-im-Bild

Video spielt unter dem Audio-Modus der App, den
[`audio.configure`](audio.md#the-audio-mode) setzt; es setzt nie einen eigenen.
Das Video-Modul benötigt dafür nativ Audio, sodass eine App, die ein `Video`
rendert, auch den nativen Code von Audio ausliefert (ein paar Kilobytes, keine
Abhängigkeit), ob sie `Audio` importiert oder nicht.

- **iOS.** Bevor ein Video abspielt, wird die Audio-Session der App mit dem Modus
  aktiviert: der Standard von Audio spielt im Stumm-Modus ab und stoppt das Audio
  anderer Apps, wie es eine Video-App sollte. `playsInSilentMode: false` lässt den
  Stummschalter Videos stummschalten; `mixWithOthers` lässt andere Apps
  weiterspielen.
- **Android.** Videos und die Player von Audio teilen sich eine
  Audiofokus-Anfrage, sodass mehrere gleichzeitig abspielen, auch ein Video neben
  einem Audio-Player; ein Anruf oder eine andere Medien-App, die sie pausiert, ist
  eine Unterbrechung, und das `interruption`-Event von Audio meldet sie.
  `mixWithOthers` fordert keinen Fokus an.
- **Der Hintergrund.** Wie die Player von Audio pausieren Videos, wenn die App in
  den Hintergrund geht, es sei denn, der Modus hat `staysActiveInBackground`. Auf
  iOS braucht das den Audio-Hintergrundmodus in `kuito.config.ts`
  (`ios.backgroundModes: ['audio']`, [native Einstellungen](apps.md#native-settings));
  die Layer des Videos lassen den Player im Hintergrund los, damit das System ihn
  nicht pausiert. Auf Android startet ein abspielendes Video denselben
  Medienwiedergabe-Service und dieselbe Benachrichtigung wie die Player von Audio
  ([der Audio-Modus](audio.md#the-audio-mode)), was die App am Leben hält; die
  Pause und das Abspielen der Benachrichtigung erreichen auch die Videos. Ein
  Video, das in diesem Modus im Hintergrund gestartet wird, bleibt pausiert und
  meldet `ERR_AUDIO_MODE` über `onError`.
- **Bild-im-Bild** (iOS) braucht denselben Audio-Hintergrundmodus, sonst wird
  `startPictureInPicture` mit `ERR_PICTURE_IN_PICTURE` abgelehnt und benennt dies,
  und ein Gerät, das es unterstützt (der iPhone-Simulator tut es nicht und lehnt
  mit `ERR_UNSUPPORTED` ab). Ein Video in Bild-im-Bild spielt weiter, wenn die App
  in den Hintergrund geht, unabhängig vom Modus. Auf Android verkleinert
  Bild-im-Bild die ganze Activity, nicht eine View, daher wird es weggelassen.

## Player werden mit ihrer View freigegeben

Jedes `Video` besitzt seinen Player. Er wird freigegeben, wenn die View
verschwindet (ein Unmount, ein weggeschobener Bildschirm) und wenn die Runtime neu
lädt, über das `unmount` der nativen View ([native Views](native-modules.md#write-a-view)):
das Abspielen stoppt, und die Puffer des Streams werden freigegeben. Ein Live
Patch, der die View behält, behält den Player.

## Plattformhinweise

- **iOS:** AVPlayer, gezeichnet von einem AVPlayerLayer; `controls` bettet
  stattdessen einen AVPlayerViewController ein, der mit dem nächstgelegenen View
  Controller verbunden wird.
- **Android:** Media3 1.9 (`media3-exoplayer`, `media3-exoplayer-hls`,
  `media3-ui`), das neueste, das gegen das compileSdk 35 der Shell baut. Das Bild
  wird in eine TextureView gezeichnet: eine SurfaceView ignoriert das Clipping,
  sodass ein `cover`-Video über seine View hinauslaufen würde. Media3 ist der
  Preis des Moduls: etwa 1 MB pro APK, derselbe für jede ABI, da es keine nativen
  Bibliotheken hat ([Größe](#size)).

### Größe

Was das Rendern eines `Video` einer R8-Release-APK der Shell hinzufügt, gemessen
an einer App mit einem Bildschirm:

| APK       | Ohne Video (nur Audio) | Mit Video | Kosten |
| --------- | ---------------------- | --------- | ------ |
| arm64-v8a | TBD                    | TBD       | TBD    |
| x86_64    | TBD                    | TBD       | TBD    |

iOS linkt AVFoundation und AVKit, die mit dem System ausgeliefert werden.

## Fehler

| Code                     | Bedeutung                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_NOT_FOUND`          | Nichts an einer `file://`-Quelle.                                                                                                        |
| `ERR_PLAYBACK`           | Die Quelle konnte nicht geladen oder abgespielt werden: ein Netzwerkfehler, ein nicht unterstützter Codec.                               |
| `ERR_AUDIO_MODE`         | iOS: die Audio-Session konnte nicht mit dem Modus der App aktiviert werden. Android: im Hintergrundmodus aus dem Hintergrund abgespielt. |
| `ERR_FULLSCREEN`         | iOS: kein Fenster, in dem der Vollbild-Player präsentiert werden könnte.                                                                 |
| `ERR_PICTURE_IN_PICTURE` | iOS: kein Audio-Hintergrundmodus, oder das System hat den Start verweigert.                                                              |
| `ERR_UNSUPPORTED`        | Bild-im-Bild auf Android oder auf einem Gerät ohne diese Funktion.                                                                       |

Das Modul ist `Video` (`native/modules/video`); eine App, die nie ein `Video`
rendert, liefert nichts davon aus, und nichts von Media3.
