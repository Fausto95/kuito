# Moteur de rendu natif

Comment les opérations de vue du noyau deviennent des vues UIKit et Android.

## Forme

- Le TSX de l'app compile via l'abaissement JSX d'Oxc dans Rolldown (runtime classique `__kuitoJSX`).
- Les propriétés natives calculées sont des expressions JSX qui lisent des signaux (p. ex. `opacity={visible.value ? 1 : 0}`), que le compilateur transforme en fermetures. Le noyau suit les signaux lus par la fermeture et s'y abonne, effectuant des mises à jour au niveau de la propriété **sans réexécuter la fonction du composant**. Les conditions structurelles (`Show`, `Switch`/`Match`, expressions enfants réactives) replanifient le module quand leurs signaux changent ; voir [flux de contrôle](control-flow.md).
- L'étiquette d'une vue correspond à un seul objet natif : sa prop `id`, ou `__kuito:<module>:<path>` généré depuis sa place, son composant et sa clé ([rafraîchissement incrémental](incremental.md)). Dans le noyau, chaque étiquette a un numéro (`src/runtime/view-ids.ts`) depuis le plan qui la nomme en premier jusqu'au retrait de la vue ; `plan.ts`, `reconcile.ts` et `commit.ts` travaillent avec des numéros, et `host.ts` les retransforme en étiquettes à la frontière hôte. Les patchs compatibles mettent à jour les valeurs des propriétés et les gestionnaires tout en conservant l'objet et le signal. Les vues retirées sont libérées. Une vue dont la sorte ou le parent change est retirée et recréée, avec son sous-arbre. Les déplacements conservent la plus longue suite d'enfants déjà dans l'ordre et déplacent le reste.
- `native/ios/Renderer/` (UIKit) et `native/android/app/src/main/java/dev/kuito/runtime/renderer/` (Android Views) implémentent les mêmes opérations de vue avec la même mise en page :
  - `Kuito*Renderer` possède l'arbre de vues seulement : création, déplacement, retrait (avec `exiting`), vidage.
  - `KuitoViewFactory` fait correspondre chaque sorte Kuito à une vue native et câble ses événements. Les sortes fournies par les modules natifs (`module:<Name>`) viennent de `KuitoModuleViews` par la même recherche, et apportent leur propre table de props, gardée sur le style de la vue avant les tables partagées ([vues natives](native-modules.md#views)).
  - `KuitoEventEmitter` écrit les événements dans le format de transport décrit dans [événements](events.md).
  - `properties/` contient une table par préoccupation (animation, mise en page, décoration, texte, contrôles), indexée par nom de prop ; `KuitoProperties` les fusionne, rejette une prop revendiquée deux fois, et indexe les setters par clé de prop (`KuitoProperties.byKey`), de sorte que la clé d'un enregistrement trouve son setter sans hacher un nom. Les props propres à une vue de module passent en premier, par nom. Ajoutez une prop à `src/protocol/manifest.ts` (sa préoccupation nomme la table), lancez `npm run generate`, puis ajoutez une entrée à cette table sur les deux plateformes ; `test/protocol-parity.test.ts` échoue tant que chaque plateforme marquée par le manifeste n'a pas le setter, et échoue sur un setter, une sorte de vue ou une clé de charge utile d'événement que le manifeste ne liste pas. Chaque table est un seul littéral, pour que le test puisse la lire.
  - `styling/` contient l'enregistrement par vue (`KuitoViewStyle`, ci-dessous), les specs d'animation, les couleurs et l'analyse des valeurs.
  - `KuitoCommands` fait correspondre chaque commande à ce qu'elle fait. Une commande est une instruction ponctuelle (`focus`, `blur`, `keyboard.dismiss`, `accessibility.announce`, `accessibility.focus`, `accessibility.status`) : le noyau écrit un enregistrement `Command` dans le lot hôte, après les mutations qui le précèdent (docs/native-scheduling.md). L'id 0 désigne l'app.
  - `keyboard/` suit le clavier et déplace les vues qui l'évitent ([clavier](keyboard.md)) ; `accessibility/` compose les props d'accessibilité de chaque vue et rapporte l'état ([accessibilité](accessibility.md)).

## Un enregistrement par vue

Chaque moteur de rendu garde une seule map, `nodes`, du numéro d'une vue à son
enregistrement, `KuitoViewStyle`. L'enregistrement est tout ce que le moteur
de rendu sait de la vue :

- `view` : sa vue native, nil tant que le nœud est aplati. Le nœud de mise en
  page pointe vers la même vue ; définir celle de l'enregistrement définit
  celle du nœud.
- `content` : où vont les vues de ses enfants quand ce n'est pas la vue (le
  contenu d'un Scroll).
- `layoutRoot` (iOS) et `sheet` : définis pour une vue qui met en page son
  propre sous-arbre, hors de la mise en page de son parent.
- `exiting` : défini une fois qu'une vue retirée a quitté l'arbre de Kuito
  mais pas l'écran. `animated` pendant que le thread UI exécute son `exit`,
  dont elle prend encore les props jusqu'à `exited` ; `transition` pendant que
  la transition de son conteneur déplace une page hors de l'écran. Toute autre
  mutation de celle-ci est une `missingView`. L'enregistrement disparaît quand
  la vue a disparu.
- Son nœud de mise en page, ses gestes, et l'état de style des props qui se
  composent en une seule valeur de plateforme (transformation, attributs de
  texte, arrière-plan).

L'aplatissement change un seul fait, le `view` de l'enregistrement, et
l'enregistrement reste. `clear()` abandonne chaque enregistrement.

## Erreurs

Chaque erreur qu'un moteur de rendu lève est une `KuitoRenderError`, avec les
quatre mêmes cas sur les deux plateformes (`native/ios/Renderer/KuitoRenderError.swift`,
`native/android/.../renderer/KuitoRenderError.kt`). Le shell abandonne la
mutation et rapporte l'erreur ([LogBox](logbox.md)) ; il n'y a aucun repli.

| Cas                | Quand                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unsupportedProp`  | La vue n'accepte pas cette prop ou cette commande : aucune table ne l'a, ou elle appartient à une autre sorte (`objectFit` sur une `Box`).                                         |
| `unsupportedValue` | La prop ou la commande n'accepte pas cette valeur. Elle nomme la prop, la valeur, la vue et ce que la prop accepte.                                                                |
| `invalidTree`      | La mutation produit un arbre que le moteur de rendu ne peut pas afficher : un numéro déjà utilisé, une sorte inconnue, une page hors de son conteneur, un aplatissement deux fois. |
| `missingView`      | Aucune vue n'a ce numéro.                                                                                                                                                          |

Un setter lève `context.unsupportedProp()` ou
`context.unsupportedValue(value, reason)`. Le code sous un setter qui n'a pas
de contexte (une spec de geste, les clés d'une liste, le nom d'un symbole) lève
`KuitoRenderError.Rejection(reason)`, que le moteur de rendu transforme en
`unsupportedValue` pour la prop en cours de définition ; le rejet d'une
commande devient `unsupportedValue` pour la commande.

## Exemple

```tsx
import { Button, Text, VStack, signal } from 'kuito';

export default function Counter() {
  const count = signal(0);

  return (
    <VStack gap={16}>
      <Text>Count: {count.value}</Text>
      <Button onPress={() => count.value++}>Increment</Button>
    </VStack>
  );
}
```

Le noyau planifie les trois vues une fois ; une pression écrit `count`, et le
`Text` seul se met à jour ; rien ne se replanifie.

## Validation locale

Lancez `npm test` pour les tests de contrat JS/VM purs, et les tests du moteur de rendu sur un simulateur et un émulateur (`CLAUDE.md` nomme les commandes).
