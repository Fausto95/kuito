# Vidéo

Une vue de lecteur vidéo, dans la lignée de react-native-video et expo-video :
AVPlayer sur iOS, Media3 ExoPlayer sur Android. Elle lit les flux HLS, le MP4
progressif et les fichiers locaux, avec ou sans les commandes de la plateforme,
passe en plein écran, et sur iOS en image dans l'image. Plusieurs peuvent jouer en
même temps.

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

Une `Video` est une [vue native](native-modules.md#views) : elle prend des props
de style et de mise en page, et comme la vue de n'importe quel module, elle n'a
pas de taille propre. Donnez-lui une `height` (et une `width`, ou laissez-la
s'étirer).

## Sources

| `src.uri`                                         | Notes                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `https://…/*.m3u8`                                | HLS, adaptatif ; un flux en direct rapporte `duration: null`     |
| `https://…/*.mp4`                                 | téléchargement progressif ; Android bloque le `http://` en clair |
| `file://…`, p. ex. un téléchargement `fileSystem` | échoue immédiatement avec `ERR_NOT_FOUND` s'il n'y a rien        |
| un URI vidéo d'[ImagePicker](image-picker.md)     | l'URI `file://` que le sélecteur renvoie se lit tel quel         |

Android reconnaît HLS au `.m3u8` dans l'URI ; un flux servi depuis un URI sans
celui-ci est lu comme média progressif et échoue. Changer `src` charge le nouveau ;
la même source à nouveau (un nouveau rendu, un Live Patch) continue la lecture.

## Props

| Prop               | Défaut      | Notes                                                                                    |
| ------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| `src`              | aucune      | `{ uri }`                                                                                |
| `paused`           | `false`     | false lit une fois chargé ; la prop s'applique quand elle change                         |
| `muted`            | `false`     |                                                                                          |
| `volume`           | `1`         | de 0 à 1                                                                                 |
| `rate`             | `1`         | supérieur à 0 ; la hauteur est conservée                                                 |
| `loop`             | `false`     | recommence à la fin, avec un `onEnd` à chaque tour                                       |
| `objectFit`        | `'contain'` | l'`object-fit` de CSS : `'contain'` ajoute des bandes, `'cover'` rogne, `'fill'` déforme |
| `controls`         | `false`     | les commandes de la plateforme : AVPlayerViewController, le PlayerView de Media3         |
| `progressInterval` | `250`       | millisecondes entre les événements `onProgress` pendant la lecture                       |

Une valeur hors plage (un volume de 2, une source `ftp://`) échoue comme l'erreur
`unsupportedValue` de la prop, comme toute prop invalide.

`paused` et `play()`/`pause()` décident tous deux si la vidéo joue. Les appels de
la ref agissent immédiatement et la prop ne s'applique que quand sa valeur change,
si bien qu'une vidéo que l'utilisateur a mise en pause depuis les commandes reste
en pause jusqu'à ce que l'application en décide autrement. Suivez ce qu'elle fait
avec `onPlaybackStateChange`.

## Événements

| Événement                  | Charge utile                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| `onLoad`                   | `{ duration, currentTime, naturalSize: { width, height } }`                   |
| `onProgress`               | `{ currentTime, playableDuration }`, pendant la lecture                       |
| `onBuffer`                 | `{ isBuffering }`, quand elle commence et cesse d'attendre des données        |
| `onPlaybackStateChange`    | `{ isPlaying }`, quelle que soit la cause du changement (les commandes aussi) |
| `onEnd`                    | aucune ; à chaque tour en boucle                                              |
| `onError`                  | `{ code, message }`                                                           |
| `onFullscreenChange`       | `{ fullscreen }`, à l'entrée et à la sortie, depuis les commandes aussi       |
| `onPictureInPictureChange` | `{ active }`                                                                  |

Les temps sont en secondes. `duration` est `null` pour un flux en direct.
`playableDuration` est jusqu'où le lecteur a mis en mémoire tampon.

**La progression reste hors du chemin critique.** Une `Video` sans `onProgress`
ne rapporte aucune progression : le composant envoie à la vue native un intervalle
de 0. Avec, la vue native rapporte au plus toutes les `progressInterval`
millisecondes, et seulement pendant la lecture.

## La ref

`videoRef()` crée une ref qui porte aussi l'état du lecteur ; passez-la comme
`ref` de la vidéo. Comme `ref()`, appelez-la pendant qu'un composant se met en
place, qui en devient propriétaire.

| Membre                           | Est                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `current`                        | L'élément de la vue, avec les méthodes ci-dessous ; `null` tant qu'elle n'est pas montée.                  |
| `playing`, `loaded`, `buffering` | Des signaux de l'état du lecteur.                                                                          |
| `fullscreen`, `pictureInPicture` | Des signaux.                                                                                               |
| `error`                          | Un signal : pourquoi la vidéo a échoué, ou `null`.                                                         |
| `time`                           | Une valeur de mouvement : secondes depuis le début, animée par le thread UI entre les rapports du lecteur. |
| `duration`                       | Une valeur de mouvement : secondes, 0 jusqu'au chargement et pour un flux en direct.                       |
| `watch('ended', fn)`             | Appelle `fn` chaque fois que la lecture atteint la fin.                                                    |

Le lecteur rapporte quand il démarre ou s'arrête, avec sa position et sa vitesse,
et chaque rapport, `onProgress` compris, ancre `time` comme un timing linéaire que
le thread UI exécute. Une barre de progression liée à `time` n'a pas besoin
d'`onProgress` ; mettez `progressInterval={0}` et le thread JS n'entend rien
pendant la lecture. Une simple `ref<VideoHandle>()` fonctionne toujours pour les
méthodes seules.

## Méthodes de la ref

`current` porte l'élément de la vue avec ces fonctions. Chacune renvoie une
Promise qui se résout une fois que le lecteur l'a fait, et rejette une fois que la
vue n'est plus montée ([méthodes de vue](native-modules.md#how-views-work)).

| Méthode                   | Fait                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `seek(seconds)`           | exact, pas à l'image clé la plus proche                                                               |
| `play()`, `pause()`       | après la fin, `play` recommence                                                                       |
| `enterFullscreen()`       | présente la vidéo par-dessus l'application avec les commandes de la plateforme                        |
| `exitFullscreen()`        | retour en ligne ; l'utilisateur peut aussi quitter avec le bouton de fermeture, un balayage ou retour |
| `startPictureInPicture()` | **iOS uniquement** ; rejette avec `ERR_UNSUPPORTED` sur Android                                       |
| `stopPictureInPicture()`  | **iOS uniquement**                                                                                    |

Le plein écran est une seconde vue de lecteur sur le même lecteur, si bien que la
lecture continue sans accroc : un AVPlayerViewController présenté par-dessus
l'application sur iOS, une boîte de dialogue avec un PlayerView sur Android. Le
bouton plein écran des commandes fait de même, et les deux rapportent
`onFullscreenChange`.

## Audio, l'arrière-plan et l'image dans l'image

La vidéo joue sous le mode audio de l'application, celui que
[`audio.configure`](audio.md#the-audio-mode) définit ; elle n'en définit jamais un
à elle. Le module Video requiert Audio nativement pour cela, si bien qu'une
application qui rend une `Video` embarque aussi le code natif d'Audio (quelques
kilooctets, aucune dépendance), qu'elle importe `Audio` ou non.

- **iOS.** Avant qu'une vidéo joue, la session audio de l'application est activée
  avec le mode : le défaut d'Audio joue en mode silencieux et arrête l'audio des
  autres applications, comme une application vidéo le doit. `playsInSilentMode: false`
  laisse l'interrupteur silencieux couper le son des vidéos ; `mixWithOthers`
  laisse jouer les autres applications.
- **Android.** Les vidéos et les lecteurs d'Audio partagent une seule demande de
  focus audio, si bien que plusieurs jouent en même temps, une vidéo à côté d'un
  lecteur Audio aussi ; un appel ou une autre application multimédia qui les met
  en pause est une interruption, et l'événement `interruption` d'Audio la
  rapporte. `mixWithOthers` ne demande aucun focus.
- **L'arrière-plan.** Comme les lecteurs d'Audio, les vidéos se mettent en pause
  quand l'application passe en arrière-plan, sauf si le mode a
  `staysActiveInBackground`. Sur iOS, cela demande le mode d'arrière-plan audio
  dans `kuito.config.ts`
  (`ios.backgroundModes: ['audio']`, [réglages natifs](apps.md#native-settings)) ;
  les couches de la vidéo lâchent le lecteur en arrière-plan pour que le système
  ne le mette pas en pause. Sur Android, une vidéo en lecture démarre le même
  service de lecture multimédia et la même notification que les lecteurs d'Audio
  ([le mode audio](audio.md#the-audio-mode)), ce qui maintient l'application en
  vie ; la pause et la lecture de la notification atteignent aussi les vidéos. Une
  vidéo démarrée en arrière-plan dans ce mode reste en pause et rapporte
  `ERR_AUDIO_MODE` via `onError`.
- **L'image dans l'image** (iOS) demande le même mode d'arrière-plan audio, sinon
  `startPictureInPicture` rejette avec `ERR_PICTURE_IN_PICTURE` et le dit, et un
  appareil qui la prend en charge (le simulateur iPhone ne le fait pas, et rejette
  avec `ERR_UNSUPPORTED`). Une vidéo en image dans l'image continue de jouer quand
  l'application passe en arrière-plan, quel que soit le mode. Sur Android, l'image
  dans l'image réduit toute l'activité, pas une seule vue, elle est donc laissée
  de côté.

## Les lecteurs sont libérés avec leur vue

Chaque `Video` possède son lecteur. Il est libéré quand la vue s'en va (un
démontage, un écran dépilé) et quand le runtime se recharge, via l'`unmount` de
la vue native ([vues natives](native-modules.md#write-a-view)) :
la lecture s'arrête et les tampons du flux disparaissent. Un Live Patch qui garde
la vue garde le lecteur.

## Notes par plateforme

- **iOS :** AVPlayer dessiné par un AVPlayerLayer ; `controls` intègre à la place
  un AVPlayerViewController, rattaché au view controller le plus proche.
- **Android :** Media3 1.9 (`media3-exoplayer`, `media3-exoplayer-hls`,
  `media3-ui`), la plus récente qui compile contre le compileSdk 35 du shell.
  L'image se dessine dans une TextureView : une SurfaceView ignore le rognage, si
  bien qu'une vidéo en `cover` déborderait de sa vue. Media3 est le coût du
  module : environ 1 Mo par APK, le même pour chaque ABI, puisqu'elle n'a pas de
  bibliothèques natives ([taille](#size)).

### Taille

Ce que le rendu d'une `Video` ajoute à un APK de release R8 du shell, mesuré sur
une application à un seul écran :

| APK       | Sans Video (Audio seul) | Avec Video   | Coût         |
| --------- | ----------------------- | ------------ | ------------ |
| arm64-v8a | À déterminer            | À déterminer | À déterminer |
| x86_64    | À déterminer            | À déterminer | À déterminer |

iOS lie AVFoundation et AVKit, livrés avec le système.

## Erreurs

| Code                     | Signification                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_NOT_FOUND`          | Rien à une source `file://`.                                                                                                                       |
| `ERR_PLAYBACK`           | La source n'a pas pu se charger ou être lue : une erreur réseau, un codec non pris en charge.                                                      |
| `ERR_AUDIO_MODE`         | iOS : la session audio n'a pas pu être activée avec le mode de l'application. Android : lecture dans le mode d'arrière-plan depuis l'arrière-plan. |
| `ERR_FULLSCREEN`         | iOS : aucune fenêtre où présenter le lecteur plein écran.                                                                                          |
| `ERR_PICTURE_IN_PICTURE` | iOS : pas de mode d'arrière-plan audio, ou le système a refusé de la démarrer.                                                                     |
| `ERR_UNSUPPORTED`        | L'image dans l'image sur Android, ou sur un appareil qui ne la prend pas en charge.                                                                |

Le module est `Video` (`native/modules/video`) ; une application qui ne rend
jamais de `Video` n'en embarque rien, ni rien de Media3.
