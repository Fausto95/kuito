# audio

Jouer des sons et enregistrer le microphone : AVPlayer et AVAudioRecorder sur iOS,
MediaPlayer et MediaRecorder sur Android. Plusieurs lecteurs peuvent jouer en même
temps ; la session audio de l'application (interrupteur silencieux, mixage,
atténuation, arrière-plan) tient en un appel ; les interruptions telles qu'un appel
téléphonique mettent tout en pause et préviennent l'application.

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

## Lecteurs

`audio.player(src, options)` renvoie un lecteur immédiatement. Il appartient au
composant qui l'appelle pendant sa mise en place (un [effet de portée](native-modules.md#scope-effects)) :
le lecteur natif est créé au montage du composant et libéré à son démontage, et un
nouveau rendu ou un Live Patch conserve le même. Hors d'un composant, passez
`{ scope: app }` pour un lecteur que l'application garde toute sa vie ; un appel
sans l'un ni l'autre lève une erreur qui le dit.

La source se charge en arrière-plan et `loaded` passe à true quand elle est prête.
Lire avant cela démarre dès qu'elle l'est ; sur Android, `seek` avant cela rejette
avec `ERR_NOT_LOADED`.

| Source                                              | Notes                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `'https://…'`, `{ uri }`                            | diffusée en flux ; Android bloque le `http://` en clair par défaut           |
| `'file://…'`, p. ex. un téléchargement `fileSystem` | échoue avec `ERR_NOT_FOUND` s'il n'y a rien                                  |
| `'asset:///name'`, `fileSystem.bundle`              | un fichier du bundle de l'application (iOS) ou des assets de l'APK (Android) |

| Option   | Défaut  | Notes                                        |
| -------- | ------- | -------------------------------------------- |
| `volume` | `1`     | de 0 à 1                                     |
| `rate`   | `1`     | de 0,5 à 2 ; la hauteur est conservée        |
| `loop`   | `false` | recommence à la fin                          |
| `scope`  | —       | `app` pour le lecteur propre à l'application |

| Membre                   | Est                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `playing`                | Un signal bidirectionnel : affecter `true` lit, `false` met en pause. Après la fin, la lecture recommence. |
| `volume`, `rate`, `loop` | Des signaux bidirectionnels : une affectation s'affiche immédiatement et est demandée à la plateforme.     |
| `loaded`, `buffering`    | Des signaux de l'état de la plateforme.                                                                    |
| `error`                  | Un signal : pourquoi la source n'a pas pu se charger ou être lue, ou `null`.                               |
| `time`                   | Une valeur de mouvement : secondes depuis le début, animée par le thread UI pendant la lecture.            |
| `duration`               | Une valeur de mouvement : secondes, 0 jusqu'au chargement et pour un flux en direct.                       |
| `play()`, `pause()`      | Équivalents à affecter `playing`, sous forme de promesse.                                                  |
| `seek(seconds)`          | Exact, pas à l'image clé la plus proche.                                                                   |
| `watch('ended', fn)`     | Appelle `fn` chaque fois que la lecture atteint la fin ; pour un lecteur en boucle, à chaque tour.         |

Une écriture que la plateforme rejette remet le signal à sa valeur précédente et
passe par le canal d'erreur ; une valeur hors plage (un volume supérieur à 1) est
rejetée de la même façon. Les erreurs d'argument dans `audio.player` lui-même (une
source qui n'est pas un URI) sont des `TypeError` avant que quoi que ce soit ne
traverse.

### Le temps sans événements

La plateforme ne signale un lecteur que lorsque son état change : il démarre ou
s'arrête, met en mémoire tampon, se déplace, se termine ou change de vitesse. Il
n'y a pas de rapport de progression périodique. Chaque rapport ancre `time` :
pendant que le lecteur joue, le noyau donne au thread UI un timing linéaire du
temps signalé jusqu'à la fin, à la vitesse du lecteur, et le thread UI fait
avancer `time` le long de celui-ci à chaque image ; en pause, en chargement ou en
mise en mémoire tampon, `time` reste là où la plateforme l'a indiqué. Ainsi, une
barre de progression liée à `time` ne coûte rien au thread JS pendant que le
morceau joue, et une lecture de `time.value` sur le thread JS renvoie la position
où le thread UI l'a amenée.

## Enregistreurs

`audio.recorder(options)` renvoie un enregistreur possédé de la même façon ; rien
ne touche au microphone avant `start`.

