# storage

Un état qui survit au processus, dans la base de données SQLite que les deux
plateformes embarquent. Trois couches, chacune bâtie sur celle du dessous :

- [`persisted`](#persisted) : un signal dont la valeur survit aux redémarrages.
- [`db`](#database) : des tables typées, et des requêtes dont les lignes sont un
  signal qui suit les écritures de la table.
- [`storage`](#keyvalue-functions) : une `Map` de chaînes qui survit aux
  redémarrages, là où `persisted` stocke.

Les secrets vont dans [`secureStore`](secure-store.md), ou dans un signal
`persisted` avec `secure: true`.

## persisted

```tsx
import { persisted } from 'kuito';
import * as v from 'valibot';

const theme = persisted<'light' | 'dark' | 'system'>('system', {
  key: 'theme',
  schema: v.picklist(['light', 'dark', 'system']),
});

theme.value; // 'dark', if the last run stored it
theme.value = 'light'; // on disk when the JS task ends
```

`persisted(initial, { key, schema })` est un `Signal` comme ceux de `signal()`,
lu et écrit de la même façon, n'importe où : dans un composant, dans un module,
dans une tâche d'arrière-plan.

- **La première lecture est synchrone.** Elle lit la clé sur le thread JS
  (`storage.peek`), si bien que la première image affiche déjà la valeur
  stockée. Sans rien de stocké, la valeur est `initial`.
- **Les écritures sont groupées.** Une écriture change la valeur immédiatement ;
  à la fin de la tâche JS, chaque clé écrite pendant celle-ci traverse vers le
  thread d'arrière-plan du module en une seule transaction (`storage.setMany`).
- **Les valeurs sont du JSON**, stockées en texte sous `key`. Une valeur que JSON
  ne peut pas représenter (une fonction, `undefined`) lève une erreur à l'écriture.
- **Une clé est un signal.** Chaque appel `persisted` avec une clé renvoie le
  signal créé par le premier, si bien que chaque composant qui la nomme le partage.
- **La valeur stockée est vérifiée** contre `schema` à sa lecture. Une valeur
  qui ne correspond pas, ou qui n'est pas du JSON, est un avertissement LogBox, et
  le signal garde `initial` jusqu'à ce que l'écriture suivante la remplace. Cela
  ne lève jamais d'erreur.

`persisted(initial, { key, schema, secure: true })` garde la valeur dans le
trousseau via [`secureStore`](secure-store.md), pour de petits secrets tels qu'un
jeton. Le trousseau répond sur un thread d'arrière-plan, si bien que le signal
garde `initial` jusqu'à sa réponse, puis la valeur stockée ; une écriture faite
avant l'emporte. Pour distinguer "pas encore lu" de "rien de stocké", partez de
`undefined`, que JSON ne stocke jamais :

```tsx
const token = persisted<string | null | undefined>(undefined, {
  key: 'token',
  schema: v.nullable(v.string()),
  secure: true,
});
// undefined: reading; null: signed out; a string: signed in.
```

## Schémas

Un `schema` est n'importe quel [Standard Schema](https://standardschema.dev) :
les schémas Valibot, Zod et ArkType en sont tous, de sorte qu'une application
apporte la bibliothèque qu'elle utilise déjà et que Kuito ne dépend d'aucune.
Kuito appelle son `validate` avec les données lues, et utilise la valeur qu'il
produit, donc un schéma qui transforme (une chaîne de date en `Date`) transforme
aussi les données stockées. Les données stockées sont lues de façon synchrone,
donc un schéma qui valide de façon asynchrone lève une `TypeError`.

## Base de données

```tsx
import { db, List, Text } from 'kuito';
import * as v from 'valibot';

const tracks = db.table(
  'tracks',
  v.object({ id: v.number(), title: v.string(), album: v.nullable(v.string()), plays: v.number() }),
);

function Played() {
  const top = db.query(tracks, { orderBy: { plays: 'desc' }, limit: 20 });

  return <List data={top.value} renderItem={({ item }) => <Text>{item.title}</Text>} />;
}

await tracks.insert({ id: 1, title: 'Intro', album: null, plays: 0 });
await tracks.update({ id: 1 }, { plays: 1 }); // `Played` shows the new order
await tracks.delete({ album: null });
```

`db.table(name, schema)` est une table créée par les [migrations](#migrations),
et le schéma de ses lignes. Ses écritures :

| Fonction                 | Notes                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- |
| `insert(row \| rows)`    | chaque ligne est d'abord vérifiée par le schéma ; une non-correspondance rejette |
| `update(where, changes)` | affecte les colonnes de `changes` aux lignes que `where` sélectionne             |
| `delete(where)`          | supprime les lignes que `where` sélectionne ; `{}` sélectionne toutes les lignes |

Chaque appel est une transaction sur le thread d'arrière-plan du module : toutes
les lignes sont écrites, ou aucune, et sa promesse rejette avec `ERR_STORAGE`.
Les appels s'exécutent dans l'ordre, donc une requête après une écriture attendue
la lit.

`db.query(table, { where, orderBy, limit })` est un `ReadonlySignal` des lignes
que ceux-ci sélectionnent, chacune telle que son schéma la produit :

- `where` sélectionne les lignes dont les colonnes sont égales à ses valeurs,
  toutes ; `null` correspond à `NULL`.
- `orderBy` trie par ses colonnes, de la première à la dernière, chacune en
  `'asc'` ou `'desc'`.
- `limit` garde les premières lignes.

La première lecture est synchrone, sur le thread JS, donc la première image a les
lignes. Après chaque écriture dans la table, une requête que quelque chose lit
relit sur le thread d'arrière-plan et se met à jour : seul ce qui la lit
s'exécute, sans replanification. Une requête que rien ne lit ne coûte rien jusqu'à
ce qu'elle soit lue de nouveau.

Une ligne stockée que son schéma rejette est un avertissement LogBox, et exclue
des lignes. Les noms sont vérifiés avant que quoi que ce soit ne traverse : une
table ou une colonne se compose de lettres, de chiffres et de `_`, donc rien de
ce qu'une application passe ne s'exécute comme du SQL. Les valeurs sont des
chaînes, des nombres, des booléens et `null` ; SQLite n'a pas de type booléen,
donc un booléen est stocké comme `1` ou `0` et se relit comme un nombre (un schéma
peut le reconvertir). Il n'y a pas de colonne BLOB : stockez les fichiers avec
[`fileSystem`](file-system.md) et leurs chemins ici.

### Migrations

Les tables viennent de `migrations` dans `kuito.config.ts`, de la plus ancienne
à la plus récente. Chacune est une instruction SQL, ou une liste d'instructions
qui s'appliquent ensemble :

```ts
export default {
  // …
  migrations: [
    'CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, album TEXT, plays INTEGER NOT NULL DEFAULT 0)',
    ['ALTER TABLE tracks ADD COLUMN rating INTEGER', 'CREATE INDEX tracks_plays ON tracks (plays)'],
  ],
} satisfies KuitoConfig;
```

La CLI les écrit dans le bundle de chaque shell (`kuito-migrations.json`), et le
module Storage applique celles qu'un appareil n'a pas exécutées, dans l'ordre,
chacune dans une transaction, quand l'application interroge ou écrit une table
pour la première fois. Une table nommée `kuito_migrations` garde trace de
chacune de celles qui ont été exécutées. Les migrations sont en ajout seul :
une migration déjà exécutée et modifiée, ou une migration retirée, fait échouer
chaque requête et écriture avec `ERR_STORAGE` en indiquant laquelle. Une nouvelle
migration demande une reconstruction du shell, comme tout changement de
`kuito.config.ts`. Tous les environnements les partagent, donc un environnement
ne peut pas définir les siennes.

## Fonctions clé/valeur

Stockage clé-valeur persistant pour des chaînes : une `Map` qui survit aux
redémarrages, avec les verbes de `Map`, plus une lecture synchrone pour le
démarrage. `persisted` est bâti dessus.

```tsx
import { storage } from 'kuito';

// Synchronous: runs on the JS thread, so the first render can use it.
const theme = storage.peek('theme') ?? 'system';

await storage.set('theme', 'dark');
await storage.get('theme'); // 'dark'
await storage.setMany([
  ['user', JSON.stringify({ id: 42 })],
  ['seenOnboarding', 'true'],
]);
await storage.getMany(['user', 'missing']); // [['user', '{"id":42}'], ['missing', null]]
await storage.keys();
await storage.deleteMany(['user']);
await storage.delete('theme');
await storage.clear();
```

| Fonction           | S'exécute sur                      | Notes                                                        |
| ------------------ | ---------------------------------- | ------------------------------------------------------------ |
| `peek(key)`        | le thread JS, de façon synchrone   | `string \| null`                                             |
| `get(key)`         | le thread d'arrière-plan du module | `Promise<string \| null>`                                    |
| `set(key, value)`  | arrière-plan                       |                                                              |
| `delete(key)`      | arrière-plan                       |                                                              |
| `keys()`           | arrière-plan                       | sans ordre particulier                                       |
| `getMany(keys)`    | arrière-plan                       | `[key, value \| null][]`, dans l'ordre de `keys`             |
| `setMany(entries)` | arrière-plan                       | une transaction : toutes les entrées sont écrites, ou aucune |
| `deleteMany(keys)` | arrière-plan                       | une transaction                                              |
| `clear()`          | arrière-plan                       | supprime chaque clé que `storage` détient                    |

Les valeurs sont des chaînes. Stocker autre chose est le travail de
l'application : `JSON.stringify` à l'entrée, `JSON.parse` à la sortie. Une valeur
qui n'est pas une chaîne rejette avec `ERR_ARGUMENT` ; une défaillance de la base
de données rejette avec `ERR_STORAGE`.

Les appels asynchrones s'exécutent dans l'ordre sur un seul thread d'arrière-plan,
donc `set` suivi de `get` lit la nouvelle valeur. `peek` s'exécute sur le thread
JS et voit chaque écriture dont la promesse a été résolue ; une écriture encore en
cours peut ne pas lui être visible. Attendez l'écriture avant de lire de façon
synchrone.

## Stockage sur disque

Les deux plateformes gardent une seule base de données SQLite, avec le SQLite du
système : la table clé/valeur, `storage (key TEXT PRIMARY KEY, value TEXT)`, à
côté des tables de l'application. Rien n'est ajouté à l'application :

- iOS : `Application Support/Kuito/storage.sqlite`, via `libsqlite3`.
- Android : `databases/kuito-storage.db`, via `android.database.sqlite`.

SQLite plutôt que `UserDefaults` ou `SharedPreferences`, qui chargent tout le
fichier en mémoire et le réécrivent entièrement à chaque changement. Aucun des
deux n'est prévu pour plus que des réglages. SQLite plutôt qu'un fichier par clé,
parce que `setMany` est atomique et que beaucoup de petites clés restent peu
coûteuses. Une seule base de données pour les deux, pour qu'une clé et une table
partagent la même durabilité.

**Durabilité.** La base de données fonctionne en mode WAL avec
`synchronous=NORMAL`. Une fois la promesse d'une écriture résolue, l'écriture
survit à l'arrêt forcé ou au plantage de l'application. Une coupure de courant ou
un plantage de l'OS peut annuler les dernières écritures, mais ne corrompt jamais
la base de données.

**Taille.** Aucun quota au-delà de l'espace disque libre. Les valeurs doivent
rester sous la limite de 1 Go de SQLite. Sur Android, les lectures clé/valeur
utilisent `simpleQueryForString`, pas un curseur, donc les valeurs au-delà de la
limite de 2 Mo de `CursorWindow` se relisent entières ; les lignes d'une requête
passent par un curseur. Chaque valeur et chaque ligne traverse tout de même la
frontière de l'hôte en JSON, donc gardez les valeurs petites (des kilooctets, pas
des mégaoctets) et les requêtes limitées. Stockez les gros blobs sous forme de
fichiers.

**Sauvegarde et réinstallation.** La base de données fait partie des données de
l'application. iOS l'inclut dans les sauvegardes iCloud et sur ordinateur. Android
l'inclut dans Auto Backup quand l'application autorise la sauvegarde. Désinstaller
l'application la supprime sur les deux plateformes. Gardez les secrets dans
[`secureStore`](secure-store.md), pas ici : le fichier est protégé par le
chiffrement de fichiers de l'OS, pas chiffré par Kuito.
