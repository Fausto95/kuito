# Devtools

Les builds de développement des shells Kuito incluent des devtools. Ils ne gênent pas votre app : il n'y a pas de bouton flottant.

## Les ouvrir

| Où                   | Comment                                       |
| -------------------- | --------------------------------------------- |
| Simulateur iOS       | Cmd+D                                         |
| Émulateur Android    | Cmd+M / Ctrl+M, ou la touche menu             |
| Un appareil physique | Le secouer                                    |
| La CLI `kuito dev`   | Appuyez sur `m` (marche pour chaque appareil) |

Ils s'ouvrent sous forme de feuille native avec l'état de la connexion, Reload et Reconnect, les dernières mises à jour Live Patch, la dernière erreur, l'URL du serveur de dev et deux moniteurs. Le moniteur de performances montre les FPS du thread UI, le temps de la dernière frame, les frames perdues et les commits de Kuito. Surligner les mises à jour fait clignoter chaque vue que le moteur de rendu met à jour, du vert au rouge à mesure que la même vue se met à jour dans la seconde, avec sous chaque clignotement l'écriture de signal qui l'a causé.

## Déboguer avec Chrome DevTools

Les deux runtimes Hermes de l'app sont débogables via le Chrome DevTools Protocol : le thread JS exécute votre app et le kernel Kuito ; le thread UI exécute les valeurs de mouvement, les gestes et les callbacks sur le thread UI. Appuyez sur `j` dans `kuito dev` pour ouvrir DevTools sur le thread JS de l'appareil connecté en dernier, ou `u` pour son thread UI. Vous avez le frontend de Chrome lui-même : Sources (votre TypeScript, via les source maps ; Live Patch continue de fonctionner pendant l'attache), Console, Performance (un profil CPU) et Memory (un instantané du tas).

Tout autre client CDP fonctionne aussi : `kuito dev` liste les cibles à `http://127.0.0.1:8765/json/list`, donc `chrome://inspect` les trouve une fois `127.0.0.1:8765` ajouté sous Discover network targets.

## Panneau Components

Appuyez sur `k` dans `kuito dev` pour le panneau Components : le modèle que Kuito a de l'app, du signal à la liaison à la vue.

- Tree : chaque instance de composant montée, nommée comme vous l'avez déclarée. En survoler une encadre les vues qu'elle a rendues.
- Component : ses props, ses hooks par nom (`const visits = signal(1)` apparaît comme `visits`), ses propriétaires et les vues natives qu'il a rendues.
- View : chaque prop avec la liaison derrière elle, les signaux que sa dernière exécution a lus. Select on device, puis touchez la vue.
- Signal : chaque prop dont la liaison le lit, et chaque branche qu'il décide.
- Édition : les valeurs sont du JSON ; Entrée en fixe une. Un signal prend l'édition comme si votre code avait écrit `.value`.
- History : les 500 dernières écritures des signaux que possèdent les composants. Step back ici redémarre l'app et rejoue les écritures jusqu'à celle-là.

Le graphe est lu quand le panneau le demande, donc il ne coûte rien à l'app tant que personne ne regarde.

## Enregistrement et rejeu

Les builds de développement enregistrent chaque batch que le runtime de l'app committe. Appuyez sur `s` dans `kuito dev` pour sauvegarder l'enregistrement de chaque appareil connecté dans `.kuito/recordings/<time>-<device>.krec`, avec à côté l'arbre de vues natif qu'il a construit en `<file>.tree`.

```sh
kuito replay .kuito/recordings/20261019-014618-p17-iphone-18-pro.krec ios
```

`kuito replay` lance le shell sans app ni runtime Hermes : le serveur de dev lui envoie l'enregistrement, et il applique les batches au rythme où ils ont été enregistrés. La CLI sauvegarde ensuite l'arbre de vues en `<file>.replayed` et rapporte s'il correspond au `.tree` enregistré. Un rejeu ne reproduit pas le code du thread UI ni l'état natif comme les positions de défilement, et ne tourne que sur un shell construit depuis le même Kuito, sur la plateforme qui a enregistré.

## Limites

- Les points d'arrêt dans un fichier que vous éditez sont perdus quand son Live Patch arrive.
- Le code du thread UI n'a pas encore de source map.
- Le runtime headless qui exécute les tâches d'arrière-plan n'est pas débogable.
- Une seule fenêtre DevTools débogue un runtime à la fois.
- Les builds de release n'incluent rien de tout cela.

## En profondeur

[Devtools](../../../../docs/devtools.md) couvre l'écran de démarrage et la pastille d'état, les messages du lien de dev, le navigateur dans lequel DevTools s'ouvre, ce que fait chaque thread pendant une pause, le format `.krec` et sa limite de taille, comment le proxy d'inspection relaie CDP, et ce que le panneau Components ne prend pas encore en charge.