| Option     | Défaut   | Notes                                                                    |
| ---------- | -------- | ------------------------------------------------------------------------ |
| `format`   | `'aac'`  | `'aac'` écrit du `.m4a` ; `'wav'` est du PCM 16 bits, **iOS uniquement** |
| `quality`  | `'high'` | voir ci-dessous                                                          |
| `metering` | `false`  | mesure le niveau d'entrée dans `level`                                   |
| `scope`    | —        | `app` pour l'enregistreur propre à l'application                         |

| Qualité  | Fréquence d'échantillonnage | Canaux | Débit AAC  |
| -------- | --------------------------- | ------ | ---------- |
| `low`    | 22 050 Hz                   | 1      | 64 kbit/s  |
| `medium` | 44 100 Hz                   | 1      | 96 kbit/s  |
| `high`   | 44 100 Hz                   | 2      | 128 kbit/s |

| Membre      | Est                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `start()`   | Demande le microphone, puis commence un nouveau fichier dans le répertoire de cache, ou reprend un fichier en pause.         |
| `pause()`   | Met le fichier en pause ; `start` le reprend.                                                                                |
| `stop()`    | Termine le fichier et résout `{ uri, duration }` ; le `start` suivant commence un nouveau fichier.                           |
| `recording` | Un signal.                                                                                                                   |
| `time`      | Une valeur de mouvement : secondes enregistrées, animée par le thread UI pendant l'enregistrement.                           |
| `level`     | Une valeur de mouvement : le niveau d'entrée en dBFS, de −160 (silence) à 0, lissé entre les échantillons pendant la mesure. |
| `error`     | Un signal : pourquoi l'enregistreur n'a pas pu être créé.                                                                    |

Pendant la mesure, la plateforme échantillonne le niveau toutes les 100 ms et le
thread UI amène `level` en douceur vers chaque échantillon sur la même durée ; sans
mesure, un enregistreur ne signale que son démarrage et son arrêt. Le démontage de
son composant l'arrête, supprime un fichier non terminé et le libère.

La permission du microphone passe par [permissions](permissions.md) :
déclarez `permissions.microphone` dans `kuito.config.ts`, sinon `start` rejette
avec `ERR_PERMISSION` et le dit. `start` affiche la demande quand l'utilisateur n'a
pas encore répondu, et rejette avec `ERR_PERMISSION` quand il refuse. Sur iOS, il
faut aussi `audio.configure({ allowsRecording: true })` au préalable, sinon il
rejette avec `ERR_AUDIO_MODE`.

Android n'a pas d'encodeur WAV dans MediaRecorder : un enregistreur `'wav'` y
échoue avec `ERR_UNSUPPORTED`, et son `error` le dit.

## Le mode audio

`audio.configure(changes)` fusionne `changes` dans le mode défini jusque-là ; les
clés qu'il omet gardent leur valeur. Les lecteurs et enregistreurs utilisent les
valeurs par défaut tant que l'application ne les configure pas.

| Clé                       | Défaut  | iOS (AVAudioSession)                                               | Android                                                |
| ------------------------- | ------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `playsInSilentMode`       | `true`  | `.playback` ; sinon `.soloAmbient`, ou `.ambient` en cas de mixage | pas d'interrupteur silencieux : ignoré                 |
| `mixWithOthers`           | `false` | `.mixWithOthers`                                                   | ne demande pas le focus audio                          |
| `duckOthers`              | `false` | `.duckOthers` (et `.playback`)                                     | `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`                   |
| `allowsRecording`         | `false` | `.playAndRecord`, vers le haut-parleur et le Bluetooth             | ignoré : l'enregistrement ne demande que la permission |
| `staysActiveInBackground` | `false` | `.playback` ; nécessite `ios.backgroundModes: ['audio']`           | un service de premier plan de lecture multimédia       |

