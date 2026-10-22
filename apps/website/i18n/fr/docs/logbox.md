# LogBox

Les builds de développement montrent ce que votre app journalise et lève, sur
l'appareil et dans le terminal, rapporté à votre TSX.

## console

`console.log`, `info`, `debug`, `warn` et `error` fonctionnent sur le Hermes de
l'appareil. Les valeurs s'impriment sur une ligne comme Node les imprime
(`{ a: 1, b: [1, 'two'] }`, `[Circular]`, `[Function name]`), et chaque entrée
apparaît aussi :

- dans le terminal de `kuito dev`, à la ligne qui l'a journalisée :

  ```
  12:39:27  › hello { taps: 0 }                     src/App.tsx:14
  12:39:28  ▲ Image cache is 90% full               src/Feed.tsx:31
  12:39:47  ✖ TypeError: Cannot read property 'name' of undefined  src/Profile.tsx:5
  ```

- dans la console de Xcode et dans logcat (tag `Kuito`).

## Ce que la LogBox attrape

| Source                                                                                | Affiché comme     |
| ------------------------------------------------------------------------------------- | ----------------- |
| `console.warn`                                                                        | avertissement     |
| `console.error`                                                                       | erreur            |
| Une exception levée dans un gestionnaire d'événement, un timer ou un callback `fetch` | erreur            |
| Un rejet de promesse non géré                                                         | erreur            |
| Un Live Patch, ou votre app au démarrage, qui lève une exception                      | échec d'exécution |

Les avertissements et erreurs s'accumulent dans une barre au-dessus de
l'indicateur d'accueil : l'entrée la plus récente, combien d'erreurs et
d'avertissements attendent, et un ✕ pour les effacer. Touchez-la pour
inspecter. Le code en **échec d'exécution** ouvre l'inspecteur de lui-même — la
version précédente de l'app reste en vie derrière — et l'inspecteur se ferme
tout seul quand un Live Patch corrige le code.

## L'inspecteur

- **Le message**, et pour une répétition de la même entrée le nombre de fois
  qu'elle s'est produite (×3) au lieu de trois copies.
- **L'extrait de code** : la ligne fautive de votre source, surlignée, avec
  l'emplacement sous forme de lien qui ouvre votre éditeur à cet endroit.
- **La pile d'appels**, rapportée via les source maps du Live Patch. Vos frames
  viennent en premier ; celles de Kuito et des bibliothèques se replient
  derrière "Show N Kuito and library frames". Touchez une frame pour l'ouvrir
  dans votre éditeur.
- **Dismiss / Copy / Reload.** Copy met le message, l'emplacement, l'extrait de
  code et la pile dans le presse-papiers sous forme de texte, prêts pour un
  ticket ou une discussion. Reload redémarre l'app dans un runtime neuf et vide
  la LogBox.
- **‹ ›** fait défiler les entrées.

## Ouvrir les frames dans votre éditeur

Le serveur de développement lance l'éditeur, cela fonctionne donc depuis un
simulateur, un émulateur ou un appareil. Définissez `KUITO_EDITOR` pour le
choisir (`code`, `cursor`, `zed`, `subl`, `webstorm`, `idea`, `studio`, …, avec
des options si vous voulez : `KUITO_EDITOR="code --reuse-window"`) ; sinon un
`VISUAL` ou `EDITOR` graphique, puis VS Code. Seuls les fichiers à l'intérieur
du projet s'ouvrent.

## Comment ça marche

Le noyau installe `console` quand l'hôte natif fournit `__kuitoHostLog` ;
chaque entrée porte une pile (celle d'un argument `Error`, ou celle du site
d'appel). Les erreurs levées par les callbacks que l'hôte natif démarre
(événements, timers, fetch) passent par le même journal, tout comme les rejets
non gérés de Hermes. Le shell affiche les avertissements et les erreurs et
envoie chaque entrée au serveur de développement, qui rapporte la pile via la
source map du bundle qui l'a exécutée (`kuito://patch/N`) et répond avec des
frames et un extrait de code.
