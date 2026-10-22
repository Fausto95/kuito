# app

O estado e as ações da própria app: se está em primeiro plano, os avisos de
memória do sistema e a sua página nas Definições.

```tsx
import { watch, app } from 'kuito';

app.state.value; // 'active' | 'background' | 'inactive'

// In a component: both follow the platform until the component unmounts.
watch(app.state, (state) => {
  if (state === 'active') refresh();
});
app.watch('memoryWarning', () => cache.clear());

await app.openSettings();
```

| Membro                       | É                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `state`                      | Um sinal do estado. Lido sem ser observado, pergunta à plataforma.                  |
| `watch('memoryWarning', fn)` | Chama `fn()` quando o sistema tem pouca memória; devolve a sua `EventSubscription`. |
| `openSettings()`             | Abre a página desta app nas Definições do sistema. Resolve assim que tiver aberto.  |

A plataforma só é observada enquanto algo observa `app.state`: o `watch` de um
componente, ou uma prop ou texto que o lê. Começar a observar reporta o estado
de que a plataforma parte, pelo que uma mudança feita enquanto ainda estava a
arrancar (no Android a app retoma muitas vezes nesse momento) não se perde, e o
mesmo estado duas vezes é uma única mudança.

`app.watch` num componente começa quando o componente monta e pára quando
desmonta; fora de um, começa de imediato, e o `remove()` da subscrição
devolvida pára-o. Outro nome de evento lança um `TypeError`.

## Estados

| Estado       | iOS                                                                                 | Android                                                                        |
| ------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `active`     | A cena está em primeiro plano e recebe eventos.                                     | A atividade está retomada.                                                     |
| `inactive`   | A arrancar, ou entre estados: uma chamada, o seletor de apps, o Centro de Controlo. | Iniciada mas em pausa: outra atividade (a folha de partilha) cobre parte dela. |
| `background` | Outra app ou o ecrã principal está à frente.                                        | A atividade está parada.                                                       |

O React Native reporta `background` no Android assim que a atividade entra em
pausa, e não tem `inactive` aí. O Kuito reporta `inactive` enquanto está em
pausa mas ainda visível, pelo que uma folha de partilha não conta como sair da
app; o código que verifica `background` ou não `active` funciona da mesma
forma.

`memoryWarning` vem de `applicationDidReceiveMemoryWarning` no iOS, e de
`onTrimMemory` nos níveis `RUNNING_LOW`, `RUNNING_CRITICAL` e `COMPLETE` no
Android. O Android 14 e posteriores já não enviam os níveis running.

## Como está ligado

A shell reporta o ciclo de vida a `KuitoAppLifecycle`
(`native/modules/app-state`, `always` na sua spec para que todas as shells o
tenham): o `sceneDidBecomeActive`, `sceneWillResignActive`,
`sceneWillEnterForeground` e `sceneDidEnterBackground` do scene delegate no
iOS, e o `Lifecycle` da atividade no Android. O módulo lê-o e observa-o aí, e
o mesmo faz o [brightness](brightness.md). `KuitoAppLifecycle` sobrevive ao
runtime, pelo que um recarregamento arranca com o estado atual, e `app.state`
está correto antes de algo o observar.

Experimente a partir do terminal: `xcrun simctl launch` outra app para enviar
esta para segundo plano, ou no Android:

```bash
adb shell input keyevent KEYCODE_HOME
```

```bash
adb shell am send-trim-memory dev.kuito.shell RUNNING_LOW
```
