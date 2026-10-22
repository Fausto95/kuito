# fileSystem

Les fichiers dans le bac à sable de l'application : lire et écrire du texte ou
du base64, inspecter, créer, déplacer, copier et supprimer, et diffuser des
téléchargements et des envois depuis et vers le disque avec progression et
annulation.

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

## Répertoires et URI

| Répertoire  | iOS               | Android                          | Notes                                                   |
| ----------- | ----------------- | -------------------------------- | ------------------------------------------------------- |
| `documents` | `Documents/`      | `Context.filesDir`               | conservé jusqu'à ce que l'application le supprime       |
| `cache`     | `Library/Caches/` | `Context.cacheDir`               | le système peut le vider quand l'espace vient à manquer |
| `bundle`    | le bundle `.app`  | `asset:///`, les assets de l'APK | lecture seule                                           |

Chacun est une URI `file://` terminée par `/`, de sorte qu'un nom s'y ajoute
directement. Chaque chemin traverse sous forme d'URI, et les URI que
`fileSystem` renvoie sont celles que `<Image src>` accepte. Les répertoires
sont lus une fois, de manière synchrone.

Sur Android, le bundle n'est pas un répertoire sur disque : les URI
`asset:///` fonctionnent avec `read`, `info`, `list` et comme source de `copy`
(copiez un asset vers l'extérieur pour l'envoyer ou l'afficher dans une
`Image`). La taille renvoyée par `info` pour un asset compressé est `-1`.

## Fonctions

| Fonction                                     | Notes                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read(uri, { encoding, position, length })`  | `encoding` est `'utf8'` (par défaut) ou `'base64'` ; `position` et `length` lisent une plage d'octets, en base64 seulement                                   |
| `write(uri, contents, { encoding, append })` | remplace le fichier atomiquement, ou y ajoute à la fin                                                                                                       |
| `info(uri)`                                  | `{ exists: false, uri }` ou `{ exists: true, uri, isDirectory, size, modificationTime }` (en secondes) ; la taille d'un répertoire est celle de ses fichiers |
| `exists(uri)`                                | `info(uri).exists`                                                                                                                                           |
| `createDirectory(uri, { intermediates })`    | échoue si le parent est absent sauf avec `intermediates`, ou si quelque chose existe déjà à cet endroit                                                      |
| `delete(uri, { idempotent })`                | un fichier, ou un répertoire avec son contenu ; échoue s'il n'y a rien sauf avec `idempotent`                                                                |
| `move(from, to)`, `copy(from, to)`           | remplacent ce qui se trouve à `to` ; `copy` accepte aussi les répertoires                                                                                    |
| `list(uri)`                                  | les noms des entrées, triés                                                                                                                                  |
| `download(url, to, { headers, onProgress })` | se résout en `{ uri, status, headers, mimeType }`                                                                                                            |
| `upload(url, from, options)`                 | se résout en `{ status, headers, body }` quel que soit le statut                                                                                             |

Tout sauf les répertoires s'exécute sur le thread d'arrière-plan du module,
dans l'ordre, de sorte qu'une écriture suivie d'une lecture voit l'écriture.
Les erreurs d'argument (un encodage autre que utf8 ou base64, une plage
d'octets sans base64, un chemin qui n'est pas une URI `file://`) sont des
`TypeError` avant que quoi que ce soit ne traverse. La plateforme rejette
avec :

| Code            | Signification                                                              |
| --------------- | -------------------------------------------------------------------------- |
| `ERR_SANDBOX`   | L'URI est hors du bac à sable, ou une écriture vise le bundle.             |
| `ERR_NOT_FOUND` | Rien à cette URI, ou le répertoire parent d'une écriture est absent.       |
| `ERR_ENCODING`  | Une lecture utf8 d'un fichier qui n'est pas en UTF-8 ; lisez-le en base64. |
| `ERR_HTTP`      | Un téléchargement a répondu hors de 200–299. Rien n'est écrit.             |
| `ERR_CANCELED`  | Le transfert a été annulé.                                                 |
| `ERR_NETWORK`   | Le transfert a échoué en chemin : pas de connexion, un délai dépassé, TLS. |

