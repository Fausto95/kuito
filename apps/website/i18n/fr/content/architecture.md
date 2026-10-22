# Architecture

Kuito se compose de six parties : un compilateur, un modèle de réactivité, un runtime sur l'appareil, deux moteurs de rendu d'une seule forme, l'aplatissement des vues et Live Patch. Les modules natifs étendent l'ensemble. Chaque partie ci-dessous renvoie à la page qui va plus loin.

<!-- diagram: kuito-architecture.svg -->

## Compilateur

Le TSX et le CSS deviennent un bundle JavaScript et des propriétés de style natives à la construction.

- **Oxc** abaisse le TSX. Une expression JSX qui lit un signal (`opacity={visible.value ? 1 : 0}`) devient une closure à laquelle le runtime s'abonne.
- **Rolldown** regroupe l'application avec ses dépendances npm, sans les modifier.
- **Le compilateur de styles** transforme les fichiers `.css` et `styles()` en propriétés natives numériques, plus de petites instructions relatives à la police pour `em`. Le CSS non pris en charge fait échouer la construction ; rien ne parse le CSS sur l'appareil.

Pour approfondir : [Feuilles de style](../../../docs/styles.md), [Unités CSS](../../../docs/css-units.md), [Moteur de rendu natif](../../../docs/native-renderer.md).

## Réactivité

Un signal contient une valeur. Le JSX qui le lit le suit ; une écriture met à jour les propriétés natives qui le lisent, et la fonction du composant ne s'exécute pas à nouveau.

<!-- diagram: kuito-reactivity.svg -->

- `computed` dérive, `watch` et `effect` réagissent, `store` fait de chaque chemin d'un objet un signal.
- Les écritures se regroupent d'elles-mêmes : tout ce qu'un événement écrit atteint l'écran en même temps.
- `Show`, `Switch` et `For` possèdent leur branche ; un changement ne replanifie que cette branche.
- Une instance de composant est sa place, sa définition et sa `key`. Chaque hook garde son emplacement par nom, pas par ordre d'appel, donc l'état survit aux modifications.

Pour approfondir : [Réactivité](../../../docs/reactivity.md), [Flux de contrôle](../../../docs/control-flow.md), [Live Patch](../../../docs/incremental.md).

## Runtime

Le JavaScript s'exécute dans Hermes à l'intérieur du processus natif, sur un thread qui lui est propre. Les vues vivent sur le thread UI.

<!-- diagram: kuito-threads.svg -->

- Chaque tâche (un événement, un timer, la fin d'une requête réseau) envoie au plus un lot de mutations de vues typées : `Create`, `Remove`, `Move`, `Flatten`, `Prop`, `Command`.
- Le lot est un seul `ArrayBuffer`, décodé une fois en C++. Hermes appelle le C++ via JSI ; il n'y a pas de bridge sérialisé.
- Le thread UI applique les lots dans l'ordre. Les événements natifs reviennent à Hermes par la même file.
- Les animations et les gestes peuvent s'exécuter sur le thread UI, à côté des vues, sans callback JavaScript par image.

Pour approfondir : [Threads et le lot hôte](../../../docs/native-scheduling.md), [Hermes sur l'appareil](../../../docs/on-device-hermes.md), [Mouvement](../../../docs/motion.md).

## Moteur de rendu

UIKit sur iOS et Android Views sur Android implémentent les mêmes opérations de vues avec la même mise en page.

<!-- diagram: kuito-renderer.svg -->

- Le noyau numérote les vues et valide un plan ; un label correspond à un seul objet natif, conservé entre patchs compatibles.
- Une fabrique de vues associe chaque type à une vue native. Les tables de propriétés, une par préoccupation, sont indexées par nom de prop ; un test de parité tient les deux plateformes au manifeste.
- Chaque moteur de rendu garde un enregistrement par vue : sa vue native, son nœud de mise en page, ses gestes, si elle est en sortie.
- Une prop arrive sur les deux plateformes dans le même changement, ou la doc dit laquelle en est dépourvue.

Pour approfondir : [Moteur de rendu natif](../../../docs/native-renderer.md), [Événements](../../../docs/events.md).

## Aplatissement

Un conteneur qui ne fait que grouper et positionner ses enfants n'obtient aucune vue native.

<!-- diagram: kuito-flattening.svg -->

- Mise en page seule : `VStack`, `HStack`, `Box` ou `Spacer`, uniquement des props de mise en page, aucun handler, aucune ref, aucune animation.
- Son nœud reste dans l'arbre de mise en page ; les vues de ses enfants rejoignent l'ancêtre le plus proche qui a une vue.
- C'est la clé de la prop qui décide, pas sa valeur : `backgroundColor={on.value ? 'red' : null}` garde sa vue tant que la couleur est désactivée, donc basculer ne crée ni ne détruit jamais de vues.
- Le noyau décide à la validation ; les moteurs de rendu l'exécutent. Pas de prop `collapsable`.

Pour approfondir : [Aplatissement des vues](../../../docs/flattening.md).

## Live Patch

Un fichier enregistré met à jour l'application en cours d'exécution. L'état et les vues natives survivent quand la modification est compatible.

<!-- diagram: kuito-live-patch.svg -->

- Les composants portent un id stable et une empreinte de la syntaxe dont ils dépendent. Une modification ré-exécute les composants qui lisent ce qui a changé, et seulement ceux-là ; un reformatage n'en ré-exécute aucun.
- Les patchs sont du code source JavaScript sur un WebSocket local, appliqués par le runtime Hermes persistant. Les changements de code natif nécessitent une reconstruction.
- Un patch qui ne s'applique pas est rejeté ; la version précédente reste active et la LogBox dit pourquoi.

Pour approfondir : [Live Patch](../../../docs/incremental.md), [Devtools](../../../docs/devtools.md), [LogBox](../../../docs/logbox.md).

## Modules natifs

Du code plateforme qu'une application appelle : une classe Swift, une classe Kotlin et une seule spec TypeScript qui déclare les deux.

<!-- diagram: kuito-native-modules.svg -->

- Le compilateur lit la spec sans l'exécuter et garde un stub par fonction que l'application appelle ; le bundle ne contient que ceux-là.
- Les modules sont liés par id dans les shells que le CLI génère. L'application ne versionne aucun projet natif.
- Un module peut exposer des fonctions, des signaux que la plateforme met à jour, et des vues rendues en JSX, comme le font `Camera`, `Video` et `WebView`.
- Les capacités propres à Kuito (`haptics`, `location`, `storage`, …) sont des modules de ce type.

Pour approfondir : [Modules natifs](../../../docs/native-modules.md), [Projets d'application](../../../docs/apps.md).

## Décisions

Les règles que chaque partie respecte, et ce qui reste ouvert, sont dans le [registre des décisions](../../../docs/architecture.md).
