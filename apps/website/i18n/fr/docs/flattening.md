# Aplatissement des vues

Un conteneur qui ne fait que grouper et positionner ses enfants n'obtient pas
de vue native. Il garde son nœud dans l'arbre de mise en page partagé
(`native/shared/layout`), il dimensionne et place donc toujours ses enfants ;
leurs vues rejoignent l'ancêtre le plus proche qui a une vue, décalées de la
position du conteneur. L'aplatissement est automatique : il n'y a pas de prop
`collapsable`. Le Fabric de React Native fait de même dans son différenciateur.

## Ce qui est de pure mise en page

Un nœud est de pure mise en page quand toutes ces conditions tiennent :

- Sa sorte est un conteneur simple : `VStack`, `HStack`, `Box` ou `Spacer`.
- Chacune de ses props est une prop de mise en page dans
  `src/protocol/manifest.ts` (préoccupation `layout`, générée dans
  `LAYOUT_PROPS`) : padding, marge, taille, position, et props flexbox.
- Il n'a pas de gestionnaire d'événement (`onPress`, `onScroll`, ...) ni de
  `ref`.
- Aucune prop n'est une animation (`timing(200).to(0)`, `spring().to(12)`) ni
  n'est pilotée par une valeur de mouvement sur le thread UI (`docs/motion.md`).

Toute autre prop conserve la vue : arrière-plan, dégradé, bordure, rayon
d'angle, ombre, opacité, transformations, `overflow`, `hidden`, `transition`,
`animate`, `enter`/`exit`, props d'accessibilité. La table liste ce qui peut
être aplati plutôt que ce qui ne peut pas l'être, une nouvelle prop conserve
donc sa vue à moins que son entrée de manifeste ne soit une prop de mise en
page ; `hidden` en est une qui a tout de même besoin d'une vue (`needsView`).

C'est la clé qui décide, pas la valeur : `backgroundColor={on.value ? 'red' : null}` conserve sa vue tant que la couleur est désactivée, la basculer ne crée
et ne détruit donc jamais de vues.

## Où cela se passe

Le noyau décide quand il commite un plan ; les moteurs de rendu l'exécutent. Le
noyau est le seul endroit qui voit tout ce qui a besoin d'une vue, puisque les
gestionnaires d'événement, les refs et les animations n'atteignent jamais
l'hôte comme props. Il applique aussi la même règle sur les deux plateformes
et est testé sans appareil (`test/flattening.test.ts`).

Le lot hôte le transporte dans deux enregistrements (docs/native-scheduling.md) :

- `Create` avec son drapeau d'aplatissement levé crée un nœud de pure mise en
  page.
- `Flatten` donne sa vue à un nœud commité ou la lui retire.

## Promotion et rétrogradation

Quand un commit ajoute une prop qui impose une vue à un nœud aplati, le noyau
envoie `setFlattened(id, false)` avant la prop. Le moteur de rendu crée la vue,
la place là où le nœud se trouve dans l'ordre de l'arbre, et y déplace les vues
des enfants du nœud. Une prop définie plus tard, depuis une liaison ou le
`setProperty` d'un handle d'élément, promeut le nœud de la même façon.

Quand un commit retire la dernière prop qui impose une vue, le noyau efface
d'abord les props sur la vue, puis envoie `setFlattened(id, true)`. Le moteur
de rendu déplace les vues des enfants vers l'ancêtre le plus proche qui a une
vue, dans le même ordre, et retire la vue. Un nœud ne s'aplatit à nouveau
qu'à un commit, une prop qui change à chaque frame n'entraîne donc jamais de
création et de destruction répétées de vues.

Ni l'un ni l'autre ne remonte les enfants : leurs vues natives et leur état
(le texte d'un champ, une position de défilement) restent.

## Dans les moteurs de rendu

Les deux moteurs de rendu gardent la même forme :

- Chaque nœud a un nœud de mise en page et un style. Un nœud aplati n'a pas de
  vue.
- `place` met la vue d'un nœud dans son hôte (l'ancêtre le plus proche qui a
  une vue, le contenu d'un Scroll, ou la racine) avant la vue suivante dans
  l'ordre de l'arbre. Un nœud aplati place les vues de ses enfants à la place.
- Cadres : les enfants d'un nœud aplati sont placés à leur propre cadre plus
  les cadres de chaque ancêtre aplati jusqu'à l'hôte (`applyFramesToChildren`
  sur iOS, `KuitoFlexLayout.forEachChildView` sur Android).

## Événements, hit testing et accessibilité

Les événements ne changent pas. Une pression va à la vue native touchée, et se
propage à travers l'arbre du noyau, qui inclut les nœuds aplatis :
`composedPath()`, `currentTarget` et `parent` sont les mêmes que sans
aplatissement. Les sortes aplaties n'émettent aucun événement natif propre.

Le hit testing ne change pas non plus, à une exception près, la même que dans
Fabric. UIKit et Android ne testent un enfant qu'à l'intérieur des limites de
son parent. Un enfant qui déborde d'un conteneur aplati peut être touché hors
de la boîte de ce conteneur, tant qu'il est à l'intérieur de l'ancêtre réel le
plus proche.

Les conteneurs simples ne sont des éléments d'accessibilité sur aucune des deux
plateformes, et les vues gardent leur ordre, VoiceOver et TalkBack lisent donc
les mêmes éléments dans le même ordre. Un conteneur avec des props
d'accessibilité conserve sa vue.
