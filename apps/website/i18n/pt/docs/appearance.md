# appearance

O modo claro ou escuro e o tamanho do texto do utilizador, como sinais.

```tsx
import { Text, watch, appearance } from 'kuito';

appearance.colorScheme.value; // 'light' | 'dark' | null
appearance.fontScale.value; // 1 by default

// In a component, a read in JSX or a watch follows the platform.
<Text>{appearance.colorScheme.value === 'dark' ? 'Night' : 'Day'}</Text>;
watch(appearance.fontScale, (scale) => console.log(scale));
```

Ambos são lidos de forma síncrona, e a plataforma só é observada enquanto
algo observa um deles. `colorScheme` é o `prefers-color-scheme` do
CSS: `null` quando a plataforma não tem preferência. A escala da fonte
fica aqui, com a outra preferência de visualização.

| Escala da fonte | iOS                                                                                                                                                   | Android                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Origem          | O tamanho do Dynamic Type, mapeado para os multiplicadores do React Native (`large` 1, `extraLarge` 1.118, `accessibilityExtraExtraExtraLarge` 3.571) | `Configuration.fontScale` |
| Mudança         | Atualiza o sinal                                                                                                                                      | Atualiza o sinal          |

O modo escuro atualiza `colorScheme` em ambos. No Android o manifesto trata `uiMode`
e `fontScale` (com a rotação e os redimensionamentos da janela), pelo que a atividade não é
recriada e a aplicação mantém o seu estado. Os tamanhos de texto no Android são fixados em
píxeis quando são definidos, pelo que numa mudança da escala da fonte o renderizador define de novo o
tamanho de cada texto: cada um acaba tão grande como seria numa aplicação iniciada com
a nova escala, incluindo o crescimento menor do Android 14 para texto grande.

## Como está ligado

O UIKit não tem notificação para uma mudança de `userInterfaceStyle`, pelo que o shell
iOS reporta os traits da sua cena a `KuitoTraits`
(`native/modules/appearance/ios`, pelo que o módulo é `always` na sua
spec): na ligação, a partir de
`windowScene(_:didUpdate:interfaceOrientation:traitCollection:)`, e quando
a cena fica ativa. Enquanto a aplicação está em segundo plano, o iOS alterna o
estilo para capturar ambas as aparências; o shell não reporta essas, e
põe-se em dia no regresso. O Android lê a configuração e escuta com
`registerComponentCallbacks`.