Le mode est celui de l'application, pas seulement celui des lecteurs d'`audio` : les [vidéos](video.md#audio-the-background-and-picture-in-picture)
jouent aussi sous ce mode.

Sans `staysActiveInBackground`, les lecteurs et enregistreurs se mettent en pause
quand l'application passe en arrière-plan, sur les deux plateformes. Avec, iOS a
besoin du mode d'arrière-plan audio dans `kuito.config.ts`
([réglages natifs](apps.md#native-settings)) ; `configure` rejette avec
`ERR_AUDIO_MODE` et le dit quand il manque.

Sur Android, un lecteur qui joue dans ce mode, ou une
[vidéo](video.md#audio-the-background-and-picture-in-picture), démarre un service
de premier plan de lecture multimédia, qui maintient le processus en vie et
affiche une notification multimédia avec le nom de l'application et une commande
lecture/pause (sur Android 13 et ultérieur, dans les commandes multimédias des
réglages rapides). Le module déclare le service et les permissions
`FOREGROUND_SERVICE` et `FOREGROUND_SERVICE_MEDIA_PLAYBACK` dans sa spécification
(`native/modules/audio/audio.ts`), si bien qu'une application qui importe `audio`
n'a besoin d'aucun réglage propre. Les notifications multimédias n'ont pas besoin
de la permission de notification. La notification suit les lecteurs :

| Ce qui se passe                                                         | Le service et la notification                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| un lecteur ou une vidéo joue                                            | au premier plan ; la commande les met tous en pause                                   |
| la pause de la notification                                             | hors du premier plan ; la notification reste, peut être balayée, et reprend           |
| un appel ou une autre interruption transitoire                          | reste au premier plan, pour que l'application puisse reprendre à l'arrivée de `ended` |
| l'application se met en pause, le dernier lecteur termine ou est libéré | arrêté, et la notification disparue                                                   |
| `configure` désactive `staysActiveInBackground`                         | arrêté                                                                                |

Android 12 et ultérieur ne démarrent un service de premier plan que pendant que
l'application est au premier plan, ou depuis sa notification : `play` dans ce mode
depuis l'arrière-plan rejette avec `ERR_AUDIO_MODE` et le lecteur reste en pause.
Démarrez la lecture avant que l'application ne quitte l'écran. La notification ne
nomme aucun morceau : les lecteurs ne portent pas de métadonnées.

## Interruptions

Un appel téléphonique, une alarme ou une autre application qui prend le focus
audio met en pause chaque lecteur et enregistreur, et
`audio.watch('interruption', fn)` reçoit `{ type: 'began' }`, puis
`{ type: 'ended', shouldResume }` quand c'est terminé. Reprendre est la décision
de l'application : `shouldResume` est la suggestion du système. Dans un composant,
l'écoute prend fin à son démontage ; ailleurs, le `remove()` de l'abonnement
renvoyé y met fin.

- iOS : `AVAudioSession.interruptionNotification` ; `shouldResume` est son option
  `.shouldResume`.
- Android : la perte du focus audio. Une perte transitoire (un appel) se termine
  par le retour du focus et `shouldResume: true` ; une perte permanente (une autre
  application multimédia) ne se termine jamais. Une demande d'atténuation est gérée
  par le système, qui baisse lui-même le volume de cette application.

## Les lecteurs et enregistreurs sont des objets natifs

Chaque lecteur et enregistreur est un objet natif que le module conserve sous un
identifiant. Sa portée le libère : le composant qui l'a créé à son démontage, ou,
pour `{ scope: app }`, un rechargement, qui libère chacun d'eux avec le runtime.
Il n'y a pas de `release()` à oublier. La plateforme distribue les identifiants,
si bien qu'un Live Patch qui réévalue ce module n'en réutilise jamais un qu'un
objet vivant détient encore.

## Pourquoi MediaPlayer, et non Media3

Android lit via MediaPlayer et enregistre via MediaRecorder, tous deux dans la
plateforme, et sa notification d'arrière-plan utilise la MediaSession de la
plateforme : le module n'ajoute aucune dépendance. Media3 (ExoPlayer) ajoute
environ 1,5 Mo et apporte les listes de lecture sans interruption, les flux
adaptatifs (HLS, DASH) et une session multimédia, dont aucun n'est exposé par
cette API. [Video](video.md) en a besoin et utilise Media3. `audio` peut y passer
sans changer son API JavaScript, et une application qui affiche des vidéos
paierait alors Media3 une seule fois ; une qui n'importe qu'`audio` ne paie rien.
iOS utilise AVFoundation, livré avec le système.

## Erreurs

| Code                | Signification                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_NOT_FOUND`     | Rien à une source `file://` ou `asset:///`, ou le lecteur a été libéré.                                                                         |
| `ERR_PERMISSION`    | La permission du microphone est refusée, ou non déclarée dans `kuito.config.ts`.                                                                |
| `ERR_AUDIO_MODE`    | iOS : enregistrement sans `allowsRecording`, ou arrière-plan sans le mode. Android : lecture dans le mode d'arrière-plan depuis l'arrière-plan. |
| `ERR_RECORDING`     | L'enregistreur n'a pas pu démarrer, ou s'est arrêté avant d'écrire le moindre audio.                                                            |
| `ERR_NOT_RECORDING` | `stop` sans rien d'enregistré depuis le dernier `stop`.                                                                                         |
| `ERR_NOT_LOADED`    | Android : `seek` avant le chargement de la source.                                                                                              |
| `ERR_UNSUPPORTED`   | Android : un enregistreur `'wav'`.                                                                                                              |

Le module natif est `Audio` (`native/modules/audio`) ; une application qui
n'importe jamais `audio` n'en embarque rien.
