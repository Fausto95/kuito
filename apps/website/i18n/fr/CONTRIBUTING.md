# Contribuer à Kuito

Merci de contribuer à l'amélioration de Kuito. Le projet est expérimental : les contributions les plus utiles sont petites, testées et clairement documentées.

## Avant d'ouvrir une PR

1. Cherchez dans les issues et discussions existantes pour éviter le travail en double.
2. Expliquez le problème et le comportement proposé, en particulier pour les changements d'API publique.
3. Ajoutez ou mettez à jour le smoke test le plus proche : runtime, compilateur, CLI ou natif.
4. Mettez à jour la documentation et les exemples lorsque le comportement visible par l'utilisateur change.
5. Gardez explicites les limitations propres à chaque plateforme. N'annoncez pas de performances mesurées sans benchmark reproductible.

## Installation locale

```bash
npm install
npm ci --prefix apps/website             # le lint vérifie aussi le site
npm --prefix apps/website run build      # écrit les fichiers que le site importe
npm test
npm run lint
npm run fmt
```

Pour lancer la vitrine native, utilisez `npm run demo:ios` ou `npm run demo:android`. Les chaînes d'outils mobiles doivent être installées localement.

### Site web

Le site web TanStack Start se trouve sous `apps/website`.

```bash
cd apps/website
npm install
npm run typecheck
npm run build
```

Les contributions au site doivent rester accessibles, responsives et transparentes sur les fonctionnalités expérimentales.

## Attentes pour les pull requests

- Décrivez le changement visible par l'utilisateur et joignez des captures d'écran avant/après pour les changements d'UI.
- Liez l'issue ou expliquez la motivation.
- Indiquez les commandes que vous avez exécutées et sur quels appareils.
- Conservez les attributions tierces et les obligations de licence.
- Ajoutez un changeset quand les utilisateurs remarqueront le changement (voir [Versions](#releases)).

## Versions

Le paquet npm `kuito` est versionné avec [Changesets](https://github.com/changesets/changesets).
Une PR qui change ce que reçoivent les utilisateurs (la CLI, `kuito`, `kuito/config`, `kuito/tests`,
les shells natifs, les templates) en ajoute un :

```bash
npm run changeset
```

La commande demande le niveau de version (patch, minor ou major) et une ligne pour le changelog,
puis l'écrit dans `.changeset/`. La documentation, les tests et les refactorisations internes n'en
ont pas besoin.

Sur `main`, le workflow de publication (`.github/workflows/release.yml`) tient ouverte une PR
« Version packages » qui applique les changesets en attente : la nouvelle version dans
`package.json` et son entrée dans `CHANGELOG.md`. Fusionner cette PR publie la version sur npm et
crée son tag.

## Code de conduite et licence

Une collaboration respectueuse et constructive est attendue. Kuito est distribué sous la
[licence MIT](LICENSE).
