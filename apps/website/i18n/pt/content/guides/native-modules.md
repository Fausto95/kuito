# Módulos nativos

Um módulo nativo é código de plataforma que uma aplicação chama: uma classe Swift no iOS, uma classe Kotlin no Android e uma especificação TypeScript que declara ambas e as tipa para a aplicação. As capacidades do próprio Kuito (`haptics`, `clipboard`, `location`, `storage`, ...) são construídas desta forma.

## Chamar uma capacidade

Cada capacidade é um espaço de nomes que exporta as suas funções uma a uma, para que um bundle mantenha apenas as funções que chama.

```tsx
import { Text, clipboard } from 'kuito';

await clipboard.writeText('https://www.tvmaze.com');

<Text>{clipboard.hasText.value ? 'Paste' : 'Nothing to paste'}</Text>;
```

Uma ação é um verbo (`haptics.impact('light')`); uma que espera pela plataforma devolve uma Promise. Um facto fixo é uma propriedade (`device.model`). Um valor que muda é um sinal (`network.state`): leia `.value`, ou siga-o com `watch`.

## Declarar uma especificação

Um módulo é declarado uma vez, em TypeScript, e ligado por id. O compilador lê a especificação sem a executar, por isso ela contém apenas imports, tipos e `defineModule`. Uma união de strings declarada com `type` torna-se um enum, um tipo objeto um struct ou uma data class.

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

| Declaração         | Corre em                                 | O JavaScript recebe |
| ------------------ | ---------------------------------------- | ------------------- |
| `fn.sync`          | a thread JS                              | o valor             |
| `fn.main`          | a thread principal (UI)                  | uma Promise         |
| `fn.background`    | a thread de fundo serial do módulo       | uma Promise         |
| `fn.main.callback` | começa na sua thread, conclui mais tarde | uma Promise         |

- `event<Payload>()`: `low.addListener(fn)` devolve uma subscrição; nativamente, `startLow(emitter)` e `stopLow()` correm à volta dela.
- `live<T>()`: estado da plataforma lido como um sinal (`battery.charging.value`); sem observadores, cada leitura chama `charging()`, enquanto que, observado, `startCharging(signal)` corre e `signal.set(value)` escreve-o.
- `view<Props, Methods>({ events, methods })`: uma vista que a aplicação renderiza em JSX.

Mantenha as funções síncronas rápidas e thread-safe: bloqueiam o JavaScript e não podem tocar no UIKit nem nas Android Views.

## Escrever o seu

Os módulos de uma aplicação vivem em `modules/`, ao lado de `app/`. O diretório é o nome em kebab case, e a especificação tem o mesmo nome.

```sh
kuito module create Battery
```

O scaffold é `modules/battery/battery.ts`, `ios/BatteryModule.swift` e `android/BatteryModule.kt`. A classe Swift é `final` e conforma-se ao `BatterySpec` gerado; a build falha, nomeando o requisito, até ela implementar todos os membros.

```swift
final class BatteryModule: BatterySpec {
    init(context: KuitoModuleContext) {}
    func read() throws -> Reading { ... }
    @MainActor func startCharging(_ signal: KuitoSignal<Bool>) { ... }
    @MainActor func stopCharging() { ... }
}
```

A classe Kotlin recebe o `KuitoModuleContext` e implementa o `BatterySpec` gerado, de `dev.kuito.link`.

Lance `KuitoModuleError("ERR_BUSY", "...")` para falhar com o seu próprio código; qualquer outro erro chega como `ERR_NATIVE`.

## Usá-lo

Importe o default da especificação e chame os seus membros. Um módulo que nada chama não é compilado.

```tsx
import Battery from './modules/battery/battery';

const reading = await Battery.read();

<Text>{Battery.charging.value ? 'Charging' : `${Math.round(reading.level * 100)}%`}</Text>;
```

`kuito dev` constrói o módulo na shell da aplicação. Guardar um ficheiro `.swift`, `.kt` ou `.ts` em `modules/` reconstrói a shell; qualquer outra alteração TypeScript continua a ser um Live Patch.

## Vistas

Um módulo pode contribuir com uma `UIView` no iOS e uma `View` do Android, renderizada em JSX como qualquer primitiva. Aceita props de estilo e de layout, e os seus eventos chegam como props `on*`. `Slider` é construído desta forma.

```tsx
import { Slider } from 'kuito';

<Slider flex={1} height={40} value={volume} onChangeEnd={(event) => save(event.value)} />;
```

- Um módulo tem no máximo uma vista: `view: view<SliderProps>({ events: ['change', 'changeEnd'] })`.
- Não tem tamanho intrínseco: dê-lhe uma `height`. Não aceita filhos.

## Em profundidade

[Módulos nativos](../../../../docs/native-modules.md) cobre o que o compilador gera, escrever uma vista nativamente, chamadas na thread de UI, efeitos de âmbito, necessidades nativas, funções callback, testes, códigos de erro e a API de módulos versionada.
