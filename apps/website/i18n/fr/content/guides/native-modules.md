# Modules natifs

Un module natif est du code de plateforme qu'une app appelle : une classe Swift sur iOS, une classe Kotlin sur Android, et une spec TypeScript qui déclare les deux et les type pour l'app. Les capacités propres de Kuito (`haptics`, `clipboard`, `location`, `storage`, ...) sont construites ainsi.

## Appeler une capacité

Chaque capacité est un espace de noms qui exporte ses fonctions une à une, donc un bundle ne garde que les fonctions qu'il appelle.

```tsx
import { Text, clipboard } from 'kuito';

await clipboard.writeText('https://www.tvmaze.com');

<Text>{clipboard.hasText.value ? 'Paste' : 'Nothing to paste'}</Text>;
```

Une action est un verbe (`haptics.impact('light')`) ; celle qui attend la plateforme renvoie une Promise. Un fait fixe est une propriété (`device.model`). Une valeur qui change est un signal (`network.state`) : lisez `.value`, ou suivez-la avec `watch`.

## Déclarer une spec

Un module est déclaré une fois, en TypeScript, et lié par id. Le compilateur lit la spec sans l'exécuter, donc elle ne contient que des imports, des types et `defineModule`. Une union de chaînes déclarée avec `type` devient un enum, un type objet un struct ou une data class.

```ts
import { defineModule, event, fn, live } from 'kuito';

export type Reading = { level: number; charging: boolean };

export default defineModule('Battery', {
  read: fn.sync<() => Reading>(),
  charging: live<boolean>(),
  low: event(),
  ios: { class: 'BatteryModule' },
  android: { class: 'com.example.myapp.modules.battery.BatteryModule' },
});
```

| Déclaration        | S'exécute sur                              | JavaScript reçoit |
| ------------------ | ------------------------------------------ | ----------------- |
| `fn.sync`          | le thread JS                               | la valeur         |
| `fn.main`          | le thread principal (UI)                   | une Promise       |
| `fn.background`    | le thread d'arrière-plan sériel du module  | une Promise       |
| `fn.main.callback` | démarre sur son thread, se règle plus tard | une Promise       |

- `event<Payload>()` : `low.addListener(fn)` renvoie un abonnement ; nativement, `startLow(emitter)` et `stopLow()` s'exécutent autour de lui.
- `live<T>()` : un état de la plateforme lu comme un signal (`battery.charging.value`) ; non observé, chaque lecture appelle `charging()`, tandis qu'observé `startCharging(signal)` s'exécute et `signal.set(value)` l'écrit.
- `view<Props, Methods>({ events, methods })` : une vue que l'app rend en JSX.

Gardez les fonctions synchrones rapides et thread-safe : elles bloquent JavaScript et ne doivent pas toucher UIKit ni Android Views.

## Écrire le vôtre

Les modules d'une app vivent dans `modules/`, à côté de `app/`. Le répertoire est le nom en kebab case, et la spec est nommée comme lui.

```sh
kuito module create Battery
```

Le squelette est `modules/battery/battery.ts`, `ios/BatteryModule.swift` et `android/BatteryModule.kt`. La classe Swift est `final` et se conforme à la `BatterySpec` générée ; le build échoue, en nommant l'exigence, tant qu'elle n'implémente pas chaque membre.

```swift
final class BatteryModule: BatterySpec {
    init(context: KuitoModuleContext) {}
    func read() throws -> Reading { ... }
    @MainActor func startCharging(_ signal: KuitoSignal<Bool>) { ... }
    @MainActor func stopCharging() { ... }
}
```

La classe Kotlin prend le `KuitoModuleContext` et implémente la `BatterySpec` générée, depuis `dev.kuito.link`.

Levez `KuitoModuleError("ERR_BUSY", "...")` pour échouer avec votre propre code ; toute autre erreur arrive en `ERR_NATIVE`.

## L'utiliser

Importez l'export par défaut de la spec et appelez ses membres. Un module que rien n'appelle n'est pas compilé.

```tsx
import Battery from './modules/battery/battery';

const reading = await Battery.read();

<Text>{Battery.charging.value ? 'Charging' : `${Math.round(reading.level * 100)}%`}</Text>;
```

`kuito dev` compile le module dans le shell de l'app. Sauvegarder un fichier `.swift`, `.kt` ou `.ts` sous `modules/` reconstruit le shell ; tout autre changement TypeScript reste un Live Patch.

## Vues

Un module peut fournir une `UIView` sur iOS et une `View` Android, rendue en JSX comme n'importe quelle primitive. Elle prend les props de style et de mise en page, et ses événements arrivent en props `on*`. `Slider` est construit ainsi.

```tsx
import { Slider } from 'kuito';

<Slider flex={1} height={40} value={volume} onChangeEnd={(event) => save(event.value)} />;
```

- Un module a au plus une vue : `view: view<SliderProps>({ events: ['change', 'changeEnd'] })`.
- Elle n'a pas de taille intrinsèque : donnez-lui une `height`. Elle ne prend pas d'enfants.

## En profondeur

[Modules natifs](../../../../docs/native-modules.md) couvre ce que le compilateur génère, l'écriture native d'une vue, les appels sur le thread UI, les effets de portée, les besoins natifs, les fonctions callback, les tests, les codes d'erreur et l'API de module versionnée.
