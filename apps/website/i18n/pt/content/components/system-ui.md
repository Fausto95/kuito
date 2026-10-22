# SystemBars

`SystemBars` declara o chrome do sistema à volta da aplicação enquanto estiver montado: a barra de estado, a cor da vista raiz, a barra de navegação do Android, o modo imersivo e o indicador de início do iOS. Renderize-o onde um ecrã precisa das suas próprias barras, ou dê `systemBars` a uma rota.

Use-o para:

- conteúdo claro na barra de estado sobre um ecrã escuro;
- uma fotografia ou um vídeo em ecrã inteiro com as barras escondidas;
- a barra de navegação do Android com a cor da aplicação.

```tsx
import { SystemBars, Text, VStack } from 'kuito';

export default function Gallery() {
  return (
    <>
      <SystemBars
        statusBar={{ content: 'light' }}
        backgroundColor="#101014"
        navigationBarColor="#101014"
        navigationBarButtonStyle="light"
      />
      <VStack flex={1} backgroundColor="#101014">
        <Text color="#ffffff">Photos</Text>
      </VStack>
    </>
  );
}
```

Cada SystemBars montado é uma entrada numa única pilha: o último que define uma prop ganha-a, cada uma das props de `statusBar` por si só, e uma prop omitida não define nada. Desmontar devolve as suas props às entradas abaixo, até às da própria shell. As cores são hex CSS (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) ou `transparent`; qualquer outra coisa é um `TypeError` quando renderiza.

## Padrões

### Definir as barras por ecrã

O `systemBars` de uma `Route` aceita as props de um SystemBars e aplica-as enquanto o seu ecrã tem o foco. Voltar atrás repõe o ecrã de baixo.

```tsx
import { Route, Router, Text } from 'kuito';

function Home() {
  return <Text padding={16}>Home</Text>;
}

function Photo() {
  return <Text padding={16}>Photo</Text>;
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} />
      <Route
        name="photo"
        path="/photo"
        screen={Photo}
        systemBars={{ statusBar: { content: 'light', hidden: true } }}
      />
    </Router>
  );
}
```

Os ecrãs de baixo numa pilha e os outros separadores mantêm-se montados, pelo que um SystemBars renderizado dentro deles também se mantém na pilha: para barras por separador, use o `systemBars` das rotas.

### Passar a ecrã inteiro

`immersive` esconde a barra de estado e a barra de navegação, deixa o indicador de início do iOS desvanecer, e no iOS deixa o primeiro deslize a partir da margem chegar à aplicação. Uma entrada montada depois dele ganha sobre o que ele esconde.

```tsx
import { Button, Show, SystemBars, VStack, Video, signal } from 'kuito';

export default function Player() {
  const fullScreen = signal(false);

  return (
    <VStack flex={1}>
      <Show when={fullScreen.value}>
        <SystemBars immersive />
      </Show>
      <Video src={{ uri: 'https://example.com/film.m3u8' }} flex={1} />
      <Button onPress={() => (fullScreen.value = !fullScreen.value)}>Full screen</Button>
    </VStack>
  );
}
```

### Animar a barra de estado

`animated` anima as alterações a `content`, `hidden` e ao `backgroundColor` do Android; `transition` escolhe como o iOS a mostra e esconde.

```tsx
import { Button, SystemBars, VStack, signal } from 'kuito';

export default function Reader() {
  const reading = signal(false);

  return (
    <VStack flex={1}>
      <SystemBars statusBar={{ hidden: reading.value, animated: true, transition: 'slide' }} />
      <Button onPress={() => (reading.value = !reading.value)}>Focus</Button>
    </VStack>
  );
}
```

### Dispor por baixo da barra de estado no Android

`SystemBars.statusBarHeight` é a altura da barra de estado em dp no Android, lida de forma síncrona, e null no iOS.

```tsx
import { Box, SystemBars } from 'kuito';

export default function Header() {
  return <Box height={56 + (SystemBars.statusBarHeight ?? 0)} backgroundColor="#5b5bd6" />;
}
```

## Diferenças entre plataformas

Uma prop que nomeia chrome que uma plataforma não tem não faz nada aí, pelo que o código da aplicação não precisa de verificações de plataforma.

| Prop                                                                    | iOS                                                                                                           | Android                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `statusBar.content`, `statusBar.hidden`                                 | Sim                                                                                                           | Sim                                        |
| `statusBar.transition`                                                  | `fade` (predefinição), `slide`, `none`                                                                        | A sua própria                              |
| `statusBar.backgroundColor`, `statusBar.translucent`                    | Sem efeito                                                                                                    | Sim                                        |
| `navigationBarColor`, `navigationBarButtonStyle`, `navigationBarHidden` | Sem efeito                                                                                                    | Sim                                        |
| `homeIndicatorAutoHidden`                                               | Sim                                                                                                           | Sem efeito                                 |
| `immersive`                                                             | Esconde a barra de estado, esconde automaticamente o indicador de início, adia os deslizes a partir da margem | Esconde as barras de estado e de navegação |

`statusBar.content: 'auto'` é o estilo com que a aplicação arrancou: `statusBar.style` em `kuito.config.ts`, que é texto escuro no modo claro e texto claro no modo escuro, salvo se definido.

## Ver também

- [SafeArea](./safe-area.md)
- [Router](./router.md)
- [Aparência](../../../../docs/appearance.md)
- [SystemBars em profundidade](../../../../docs/system-ui.md)
