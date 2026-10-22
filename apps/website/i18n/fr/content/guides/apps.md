# Projets d'app

Une app créée par `kuito create` ne contient que du TypeScript et de la configuration. Tout le natif est livré dans le framework, et la CLI génère et compile les shells natifs de chaque app à la demande.

```text
MyApp/
  app/                 the app: file-based routes
  assets/              icon.png and icon-staging.png, the app icons; splash.png
  modules/             the app's own native modules
  kuito.config.ts      native settings: name, ids, icon, environments
  package.json         one dependency: kuito
  .kuito/              generated shells and builds; never committed
```

L'app ne commite aucun projet `ios/` ni `android/`. `kuito` est sa seule dépendance, et les shells sont régénérés depuis le framework installé à chaque build, donc une nouvelle version apporte de nouveaux shells.

## kuito.config.ts

`kuito.config.ts` est la seule entrée native. Toute commande `kuito` qui compile ou lance une app en a besoin d'un dans le répertoire où elle s'exécute, et échoue sans lui.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  version: '1.2.0',
  buildNumber: 14,
  icon: './assets/icon.png',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
} satisfies KuitoConfig;
```

| Clé                                             | Effet                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `name`                                          | Le nom sous l'icône de l'app.                                                             |
| `version`                                       | Ce que voient les utilisateurs. Jusqu'à trois nombres. `1.0.0`.                           |
| `buildNumber`                                   | Ce par quoi les stores ordonnent les envois. À augmenter à chaque envoi. `1`.             |
| `icon`                                          | L'icône de l'app sur les deux plateformes : un PNG carré d'au moins 1024x1024. Optionnel. |
| `ios.bundleIdentifier`, `android.applicationId` | Des ids en DNS inversé (`com.example.app`) ; ce que `kuito dev` installe et lance.        |

D'autres clés ont leur propre page : `permissions` ([Permissions](../../../../docs/permissions.md#declare-them-in-kuitoconfigts)), `backgroundTasks` ([Tâches d'arrière-plan](../../../../docs/background-tasks.md)), `fonts` ([Polices](../../../../docs/fonts.md#bundle-fonts)), `migrations` ([Stockage](../../../../docs/storage.md#migrations)) et `splash` ([Écran de démarrage](../../../../docs/splash.md)).

La CLI vérifie le fichier : une clé manquante ou inconnue, un id malformé, une icône qui n'est pas un chemin `.png` ou une couleur malformée est une erreur nommant le fichier et la clé. Les chemins d'images sont relatifs à `kuito.config.ts`.

## Réglages natifs

Ce qui demanderait sinon d'éditer `Info.plist`, les entitlements, `AndroidManifest.xml` ou un thème est une clé de la config. Les clés typées passent en premier : une valeur, écrite dans le réglage propre à chaque plateforme. Une clé laissée à sa valeur par défaut n'écrit rien, donc le réglage propre du shell reste.

```ts
export default {
  // ...
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#101418',
  statusBar: { style: 'light' },
  urlSchemes: ['myapp'],
  linkDomains: ['example.com'],
} satisfies KuitoConfig;
```

Tout ce qui n'a pas de clé typée reste de la donnée, jamais un fichier natif ni une chaîne XML : `ios.infoPlist`, `ios.entitlements`, `android.manifest` et `android.theme`. Toute source d'entrées passe par une seule fusion ; deux qui se contredisent sur une clé font échouer le build en nommant les deux, donc une entrée brute ne peut pas contredire une clé typée ni un module.

## Environnements

La config elle-même est l'app de production. Un environnement est un nom et les clés qui en diffèrent ; toute autre clé est héritée, les clés imbriquées une par une. Une liste (`fonts`, `urlSchemes`, `android.manifest.intentFilters`) est remplacée en entier. `idSuffix` s'ajoute au bundle id et à l'applicationId, donc chaque environnement s'installe comme une app à part, à côté des autres.

```ts
export default {
  // ...
  environments: {
    staging: {
      name: 'MyApp Staging',
      idSuffix: '.staging',
      icon: './assets/icon-staging.png',
    },
  },
} satisfies KuitoConfig;
```

```sh
kuito dev ios                   # development
kuito dev ios --env staging     # MyApp Staging, com.example.myapp.staging
kuito build android             # production
```

`--env` en choisit un. `kuito dev` lance `development` et `kuito build` compile `production` quand il n'est pas donné ; tout autre nom doit être déclaré sous `environments`. L'environnement est un réglage de build seulement ; le JS de l'app ne le voit pas encore.

## Modules natifs

`modules/<name>/` contient les modules natifs propres à une app : la spec `<name>.ts`, `ios/*.swift` et `android/*.kt`. `kuito module create <Name>` en crée un. La CLI n'inclut dans chaque shell que les modules que le bundle de l'app appelle, donc personne n'édite le framework ([modules natifs](../../../../docs/native-modules.md#write-your-own-module)).

## En profondeur

[Projets d'app](../../../../docs/apps.md) couvre chaque clé de config, la table complète des réglages natifs, les entrées brutes d'`Info.plist` et de manifeste, la génération de l'icône de l'app, et ce que contiennent les shells Xcode et Gradle générés.
