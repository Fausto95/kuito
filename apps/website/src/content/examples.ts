import type { Locale } from '../i18n/messages';

export type ExampleKind = 'starter' | 'lab';

export type Example = {
  id: string;
  kind: ExampleKind;
  name: string;
  /** Path in the repository, relative to its root. */
  path: string;
  /** How to run it from `demo/`, when it is one of the demo entries. */
  run?: string;
  tags: string[];
  description: Record<Locale, string>;
};

const REPO = 'https://github.com/Fausto95/kuito/tree/main/';

export const exampleUrl = (example: Example) => REPO + example.path;

/** Every runnable app and demo in the repository (`demo/README.md`, `templates/app`). */
export const examples: Example[] = [
  {
    id: 'starter',
    kind: 'starter',
    name: 'App template',
    path: 'templates/app',
    tags: ['Tabs', 'routes', 'List', 'Sheet', 'motion'],
    description: {
      en: 'What `kuito create` writes: Home and Explore tabs, a list of topics with a live demo each, an about sheet, assets and configuration.',
      fr: 'Ce que `kuito create` écrit : onglets Accueil et Explorer, une liste de sujets avec une démo chacun, une feuille À propos, assets et configuration.',
      pt: 'O que `kuito create` escreve: separadores Home e Explore, uma lista de temas com uma demo cada, uma folha Sobre, recursos e configuração.',
      de: 'Was `kuito create` anlegt: Home- und Explore-Tabs, eine Themenliste mit je einer Live-Demo, ein About-Sheet, Assets und Konfiguration.',
    },
  },
  {
    id: 'navigation',
    kind: 'lab',
    name: 'Navigation',
    path: 'demo/navigation.tsx',
    run: 'kuito dev ios --entry navigation.tsx',
    tags: ['Router', 'Tabs', 'Sheet'],
    description: {
      en: 'Stacks, tabs and sheets declared in code; `demo/routes` is the same app as file-based routes.',
      fr: 'Piles, onglets et feuilles déclarés en code ; `demo/routes` est la même app en routes par fichiers.',
      pt: 'Pilhas, separadores e folhas declarados em código; `demo/routes` é a mesma app em rotas por ficheiros.',
      de: 'Stacks, Tabs und Sheets im Code deklariert; `demo/routes` ist dieselbe App als dateibasierte Routen.',
    },
  },
  {
    id: 'motion',
    kind: 'lab',
    name: 'Motion',
    path: 'demo/motion.tsx',
    run: 'kuito dev ios --entry motion.tsx',
    tags: ['motion', 'spring', 'pan'],
    description: {
      en: 'Motion values, springs and gestures driving native properties on the UI thread.',
      fr: 'Valeurs de mouvement, ressorts et gestes pilotant des propriétés natives sur le thread UI.',
      pt: 'Valores de movimento, molas e gestos a conduzir propriedades nativas na thread da UI.',
      de: 'Motion-Werte, Federn und Gesten, die native Eigenschaften auf dem UI-Thread steuern.',
    },
  },
  {
    id: 'gestures',
    kind: 'lab',
    name: 'Gestures',
    path: 'demo/gestures.tsx',
    run: 'kuito dev ios --entry gestures.tsx',
    tags: ['pan', 'pinch', 'rotate', 'longPress'],
    description: {
      en: 'Every gesture recognizer composed and raced, with its events logged.',
      fr: 'Chaque reconnaisseur de geste composé et mis en course, ses événements journalisés.',
      pt: 'Todos os reconhecedores de gestos compostos e em corrida, com os seus eventos registados.',
      de: 'Jeder Gestenerkenner, komponiert und im Wettlauf, mit protokollierten Ereignissen.',
    },
  },
  {
    id: 'list-app',
    kind: 'lab',
    name: 'Lists',
    path: 'demo/list-app.tsx',
    run: 'kuito dev ios --entry list-app.tsx',
    tags: ['List', 'store'],
    description: {
      en: 'A native virtualized list bound to a store: keys, sections, scroll-to-index and pull to refresh.',
      fr: "Une liste native virtualisée liée à un store : clés, sections, défilement à l'index et tirer pour rafraîchir.",
      pt: 'Uma lista nativa virtualizada ligada a um store: chaves, secções, scroll para índice e puxar para atualizar.',
      de: 'Eine native virtualisierte Liste an einen Store gebunden: Keys, Abschnitte, Scroll-to-Index und Pull-to-Refresh.',
    },
  },
  {
    id: 'first-render',
    kind: 'lab',
    name: 'First render',
    path: 'demo/first-render.tsx',
    run: 'kuito dev ios --entry first-render.tsx',
    tags: ['List', 'benchmark'],
    description: {
      en: 'The host-boundary benchmark: a List of 1,000 rows on its first render, measured per commit.',
      fr: 'Le benchmark de la frontière hôte : une List de 1 000 lignes à son premier rendu, mesurée par commit.',
      pt: 'O benchmark da fronteira do host: uma List de 1.000 linhas no primeiro render, medida por commit.',
      de: 'Der Host-Boundary-Benchmark: eine List mit 1.000 Zeilen beim ersten Rendern, pro Commit gemessen.',
    },
  },
  {
    id: 'native-views',
    kind: 'lab',
    name: 'Native views',
    path: 'demo/native-views.tsx',
    run: 'kuito dev ios --entry native-views.tsx',
    tags: ['defineModule', 'Slider'],
    description: {
      en: 'A view a native module contributes, the Slider: props update it, its events arrive, flexbox sizes it.',
      fr: 'Une vue apportée par un module natif, le Slider : les props la mettent à jour, ses événements arrivent, flexbox la dimensionne.',
      pt: 'Uma vista contribuída por um módulo nativo, o Slider: as props atualizam-na, os eventos chegam, o flexbox dimensiona-a.',
      de: 'Eine View aus einem nativen Modul, der Slider: Props aktualisieren sie, ihre Ereignisse kommen an, Flexbox bemisst sie.',
    },
  },
  {
    id: 'storage',
    kind: 'lab',
    name: 'Storage',
    path: 'demo/storage.tsx',
    run: 'kuito dev ios --entry storage.tsx',
    tags: ['persisted', 'db', 'secureStore'],
    description: {
      en: 'Counts launches in a persisted signal, logs each in a database table whose query follows its writes, and keeps a token in secure storage.',
      fr: 'Compte les lancements dans un signal persistant, journalise chacun dans une table dont la requête suit ses écritures, et garde un jeton en stockage sécurisé.',
      pt: 'Conta os arranques num sinal persistido, regista cada um numa tabela cuja consulta segue as escritas, e guarda um token no armazenamento seguro.',
      de: 'Zählt Starts in einem persistierten Signal, protokolliert jeden in einer Tabelle, deren Abfrage den Schreibvorgängen folgt, und hält ein Token im sicheren Speicher.',
    },
  },
  {
    id: 'audio',
    kind: 'lab',
    name: 'Audio',
    path: 'demo/audio.tsx',
    run: 'kuito dev ios --entry audio.tsx',
    tags: ['audio', 'AudioPlayer', 'AudioRecorder'],
    description: {
      en: 'Plays two remote MP3s at once and a downloaded one, seeks and loops, records and plays the take back, and logs interruptions.',
      fr: 'Lit deux MP3 distants à la fois et un téléchargé, cherche et boucle, enregistre et relit la prise, et journalise les interruptions.',
      pt: 'Reproduz dois MP3 remotos ao mesmo tempo e um descarregado, procura e repete, grava e reproduz a gravação, e regista interrupções.',
      de: 'Spielt zwei entfernte MP3s zugleich und eine heruntergeladene, springt und wiederholt, nimmt auf und spielt die Aufnahme ab, protokolliert Unterbrechungen.',
    },
  },
  {
    id: 'video',
    kind: 'lab',
    name: 'Video',
    path: 'demo/video.tsx',
    run: 'kuito dev ios --entry video.tsx',
    tags: ['Video', 'videoRef'],
    description: {
      en: 'The native Video view: sources, playback control through the ref, fullscreen and picture in picture.',
      fr: "La vue Video native : sources, contrôle de lecture par la ref, plein écran et image dans l'image.",
      pt: 'A vista Video nativa: fontes, controlo de reprodução pela ref, ecrã inteiro e picture in picture.',
      de: 'Die native Video-View: Quellen, Wiedergabesteuerung über die Ref, Vollbild und Bild-im-Bild.',
    },
  },
  {
    id: 'camera',
    kind: 'lab',
    name: 'Camera',
    path: 'demo/camera.tsx',
    run: 'kuito dev ios --entry camera.tsx',
    tags: ['Camera', 'cameraRef'],
    description: {
      en: 'Previews the camera, flips, zooms, takes a picture into an Image, records a short video, pauses, and unmounts and remounts the view.',
      fr: 'Prévisualise la caméra, bascule, zoome, prend une photo dans une Image, enregistre une courte vidéo, met en pause, démonte et remonte la vue.',
      pt: 'Pré-visualiza a câmara, inverte, amplia, tira uma fotografia para uma Image, grava um vídeo curto, pausa, e desmonta e volta a montar a vista.',
      de: 'Zeigt die Kameravorschau, wechselt die Kamera, zoomt, nimmt ein Bild in eine Image auf, zeichnet ein kurzes Video auf, pausiert und mountet die View neu.',
    },
  },
  {
    id: 'image-picker',
    kind: 'lab',
    name: 'Media picker',
    path: 'demo/image-picker.tsx',
    run: 'kuito dev ios --entry image-picker.tsx',
    tags: ['mediaPicker'],
    description: {
      en: 'Picks photos and videos, takes photos with the system picker, and shows what came back.',
      fr: 'Choisit photos et vidéos, prend des photos avec le sélecteur système, et montre ce qui est revenu.',
      pt: 'Escolhe fotografias e vídeos, tira fotografias com o seletor do sistema, e mostra o que voltou.',
      de: 'Wählt Fotos und Videos, nimmt Fotos mit dem Systemdialog auf und zeigt, was zurückkam.',
    },
  },
  {
    id: 'location',
    kind: 'lab',
    name: 'Location',
    path: 'demo/location.tsx',
    run: 'kuito dev ios --entry location.tsx',
    tags: ['location', 'permissions'],
    description: {
      en: 'Asks for location, reads a fix, watches it move, names the place and follows the compass.',
      fr: 'Demande la localisation, lit un relevé, suit son mouvement, nomme le lieu et suit la boussole.',
      pt: 'Pede a localização, lê uma posição, observa o movimento, nomeia o lugar e segue a bússola.',
      de: 'Fragt den Standort ab, liest einen Fix, verfolgt die Bewegung, benennt den Ort und folgt dem Kompass.',
    },
  },
  {
    id: 'permissions',
    kind: 'lab',
    name: 'Permissions',
    path: 'demo/permissions.tsx',
    run: 'kuito dev ios --entry permissions.tsx',
    tags: ['permissions'],
    description: {
      en: 'Checks and requests every permission the framework declares, and opens the system settings.',
      fr: 'Vérifie et demande chaque permission déclarée par le framework, et ouvre les réglages système.',
      pt: 'Verifica e pede todas as permissões que o framework declara, e abre as definições do sistema.',
      de: 'Prüft und fordert jede vom Framework deklarierte Berechtigung an und öffnet die Systemeinstellungen.',
    },
  },
  {
    id: 'file-system',
    kind: 'lab',
    name: 'File system',
    path: 'demo/file-system.tsx',
    run: 'kuito dev ios --entry file-system.tsx',
    tags: ['fileSystem', 'FileTransfer'],
    description: {
      en: 'Reads, writes, lists and moves files in the app sandbox, and downloads and uploads with progress.',
      fr: "Lit, écrit, liste et déplace des fichiers dans le bac à sable de l'app, télécharge et envoie avec progression.",
      pt: 'Lê, escreve, lista e move ficheiros na sandbox da app, e descarrega e envia com progresso.',
      de: 'Liest, schreibt, listet und verschiebt Dateien in der App-Sandbox und lädt mit Fortschritt herunter und hoch.',
    },
  },
  {
    id: 'system-apis',
    kind: 'lab',
    name: 'System APIs',
    path: 'demo/system-apis.tsx',
    run: 'kuito dev ios --entry system-apis.tsx',
    tags: ['app', 'device', 'localization', 'appearance', 'keepAwake', 'brightness'],
    description: {
      en: 'Shows app state, device, localization, appearance, keepAwake and brightness, and logs their changes.',
      fr: "Montre l'état de l'app, l'appareil, la localisation, l'apparence, keepAwake et la luminosité, et journalise leurs changements.",
      pt: 'Mostra o estado da app, o dispositivo, a localização, a aparência, keepAwake e o brilho, e regista as mudanças.',
      de: 'Zeigt App-Zustand, Gerät, Lokalisierung, Erscheinungsbild, keepAwake und Helligkeit und protokolliert deren Änderungen.',
    },
  },
  {
    id: 'system-ui',
    kind: 'lab',
    name: 'System UI',
    path: 'demo/system-ui.tsx',
    run: 'kuito dev ios --entry system-ui.tsx',
    tags: ['StatusBar', 'SystemBars', 'SafeArea'],
    description: {
      en: 'Status bar and navigation bar styles, edge-to-edge layout and safe areas.',
      fr: "Styles de la barre d'état et de navigation, mise en page bord à bord et zones sûres.",
      pt: 'Estilos da barra de estado e de navegação, layout de extremo a extremo e áreas seguras.',
      de: 'Stile der Status- und Navigationsleiste, randloses Layout und Safe Areas.',
    },
  },
  {
    id: 'web-apis',
    kind: 'lab',
    name: 'Web APIs',
    path: 'demo/web-apis.tsx',
    run: 'kuito dev ios --entry web-apis.tsx',
    tags: ['fetch', 'WebSocket', 'URL', 'crypto', 'Intl'],
    description: {
      en: 'The standard library end to end on a device: fetch with headers, binary and streamed bodies and an abort, then every other global, and what Hermes Intl has.',
      fr: 'La bibliothèque standard de bout en bout sur un appareil : fetch avec en-têtes, corps binaires et en flux et une annulation, puis chaque autre globale, et ce que propose Hermes Intl.',
      pt: 'A biblioteca padrão de ponta a ponta num dispositivo: fetch com cabeçalhos, corpos binários e em stream e um abort, depois cada outra global, e o que o Hermes Intl tem.',
      de: 'Die Standardbibliothek durchgehend auf einem Gerät: fetch mit Headern, binären und gestreamten Bodies und einem Abbruch, dann jedes weitere Global, und was Hermes Intl bietet.',
    },
  },
  {
    id: 'webview',
    kind: 'lab',
    name: 'WebView',
    path: 'demo/webview.tsx',
    run: 'kuito dev ios --entry webview.tsx',
    tags: ['WebView', 'webViewRef'],
    description: {
      en: 'A native web view: navigation events, messages both ways and injected scripts.',
      fr: 'Une vue web native : événements de navigation, messages dans les deux sens et scripts injectés.',
      pt: 'Uma vista web nativa: eventos de navegação, mensagens nos dois sentidos e scripts injetados.',
      de: 'Eine native Web-View: Navigationsereignisse, Nachrichten in beide Richtungen und injizierte Skripte.',
    },
  },
];