## Le bac à sable

Les lectures restent dans les répertoires de documents, de cache et du
bundle ; les écritures, déplacements et suppressions dans les répertoires de
documents et de cache seulement, et jamais sur les répertoires eux-mêmes. `..`
est résolu avant la vérification (sur Android, les liens symboliques aussi),
de sorte qu'une URI ne peut pas en sortir. Tout le reste est rejeté avec
`ERR_SANDBOX` avant que le système de fichiers ne soit touché.

## Téléchargements et envois

`download` et `upload` renvoient la promesse de leur résultat avec une
méthode `cancel()` ; annuler rejette le transfert avec `ERR_CANCELED`. Ils
s'exécutent sur le même hôte HTTP que `fetch` ([API web](web-apis.md#fetch)) :
le bac à sable du module résout d'abord le fichier (un appel synchrone
`sandboxed`, qui rejette avec `ERR_SANDBOX` ou `ERR_NOT_FOUND`), puis les
octets sont diffusés sur les threads réseau de la plateforme (la file du
délégué `URLSession` sur iOS, celle d'OkHttp sur Android) directement depuis
et vers le disque : ni un corps ni un fichier ne passe par JavaScript ou par
le thread UI. Les téléchargements n'envoient donc aucun cookie et n'utilisent
aucun cache HTTP, comme `fetch` ne le fait pas.

- Un téléchargement atterrit à côté de sa cible et ne la remplace qu'une fois
  le corps entier arrivé, de sorte qu'un téléchargement échoué ou annulé
  laisse l'ancien fichier. Son répertoire parent doit exister. Les
  redirections sont suivies.
- Un envoi envoie le fichier comme corps entier (`uploadType: 'binary'`, le
  défaut, avec `mimeType` comme `Content-Type`) ou comme un champ d'un
  formulaire `multipart/form-data` (`uploadType: 'multipart'`, avec
  `fieldName`, `mimeType` et `parameters` envoyés avant lui). `method` est
  `POST`, `PUT` ou `PATCH`. Les champs du formulaire et l'en-tête de la partie
  du fichier sont construits en JavaScript ; l'hôte les envoie, puis le
  fichier depuis le disque, puis la frontière de fermeture. Sur iOS, ce corps
  est d'abord composé dans un fichier temporaire, de sorte qu'un gros envoi ne
  réside jamais en mémoire.
- `onProgress` reçoit `{ bytes, total }`, `total` valant `null` quand le
  serveur n'envoie pas de longueur. Chaque transfert n'entend que sa propre
  progression, au plus toutes les 100 ms plus le décompte final. Sans
  `onProgress`, la plateforme n'en envoie aucune.
- Un rechargement ou la fermeture de l'application annule chaque transfert.

## Données binaires et frontière JSON

Les arguments et résultats d'un module natif traversent la frontière hôte
sous forme de chaînes, de nombres et de JSON, jamais d'octets
([modules natifs](native-modules.md#wire-format)), donc les données binaires
traversent en base64 : 4/3 des octets, tenus dans une chaîne JavaScript (deux
octets par caractère dans Hermes), plus la copie côté natif. Un fichier de
10 Mo lu en base64 coûte environ 27 Mo en JavaScript et autant en transit.
Gardez les grosses données binaires à l'écart de la frontière :

- Déplacez les octets entre le réseau et le disque avec `download` et
  `upload`, entre fichiers avec `copy` et `move`, et affichez les images par
  URI.
- Quand JavaScript doit voir les octets, lisez-les par morceaux :
  `read(uri, { encoding: 'base64', position, length })` et
  `write(uri, chunk, { encoding: 'base64', append: true })`. Des morceaux
  d'un multiple de 3 octets s'encodent sans remplissage, de sorte que leur
  base64 se concatène.

## Pas encore

- Les téléchargements en arrière-plan qui continuent pendant que l'application
  est suspendue, et la reprise d'un téléchargement annulé.
- Les URI `content://` des sélecteurs d'Android, et le conteneur de groupe
  d'applications iOS.
- Les hachages (`md5`) dans `info`.
