# window

A janela da aplicação como sinais: o seu tamanho, os insets da área segura e a sua
orientação, em pontos no iOS e em dp no Android.

```tsx
import { Text, window } from 'kuito';

<Text>{`${window.size.value.width} × ${window.size.value.height}`}</Text>;
<Text>{window.orientation.value === 'landscape' ? 'Wide' : 'Tall'}</Text>;
window.insets.value; // { top, left, bottom, right }
```

| Sinal         | É                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size`        | `{ width, height }`: o mesmo objeto enquanto o tamanho se mantém.                                                                                                   |
| `insets`      | Até onde a barra de estado, o notch, o indicador de início e a barra de navegação entram.                                                                           |
| `orientation` | `'landscape'` quando a janela é mais larga do que alta, caso contrário `'portrait'`.                                                                                |
| `widthClass`  | `'compact'` abaixo de 600 de largura, `'medium'` abaixo de 840, `'expanded'` mais largo; o que `@media (width-class: …)` segue ([condições](styles.md#conditions)). |

Os três são lidos de forma síncrona. Uma leitura em JSX ou um `watch` segue-os, e
o módulo emite mudanças apenas enquanto algo observa um deles. Para o preenchimento pela
área segura, `SafeArea` fá-lo nativamente e não precisa de nada disto: use os
sinais para decisões de layout que o JavaScript toma, como um número de colunas.

## Como está ligado

O shell reporta a sua janela a `KuitoWindowMetrics` (`native/modules/window`,
`always` na sua spec) após cada layout, o único momento em que o tamanho e os
insets estão ambos atualizados após uma rotação, um redimensionamento ou uma mudança das barras:

- iOS: o `layoutSubviews` e o `safeAreaInsetsDidChange` da janela, com
  `bounds` e `safeAreaInsets`.
- Android: um listener de layout global na vista raiz da atividade, com o seu tamanho
  e os insets da janela raiz das barras do sistema e do recorte do ecrã.

`KuitoWindowMetrics` guarda as últimas métricas sob um lock (iOS) ou num
campo volátil (Android), pelo que a thread JS as lê sem esperar pela
thread principal, e reporta apenas uma mudança.
