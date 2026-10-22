# storage

Zustand, der den Prozess überlebt, in der SQLite-Datenbank, die beide Plattformen
mitliefern. Drei Schichten, jede auf der darunterliegenden aufgebaut:

- [`persisted`](#persisted): ein Signal, dessen Wert Neustarts übersteht.
- [`db`](#database): typisierte Tabellen und Abfragen, deren Zeilen ein Signal
  sind, das den Schreibvorgängen der Tabelle folgt.
- [`storage`](#keyvalue-functions): eine `Map` aus Strings, die Neustarts
  übersteht; das, worin `persisted` speichert.

Geheimnisse gehören in [`secureStore`](secure-store.md) oder in ein
`persisted`-Signal mit `secure: true`.

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

`persisted(initial, { key, schema })` ist ein `Signal` wie das von `signal()`,
auf dieselbe Weise gelesen und geschrieben, überall: in einer Komponente, in
einem Modul, in einer Hintergrundaufgabe.

- **Der erste Lesevorgang ist synchron.** Er liest den Schlüssel auf dem
  JS-Thread (`storage.peek`), sodass bereits der erste Frame den gespeicherten
  Wert zeigt. Ist nichts gespeichert, ist der Wert `initial`.
- **Schreibvorgänge werden gebündelt.** Ein Schreibvorgang ändert den Wert
  sofort; wenn die JS-Aufgabe endet, überquert jeder darin geschriebene Schlüssel
  in einer Transaktion (`storage.setMany`) die Grenze zum Hintergrund-Thread des
  Moduls.
- **Werte sind JSON**, als Text unter `key` gespeichert. Ein Wert, den JSON nicht
  abbilden kann (eine Funktion, `undefined`), wirft beim Schreiben.
- **Ein Schlüssel ist ein Signal.** Jeder `persisted`-Aufruf mit einem Schlüssel
  gibt das Signal zurück, das der erste erzeugt hat, sodass jede Komponente, die
  ihn nennt, es teilt.
- **Der gespeicherte Wert wird** beim Lesen gegen `schema` **geprüft**. Ein Wert,
  der nicht passt oder kein JSON ist, ist eine LogBox-Warnung, und das Signal hält
  `initial`, bis der nächste Schreibvorgang ihn ersetzt. Es wirft nie.

`persisted(initial, { key, schema, secure: true })` hält den Wert über
[`secureStore`](secure-store.md) in der Keychain, für kleine Geheimnisse wie ein
Token. Die Keychain antwortet auf einem Hintergrund-Thread, sodass das Signal
`initial` hält, bis sie es tut, dann den gespeicherten Wert; ein Schreibvorgang
davor gewinnt. Um "noch nicht gelesen" von "nichts gespeichert" zu unterscheiden,
beginnt man mit `undefined`, das JSON nie speichert:

```tsx
const token = persisted<string | null | undefined>(undefined, {
  key: 'token',
  schema: v.nullable(v.string()),
  secure: true,
});
// undefined: reading; null: signed out; a string: signed in.
```

## Schemas

Ein `schema` ist ein beliebiges [Standard Schema](https://standardschema.dev):
Valibot-, Zod- und ArkType-Schemas sind es alle, sodass eine App die Bibliothek
mitbringt, die sie ohnehin verwendet, und Kuito von keiner abhängt. Kuito ruft
dessen `validate` mit den gelesenen Daten auf und verwendet den Wert, den es
ausgibt, sodass ein transformierendes Schema (ein Datums-String in ein `Date`)
auch gespeicherte Daten transformiert. Gespeicherte Daten werden synchron
gelesen, sodass ein asynchron validierendes Schema einen `TypeError` wirft.

## Datenbank

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

`db.table(name, schema)` ist eine Tabelle, die die [Migrationen](#migrations)
angelegt haben, und das Schema ihrer Zeilen. Ihre Schreibvorgänge:

| Funktion                 | Hinweise                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| `insert(row \| rows)`    | jede Zeile zuerst vom Schema geprüft; eine Abweichung lehnt ab     |
| `update(where, changes)` | setzt die Spalten aus `changes` auf den Zeilen, die `where` trifft |
| `delete(where)`          | löscht die Zeilen, die `where` trifft; `{}` trifft jede Zeile      |

Jeder Aufruf ist eine Transaktion auf dem Hintergrund-Thread des Moduls: jede
Zeile landet, oder keine, und sein Promise wird mit `ERR_STORAGE` abgelehnt.
Aufrufe laufen der Reihe nach, sodass eine Abfrage nach einem erwarteten
Schreibvorgang ihn liest.

`db.query(table, { where, orderBy, limit })` ist ein `ReadonlySignal` der
Zeilen, die diese auswählen, jede so, wie ihr Schema sie ausgibt:

- `where` trifft Zeilen, deren Spalten seinen Werten gleichen, und zwar alle;
  `null` trifft `NULL`.
- `orderBy` sortiert nach seinen Spalten, von der ersten bis zur letzten, jede
  `'asc'` oder `'desc'`.
- `limit` behält die ersten Zeilen.

Der erste Lesevorgang ist synchron, auf dem JS-Thread, sodass der erste Frame die
Zeilen hat. Nachdem jeder Schreibvorgang in die Tabelle gelandet ist, liest eine
Abfrage, die etwas liest, auf dem Hintergrund-Thread erneut und aktualisiert
sich: nur das, was sie liest, läuft, ohne erneute Planung. Eine Abfrage, die
nichts liest, kostet nichts, bis sie wieder gelesen wird.

Eine gespeicherte Zeile, die ihr Schema ablehnt, ist eine LogBox-Warnung und
wird aus den Zeilen ausgelassen. Namen werden geprüft, bevor irgendetwas die
Grenze überquert: eine Tabelle oder Spalte besteht aus Buchstaben, Ziffern und
`_`, sodass nichts, was eine App übergibt, als SQL läuft. Werte sind Strings,
Zahlen, Booleans und `null`; SQLite hat keinen Boolean-Typ, sodass ein Boolean
als `1` oder `0` gespeichert und als Zahl zurückgelesen wird (ein Schema kann
ihn zurückwandeln). Es gibt keine BLOB-Spalte: Dateien werden mit
[`fileSystem`](file-system.md) gespeichert und ihre Pfade hier.

### Migrationen

Die Tabellen stammen aus `migrations` in `kuito.config.ts`, die älteste zuerst.
Jede ist eine SQL-Anweisung oder eine Liste von Anweisungen, die zusammen
angewendet werden:

```ts
export default {
  // …
  migrations: [
    'CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, album TEXT, plays INTEGER NOT NULL DEFAULT 0)',
    ['ALTER TABLE tracks ADD COLUMN rating INTEGER', 'CREATE INDEX tracks_plays ON tracks (plays)'],
  ],
} satisfies KuitoConfig;
```

Die CLI schreibt sie in das Bundle jeder Shell (`kuito-migrations.json`), und
das Storage-Modul wendet diejenigen, die ein Gerät noch nicht ausgeführt hat, der
Reihe nach an, jede in einer Transaktion, wenn die App zum ersten Mal eine
Tabelle abfragt oder beschreibt. Eine Tabelle namens `kuito_migrations` hält
jede fest, die gelaufen ist. Migrationen sind append-only: eine Migration, die
bereits gelaufen ist und sich geändert hat, oder eine entfernte, lässt jede
Abfrage und jeden Schreibvorgang mit `ERR_STORAGE` fehlschlagen, mit Angabe,
welche. Eine neue Migration erfordert einen Rebuild der Shell, wie jede Änderung
an `kuito.config.ts`. Jede Umgebung teilt sie, sodass eine Umgebung keine
eigenen setzen kann.

## Key/Value-Funktionen

Persistente Key-Value-Speicherung für Strings: eine `Map`, die Neustarts
übersteht, mit den Verben von `Map`, plus einem synchronen Lesevorgang für den
Start. `persisted` ist darauf aufgebaut.

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

| Funktion           | Läuft auf                         | Hinweise                                                |
| ------------------ | --------------------------------- | ------------------------------------------------------- |
| `peek(key)`        | dem JS-Thread, synchron           | `string \| null`                                        |
| `get(key)`         | dem Hintergrund-Thread des Moduls | `Promise<string \| null>`                               |
| `set(key, value)`  | Hintergrund                       |                                                         |
| `delete(key)`      | Hintergrund                       |                                                         |
| `keys()`           | Hintergrund                       | in keiner bestimmten Reihenfolge                        |
| `getMany(keys)`    | Hintergrund                       | `[key, value \| null][]`, in der Reihenfolge von `keys` |
| `setMany(entries)` | Hintergrund                       | eine Transaktion: jeder Eintrag landet, oder keiner     |
| `deleteMany(keys)` | Hintergrund                       | eine Transaktion                                        |
| `clear()`          | Hintergrund                       | entfernt jeden Schlüssel, den `storage` hält            |

Werte sind Strings. Alles andere zu speichern ist Sache der App:
`JSON.stringify` auf dem Hinweg, `JSON.parse` auf dem Rückweg. Ein Wert, der
kein String ist, wird mit `ERR_ARGUMENT` abgelehnt; ein Datenbankfehler wird mit
`ERR_STORAGE` abgelehnt.

Asynchrone Aufrufe laufen der Reihe nach auf einem Hintergrund-Thread, sodass
`set` gefolgt von `get` den neuen Wert liest. `peek` läuft auf dem JS-Thread und
sieht jeden Schreibvorgang, dessen Promise aufgelöst wurde; ein noch laufender
Schreibvorgang ist dafür möglicherweise noch nicht sichtbar. Der Schreibvorgang
sollte abgewartet werden, bevor synchron gelesen wird.

## Speicherung auf der Festplatte

Beide Plattformen halten eine SQLite-Datenbank, mit dem systemeigenen SQLite:
die Key/Value-Tabelle, `storage (key TEXT PRIMARY KEY, value TEXT)`, neben den
Tabellen der App. Der App wird nichts hinzugefügt:

- iOS: `Application Support/Kuito/storage.sqlite`, über `libsqlite3`.
- Android: `databases/kuito-storage.db`, über `android.database.sqlite`.

SQLite statt `UserDefaults` oder `SharedPreferences`, die die ganze Datei in den
Speicher laden und sie bei jeder Änderung vollständig neu schreiben. Keines von
beiden ist für mehr als Einstellungen gedacht. SQLite statt einer Datei pro
Schlüssel, weil `setMany` atomar ist und viele kleine Schlüssel günstig bleiben.
Eine Datenbank für beides, damit ein Schlüssel und eine Tabelle dieselbe
Dauerhaftigkeit teilen.

**Dauerhaftigkeit.** Die Datenbank läuft im WAL-Modus mit `synchronous=NORMAL`.
Sobald das Promise eines Schreibvorgangs aufgelöst ist, übersteht der
Schreibvorgang das Beenden oder Abstürzen der App. Ein Stromausfall oder
OS-Absturz kann die letzten paar Schreibvorgänge zurückrollen, beschädigt die
Datenbank aber nie.

**Größe.** Keine Quote jenseits des freien Festplattenspeichers. Werte müssen
unter dem 1-GB-Limit von SQLite liegen. Auf Android verwenden Key/Value-Lesevorgänge
`simpleQueryForString`, keinen Cursor, sodass Werte über dem 2-MB-Limit des
`CursorWindow` vollständig zurückgelesen werden; die Zeilen einer Abfrage gehen
durch einen Cursor. Jeder Wert und jede Zeile überquert dennoch die Host-Grenze
als JSON, also sollten Werte klein bleiben (Kilobytes, nicht Megabytes) und
Abfragen begrenzt. Große Blobs werden als Dateien gespeichert.

**Backup und Neuinstallation.** Die Datenbank ist Teil der App-Daten. iOS nimmt
sie in iCloud- und Computer-Backups auf. Android nimmt sie in Auto Backup auf,
wenn die App Backups erlaubt. Das Deinstallieren der App löscht sie auf beiden
Plattformen. Geheimnisse gehören in [`secureStore`](secure-store.md), nicht
hierher: die Datei ist durch die Dateiverschlüsselung des OS geschützt, nicht von
Kuito verschlüsselt.
