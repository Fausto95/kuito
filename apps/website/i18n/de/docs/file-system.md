# fileSystem

Dateien in der Sandbox der App: Text oder base64 lesen und schreiben, prüfen,
erstellen, verschieben, kopieren und löschen sowie Downloads und Uploads mit
Fortschritt und Abbruch von und auf die Festplatte streamen.

```tsx
import { fileSystem } from 'kuito';

const notes = fileSystem.documents + 'notes.txt';

await fileSystem.write(notes, 'hello');
await fileSystem.write(notes, ' world', { append: true });
await fileSystem.read(notes); // 'hello world'
await fileSystem.info(notes); // { exists: true, uri, isDirectory: false, size: 11, modificationTime }
await fileSystem.delete(notes);

const photo = fileSystem.download(url, fileSystem.cache + 'photo.jpg', {
  headers: { Authorization: 'Bearer …' },
  onProgress: ({ bytes, total }) => console.log(bytes, total),
});

const { uri } = await photo; // or photo.cancel()

<Image src={{ uri }} />;
```

## Verzeichnisse und URIs

| Verzeichnis | iOS               | Android                         | Hinweise                                                     |
| ----------- | ----------------- | ------------------------------- | ------------------------------------------------------------ |
| `documents` | `Documents/`      | `Context.filesDir`              | bleibt erhalten, bis die App es löscht                       |
| `cache`     | `Library/Caches/` | `Context.cacheDir`              | das System kann es leeren, wenn der Speicherplatz knapp wird |
| `bundle`    | das `.app`-Bundle | `asset:///`, die Assets der APK | schreibgeschützt                                             |

Jedes ist eine `file://`-URI, die mit `/` endet, sodass sich ein Name anhängen
lässt. Jeder Pfad überquert die Grenze als URI, und die URIs, die `fileSystem`
zurückgibt, sind diejenigen, die `<Image src>` entgegennimmt. Die
Verzeichnisse werden einmal gelesen, synchron.

Auf Android ist das Bundle kein Verzeichnis auf der Festplatte:
`asset:///`-URIs funktionieren mit `read`, `info`, `list` und als Quelle von
`copy` (ein Asset herauskopieren, um es hochzuladen oder in einem `Image`
anzuzeigen). Die `info`-Größe eines komprimierten Assets ist `-1`.

## Funktionen

| Funktion                                     | Hinweise                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read(uri, { encoding, position, length })`  | `encoding` ist `'utf8'` (Standard) oder `'base64'`; `position` und `length` lesen einen Bytebereich, nur mit base64                                          |
| `write(uri, contents, { encoding, append })` | ersetzt die Datei atomar oder hängt an sie an                                                                                                                |
| `info(uri)`                                  | `{ exists: false, uri }` oder `{ exists: true, uri, isDirectory, size, modificationTime }` (Sekunden); die Größe eines Verzeichnisses ist die seiner Dateien |
| `exists(uri)`                                | `info(uri).exists`                                                                                                                                           |
| `createDirectory(uri, { intermediates })`    | schlägt fehl, wenn das übergeordnete Verzeichnis fehlt, außer mit `intermediates`, oder wenn dort bereits etwas liegt                                        |
| `delete(uri, { idempotent })`                | eine Datei oder ein Verzeichnis mit seinem Inhalt; schlägt fehl, wenn dort nichts liegt, außer mit `idempotent`                                              |
| `move(from, to)`, `copy(from, to)`           | ersetzen, was auch immer unter `to` liegt; `copy` nimmt auch Verzeichnisse                                                                                   |
| `list(uri)`                                  | die Namen der Einträge, sortiert                                                                                                                             |
| `download(url, to, { headers, onProgress })` | löst `{ uri, status, headers, mimeType }` auf                                                                                                                |
| `upload(url, from, options)`                 | löst `{ status, headers, body }` auf, unabhängig vom Status                                                                                                  |

Alles außer den Verzeichnissen läuft auf dem Hintergrund-Thread des Moduls,
der Reihe nach, sodass ein Lesevorgang nach einem Schreibvorgang diesen
sieht. Argumentfehler (ein anderes Encoding als utf8 oder base64, ein
Bytebereich ohne base64, ein Pfad, der keine `file://`-URI ist) sind
`TypeError`s, bevor irgendetwas die Grenze überquert. Die Plattform weist
zurück mit:

| Code            | Bedeutung                                                                             |
| --------------- | ------------------------------------------------------------------------------------- |
| `ERR_SANDBOX`   | Die URI liegt außerhalb der Sandbox, oder ein Schreibvorgang zielt auf das Bundle.    |
| `ERR_NOT_FOUND` | Nichts unter der URI, oder das übergeordnete Verzeichnis eines Schreibvorgangs fehlt. |
| `ERR_ENCODING`  | Ein utf8-Lesevorgang einer Datei, die kein UTF-8 ist; als base64 lesen.               |
| `ERR_HTTP`      | Ein Download antwortete außerhalb von 200–299. Nichts wird geschrieben.               |
| `ERR_CANCELED`  | Die Übertragung wurde abgebrochen.                                                    |
| `ERR_NETWORK`   | Die Übertragung scheiterte unterwegs: keine Verbindung, ein Timeout, TLS.             |

