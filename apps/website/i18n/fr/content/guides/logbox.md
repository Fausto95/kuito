# LogBox

Les builds de développement montrent ce que votre app journalise et lève, sur l'appareil et dans le terminal, rapporté à votre TSX.

## console

`console.log`, `info`, `debug`, `warn` et `error` fonctionnent sur le Hermes de l'appareil. Les valeurs s'impriment sur une ligne comme Node les imprime (`{ a: 1, b: [1, 'two'] }`, `[Circular]`, `[Function name]`), et chaque entrée apparaît aussi dans la console de Xcode et dans logcat (tag `Kuito`), et dans le terminal `kuito dev`, à la ligne qui l'a journalisée :

```text
12:39:27  › hello { taps: 0 }                     src/App.tsx:14
12:39:28  ▲ Image cache is 90% full               src/Feed.tsx:31
12:39:47  ✖ TypeError: Cannot read property 'name' of undefined  src/Profile.tsx:5
```

## Ce que la LogBox attrape

| Source                                                                             | Affiché comme     |
| ---------------------------------------------------------------------------------- | ----------------- |
| `console.warn`                                                                     | avertissement     |
| `console.error`                                                                    | erreur            |
| Une exception dans un gestionnaire d'événement, un minuteur ou un callback `fetch` | erreur            |
| Un rejet de promesse non géré                                                      | erreur            |
| Un Live Patch, ou votre app au démarrage, qui lève une exception                   | échec d'exécution |

Les avertissements et les erreurs s'accumulent dans une barre au-dessus de l'indicateur d'accueil : l'entrée la plus récente, combien d'erreurs et d'avertissements attendent, et un ✕ pour les effacer. Touchez-la pour inspecter. Le code en échec d'exécution ouvre l'inspecteur de lui-même, la version précédente de l'app reste vivante derrière, et l'inspecteur se ferme tout seul quand un Live Patch corrige le code.

## L'inspecteur

- Le message, et pour une répétition de la même entrée le nombre de fois qu'elle est survenue (x3) au lieu de trois copies.
- Le code frame : la ligne fautive de votre source, surlignée, avec l'emplacement en lien qui ouvre votre éditeur à cet endroit.
- La pile d'appels, rapportée via les source maps du Live Patch. Vos frames viennent en premier ; celles de Kuito et des bibliothèques se replient derrière "Show N Kuito and library frames". Touchez une frame pour l'ouvrir dans votre éditeur.
- Dismiss / Copy / Reload. Copy met le message, l'emplacement, le code frame et la pile dans le presse-papiers en texte, prêts pour une issue ou un chat. Reload redémarre l'app dans un runtime neuf et vide la LogBox.
- Des flèches font défiler les entrées.

## Ouvrir les frames dans votre éditeur

Le serveur de dev lance l'éditeur, donc ça marche depuis un simulateur, un émulateur ou un appareil. Définissez `KUITO_EDITOR` pour le choisir (`code`, `cursor`, `zed`, `subl`, `webstorm`, `idea`, `studio`, avec des options si vous voulez : `KUITO_EDITOR="code --reuse-window"`) ; sinon un `VISUAL` ou `EDITOR` graphique, puis VS Code. Seuls les fichiers du projet s'ouvrent.

## En profondeur

[LogBox](../../../../docs/logbox.md) couvre comment le kernel, le shell et le serveur de dev produisent chaque entrée et rapportent sa pile.
