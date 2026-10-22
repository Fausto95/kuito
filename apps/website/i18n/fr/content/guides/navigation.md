# Navigation

Les routes sont des valeurs typées, affichées dans des piles et des barres d'onglets natives : `UINavigationController` et `UITabBarController` sur iOS, une pile native avec retour prédictif et la navigation inférieure de Material sur Android.

## Fichiers de routes

Une app est un répertoire de fichiers de routes ; le compilateur les transforme en `routes`, une fonction typée par route. Chaque fichier `.tsx` ou `.jsx` qu'il contient est une route, sauf si son nom ou un répertoire au-dessus commence par `_` ou `.`.

```text
app/
  _layout.tsx                export const tabs = [{ name: 'shows', title: 'Shows', icon: 'tv' }]
  (shows)/index.tsx          routes.index()            /
  (shows)/show/[id].tsx      routes.show({ id: 42 })   /show/:id
  rate.tsx                   routes.rate({ show })     /rate, a sheet
```

- L'export par défaut est l'écran. Il reçoit les paramètres de la route en props, et `dismiss`.
- `export const options: RouteOptions<Params>` donne le reste : `title`, `presentation` (`'push'`, par défaut, ou `'sheet'`), `header`, `statusBar`.
- Le chemin du fichier est le chemin de lien profond de la route : `index` nomme le chemin de son répertoire, `[name]` est un paramètre `:name` et `[...name]` un fourre-tout final. Les répertoires `(name)` groupent des fichiers sans ajouter de segment.
- `_layout.tsx` déclare la barre d'onglets : `export const tabs`, un tableau de `{ name, title, icon }`. Chaque groupe `(name)` de premier niveau est l'onglet de ce nom ; les fichiers hors des groupes ne vont dans aucun onglet. Sans `tabs`, l'app est une seule pile.

## La table des routes

`routes` a une fonction par route, nommée d'après les segments statiques de la route en camelCase : `index` pour `/`, `showCast` pour `show/[id]/cast.tsx`. Appelée avec les paramètres de la route, elle retourne une `Destination`, la valeur que `navigate`, `present` et `<Link to>` acceptent. `routes.show({ id: '42' })` est une erreur de type.

Les paramètres d'une route sont ceux de son chemin, en chaînes, sauf si le fichier déclare leurs types :

```tsx
export type Params = { id: number; tab?: string };
```

`Params` a des membres `string`, `number` et `boolean` : chaque paramètre que le chemin nomme, aucun optionnel ; les autres viennent de la chaîne de requête d'un lien profond. Le compilateur écrit les types de la table dans `routes.generated.d.ts` ; commitez-le avec les routes.

## Se déplacer entre les routes

```tsx
import { Link, navigate, routes } from 'kuito';

navigate(routes.show({ id: 42 }));
<Link to={routes.show({ id: 43 })}>Next show</Link>;
```

- `navigate(to)` : affiche la destination. Une route dans un autre onglet sélectionne cet onglet ; toute autre route est empilée sur sa pile. Une route en feuille ouvre une feuille.
- `navigate(to, { replace: true })` : remplace l'écran du sommet à la place.
- `present(to)` : affiche la destination comme un nouvel écran, toujours, et se résout avec son résultat.
- `goBack()` : ferme la feuille du sommet, ou dépile la pile courante.
- `<Link to replace>` : un pressable qui navigue.

Un écran reste monté, avec son état, tant que des écrans sont empilés au-dessus de lui et pendant que vous changez d'onglet ; le dépiler le démonte.

## Résultats d'écran

`present` se résout avec le résultat que l'écran présenté passe à sa prop `dismiss`, qui le ferme aussi, ou `undefined` quand l'écran s'en va de toute autre façon.

```tsx
// app/rate.tsx
export type Result = number;

export default function Rate({ dismiss }: ScreenProps<{}, Result>) {
  return <Pressable onPress={() => dismiss(5)}>Five stars</Pressable>;
}

// anywhere
const stars = await present(routes.rate()); // number | undefined
```

## Liens profonds

Un lien est le seul endroit où une route est une chaîne. `export const linking = true` dans `_layout.tsx` suit les liens qui ouvrent l'app ; ils sont désactivés par défaut. Un lien devient la destination de la première route dont le chemin lui correspond, et on y navigue comme `navigate` le ferait.

Chaque paramètre de chemin s'analyse depuis son segment selon sa sorte : `/show/42` est `routes.show({ id: 42 })` quand `id` est un nombre. Un segment qui ne s'analyse pas ne correspond pas ; un lien qu'aucune route ne reconnaît est un avertissement console qui le nomme.

Les schémas et domaines qui ouvrent l'app viennent de `kuito.config.ts` : `urlSchemes` et `linkDomains` ([linking](../../../../docs/linking.md#the-apps-url-scheme)).

## En profondeur

[Navigation](../../../../docs/navigation.md) couvre les modules de routes et le démarrage à froid, les transitions d'éléments partagés, les icônes d'onglets, l'arbre `<Router>` en JSX, ce qu'un Live Patch conserve, et le contrat natif.
