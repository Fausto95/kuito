# Introduction

Kuito construit des applications iOS et Android natives à partir de TypeScript. Les composants sont du TSX, les styles du CSS, l'état des signaux. Le résultat est UIKit et Android Views : pas de webview, pas de moteur de rendu React.

> Kuito est expérimental et n'est pas prêt pour la production. Les API et les projets générés changent.

## Un composant

```tsx
import { signal, VStack, Text, Button } from 'kuito';

export default function Counter() {
  const count = signal(0);

  return (
    <VStack gap={16}>
      <Text>Count: {count.value}</Text>
      <Button onPress={() => count.value++}>Increment</Button>
    </VStack>
  );
}
```

`count` est un signal. `<Text>` le lit, donc une écriture met à jour ce seul label natif ; la fonction du composant ne s'exécute plus jamais.

## Fonctionnement

- **Compilé, pas interprété.** Le TSX et le CSS sont compilés à la construction. Aucun parseur CSS ne s'exécute sur l'appareil.
- **Hermes sur l'appareil.** L'application s'exécute dans le processus natif. Chaque événement envoie un lot de mutations de vues au thread UI.
- **De vraies vues.** Chaque composant est une vue UIKit ou Android, mise en page par un seul moteur partagé.
- **API web.** `fetch`, `WebSocket`, `URL`, les timers et `crypto`, assurés par la plateforme.
- **Modules natifs.** Du Swift et du Kotlin derrière une seule spec TypeScript ; `haptics`, `location`, `storage` et les autres sont construits ainsi.

La page [architecture](./architecture.md) explique chaque partie.

## Prérequis

- Node.js 22.18 ou plus récent
- iOS : macOS, Xcode, XcodeGen
- Android : JDK 21, Android SDK et NDK, Gradle 8

## Créer une application

```sh
npx kuito doctor
npx kuito create MyApp
cd MyApp
npx kuito dev ios    # or: npx kuito dev android
```

`kuito doctor` indique ce qui manque. `kuito create` écrit l'application et installe son unique dépendance. `kuito dev ios` démarre un simulateur, construit le shell natif, installe l'application et commence à surveiller vos fichiers.

```text
MyApp/
  app/               file-based routes
    _layout.tsx      tabs
    (home)/index.tsx the first screen
  assets/            icon.png, splash.png
  modules/           the app's own native modules
  kuito.config.ts    name, ids, icon, environments
```

Modifiez `app/(home)/index.tsx` et enregistrez : l'application en cours d'exécution se met à jour sur place, en conservant son état. Aucun projet natif n'est versionné ; le CLI génère les shells dans `.kuito/` à chaque construction.

## Ensuite

- [Projets d'application](../../../docs/apps.md) : structure, `kuito.config.ts`, environnements
- [Primitives](../../../docs/primitives.md) et [Réactivité](../../../docs/reactivity.md)
- [Styles](../../../docs/styles.md) : le CSS que Kuito compile
- [CLI](../../../docs/cli.md) : toutes les commandes