## Die Sandbox

Lesevorgänge bleiben innerhalb der Dokumenten-, Cache- und
Bundle-Verzeichnisse; Schreibvorgänge, Verschiebungen und Löschungen nur
innerhalb der Dokumenten- und Cache-Verzeichnisse, und nie die Verzeichnisse
selbst. `..` wird vor der Prüfung aufgelöst (auf Android auch Symlinks),
sodass eine URI nicht hinausklettern kann. Alles andere wird mit
`ERR_SANDBOX` zurückgewiesen, bevor das Dateisystem berührt wird.

## Downloads und Uploads

`download` und `upload` geben das Promise ihres Ergebnisses mit einer
`cancel()`-Methode zurück; ein Abbruch weist die Übertragung mit
`ERR_CANCELED` zurück. Sie laufen auf demselben HTTP-Host wie `fetch`
([Web-APIs](web-apis.md#fetch)): Die Sandbox des Moduls löst zuerst die Datei
auf (ein synchroner `sandboxed`-Aufruf, der mit `ERR_SANDBOX` oder
`ERR_NOT_FOUND` zurückweist), dann streamen die Bytes auf den
Netzwerk-Threads der Plattform (der `URLSession`-Delegate-Queue auf iOS, der
von OkHttp auf Android) direkt von und auf die Festplatte: Weder ein Body
noch eine Datei passiert JavaScript oder den UI-Thread. Downloads senden daher
keine Cookies und verwenden keinen HTTP-Cache, wie `fetch` es auch nicht tut.

- Ein Download landet neben seinem Ziel und ersetzt es erst, wenn der gesamte
  Body angekommen ist, sodass ein fehlgeschlagener oder abgebrochener Download
  die alte Datei belässt. Sein übergeordnetes Verzeichnis muss existieren.
  Weiterleitungen wird gefolgt.
- Ein Upload sendet die Datei als gesamten Body (`uploadType: 'binary'`, der
  Standard, mit `mimeType` als `Content-Type`) oder als ein Feld eines
  `multipart/form-data`-Formulars (`uploadType: 'multipart'`, mit `fieldName`,
  `mimeType` und `parameters`, die davor gesendet werden). `method` ist
  `POST`, `PUT` oder `PATCH`. Die Felder des Formulars und der Part-Header der
  Datei werden in JavaScript aufgebaut; der Host sendet sie, dann die Datei
  von der Festplatte, dann die abschließende Boundary. Auf iOS wird dieser
  Body zunächst in einer temporären Datei zusammengesetzt, sodass ein großer
  Upload nie im Speicher liegt.
- `onProgress` erhält `{ bytes, total }`, `total` ist `null`, wenn der Server
  keine Länge sendet. Jede Übertragung hört nur ihren eigenen Fortschritt,
  höchstens alle 100 ms plus den Endstand. Ohne `onProgress` sendet die
  Plattform keinen.
- Ein Reload oder das Schließen der App bricht jede Übertragung ab.

## Binärdaten und die JSON-Grenze

Die Argumente und Ergebnisse eines nativen Moduls überqueren die Host-Grenze
als Strings, Zahlen und JSON, nie als Bytes
([native Module](native-modules.md#wire-format)), daher überqueren Binärdaten
sie als base64: 4/3 der Bytes, gehalten als JavaScript-String (zwei Bytes pro
Zeichen in Hermes), plus die Kopie auf der nativen Seite. Eine 10-MB-Datei,
als base64 gelesen, kostet in JavaScript rund 27 MB und noch einmal so viel
unterwegs. Große Binärdaten von der Grenze fernhalten:

- Bytes zwischen Netzwerk und Festplatte mit `download` und `upload`
  bewegen, zwischen Dateien mit `copy` und `move`, und Bilder per URI
  anzeigen.
- Wenn JavaScript die Bytes sehen muss, sie in Blöcken lesen:
  `read(uri, { encoding: 'base64', position, length })` und
  `write(uri, chunk, { encoding: 'base64', append: true })`. Blöcke mit einem
  Vielfachen von 3 Bytes kodieren ohne Padding, sodass sich ihr base64
  aneinanderfügen lässt.

## Noch nicht

- Hintergrund-Downloads, die weiterlaufen, während die App angehalten ist,
  und das Fortsetzen eines abgebrochenen Downloads.
- `content://`-URIs aus den Pickern von Android und der App-Group-Container
  von iOS.
- Hashes (`md5`) in `info`.
