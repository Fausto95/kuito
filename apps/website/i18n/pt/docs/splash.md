# Ecrã splash

O ecrã splash é o ecrã de arranque que o sistema mostra enquanto a app inicia:
um logótipo sobre uma cor, e uma marca opcional em baixo. O Kuito gera-o para
ambas as plataformas a partir de `kuito.config.ts`, para que fique igual no
iOS e em todas as versões do Android, da 8 à 16. Mantém-se até o primeiro ecrã
da app estar visível, e passa então o testemunho a uma vista Kuito que a app
pode animar e preencher com conteúdo dinâmico.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  // name, ios, android...
  splash: {
    logo: './assets/splash.png',
    logoWidth: 120,
    background: '#7B5BEA',
    brand: './assets/brand.png',
    dark: { background: '#21164A' },
    variants: { holiday: { logo: './assets/splash-holiday.png', background: '#C62828' } },
  },
  environments: {
    staging: { splash: { background: '#FF8115' } },
  },
} satisfies KuitoConfig;
```

| Chave             | Efeito                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `logo`            | Um PNG, desenhado com `logoWidth` de largura no centro do ecrã. Obrigatório.             |
| `logoWidth`       | Em pontos (iOS) e dp (Android), de 1 a 288. `100`.                                       |
| `background`      | Uma cor como `#1E88E5`. `#FFFFFF`.                                                       |
| `brand`           | Um PNG ajustado a uma caixa de 200×80, centrado a 60 do fundo do ecrã. Opcional.         |
| `dark`            | `logo`, `background` e `brand` em modo escuro; cada um recorre ao seu equivalente claro. |
| `variants.<name>` | Outro aspeto, o splash com estas chaves substituídas: ver [Variantes](#variants).        |

Cada chave pode ser substituída por [ambiente](apps.md#environments), uma a
uma: `staging: { splash: { background } }` mantém o logótipo. As variantes
herdam também o splash do ambiente. Os caminhos são relativos a
`kuito.config.ts`.

O logótipo é desenhado com a sua própria forma: 120 de largura para um PNG 2:1
dá 120×60. Cada PNG tem de ser grande o suficiente para os ecrãs mais densos,
4× o seu tamanho em pontos: um logótipo de 120 pontos precisa de 480 píxeis de
largura, uma marca de 800×320 para uma caixa completa. Um mais pequeno é um
erro que nomeia a sua chave. Desenhe o logótipo com espaço à volta:

- **O Android 12 e posteriores** mostram o ícone do splash através de um
  círculo de 192dp. Um logótipo cuja diagonal é maior do que 192 fica com os
  cantos cortados aí, pelo que a build avisa com o `logoWidth` mais largo que
  cabe.
- A caixa da marca é de 200×80 porque é esse o tamanho que o SplashScreen do
  Android 12 dá a uma imagem de branding; as outras plataformas usam a mesma
  caixa para que a marca fique no mesmo sítio em todo o lado.

## Até a app estar pronta

O splash nativo mantém-se enquanto o Hermes arranca e a app renderiza o seu
primeiro ecrã, e desaparece no frame que mostra esse ecrã: nenhum frame branco
ou vazio pelo meio, sem código na app.

```tsx
import { splash } from 'kuito';

splash.hold(); // before the first render: keep it up

async function start() {
  await loadSession();
  screen.value = 'home';
  await splash.hide({ fade: true }); // after the home screen is drawn
}
```

| API                     | Efeito                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `splash.hold()`         | Mantém o splash depois do primeiro ecrã, até `hide`. Chame-o antes da primeira renderização.                                      |
| `splash.hide({ fade })` | Esconde-o assim que as vistas que a app renderizou até então estão no ecrã; `fade` demora 250 ms. Resolve quando ele desapareceu. |
| `splash.visible`        | Um sinal: se o splash nativo está visível. Observado, passa a `false` assim que o splash desaparece.                              |
| `splash.layout()`       | Os frames do logótipo e da marca na janela (pontos, dp); null sem splash.                                                         |
| `splash.variant`        | Um sinal gravável: [variantes](#variants).                                                                                        |

Como as plataformas o mantêm e passam o testemunho:

- **O iOS** mostra o launch storyboard até a janela da app desenhar. A shell
  instancia o mesmo storyboard sobre a sua vista raiz antes desse primeiro
  desenho, pelo que a captura do sistema e a vista da shell são os mesmos
  píxeis, e remove-o na mesma transação Core Animation que o lote que desenha
  o primeiro ecrã da app.
- **O Android** mantém o splash do sistema (a starting window antes do Android
  12, a vista da API SplashScreen depois) ao reter o primeiro desenho da
  janela até o primeiro frame da app ser aplicado: a condição keep-on-screen,
  como um `OnPreDrawListener`. A shell desenha a mesma layer list sobre a sua
  raiz, pelo que, quando a janela desenha, o splash do sistema dá lugar a
  píxeis idênticos. No Android 12 e posteriores, a shell toma a vista splash
  do sistema e deixa a animação do seu ícone terminar antes de a remover.
- `hide` espera pelos lotes que a app enviou antes dele: uma chamada a um
  módulo nativo feita durante uma tarefa de JS começa depois de as alterações
  de vistas dessa tarefa chegarem à thread principal
  ([módulos nativos](native-modules.md#how-it-works)), e o splash desaparece
  no frame que as aplica. `hide` depois de definir o estado do ecrã seguinte
  mostra esse ecrã, nunca o anterior.
- O ecrã de carregamento de desenvolvimento da shell nunca aparece sob o
  splash. Se a app não conseguir arrancar (um erro fatal), o splash desaparece
  para que o erro apareça.

## Animado: SplashScreen

`SplashScreen` desenha de novo o ecrã de arranque com vistas Kuito, nos frames
que `splash.layout()` reporta, a partir das mesmas imagens e cores. O splash
nativo passa-lhe o testemunho sem alteração visível, e a partir daí é uma vista
normal: a app anima-a com props e [valores de movimento](motion.md), na thread
da UI, e remove-a.

```tsx
import { Box, motion, signal, timing, Show, SplashScreen } from 'kuito';

export default function App() {
  const splash = signal(true);
  const scale = motion(1);
  const opacity = motion(1);

  return (
    <Box flex={1}>
      <Home />
      <Show when={splash.value}>
        <SplashScreen
          opacity={opacity}
          logo={{ scale }}
          onReady={() => {
            scale.value = timing(450).to(6);
            opacity.value = timing({ duration: 450, onEnd: () => (splash.value = false) }).to(0);
          }}
        />
      </Show>
    </Box>
  );
}
```

- Renderize-o na raiz, sobre a app, no primeiro ecrã: os seus frames são os da
  janela. O splash nativo esconde-se depois do primeiro frame como de costume,
  o que revela o `SplashScreen` desenhado por baixo, píxel por píxel.
- As suas próprias props (`opacity`, `scale`, `translateY`, qualquer prop de
  vista) aplicam-se ao splash inteiro; `logo` e `brand` aceitam as mesmas props
  para essas partes. Cada uma é um valor, uma animação ou um valor de movimento
  ([Motion](motion.md)).
- `onReady` corre assim que o splash nativo desapareceu e esta vista é o que
  está a ser mostrado: inicie a animação aí. Corre na montagem quando não há
  nada por que esperar (depois de um reload, ou sem splash na configuração,
  caso em que não desenha nada).
- Nenhuma thread é nomeada: o compilador e o kernel correm a animação na
  thread da UI ([valores de movimento](placement.md)).

As partes são vistas `SplashPart`, uma vista nativa do módulo `Splash`
([vistas nativas](native-modules.md#views)) que desenha as imagens do asset
catalog e a cor nomeada do próprio ecrã de arranque no iOS e os seus resources
no Android, pelo que seguem o modo escuro tal como o ecrã de arranque.

## Dinâmico

Depois da fase nativa, o splash é uma vista normal, pelo que pode mostrar
qualquer coisa no mesmo layout: os filhos de `SplashScreen` desenham-se sobre
o ecrã de arranque.

```tsx
const { logo } = splash.layout() ?? { logo: { y: 0, height: 0 } };

<SplashScreen onReady={load}>
  <Text position="absolute" top={logo.y + logo.height + 32} left={0} right={0} textAlign="center">
    {`Loading ${progress.value}%`}
  </Text>
</SplashScreen>;
```

Progresso, uma mensagem de carregamento, uma imagem remota ou sazonal: o que a
app renderizar. Deixe o trabalho da app para depois do primeiro ecrã (como
`load` faz), já que a fase nativa é estática até lá.

O modo escuro segue o sistema em ambas as plataformas, na fase nativa e no
`SplashScreen`: as cores e imagens têm variantes escuras quando `splash.dark`
as define.

### Variantes

`splash.variants` declara outros aspetos. O que cada plataforma pode fazer com
eles é definido pelo sistema, não pelo Kuito:

| Plataforma               | Próximo arranque                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android 13 e posteriores | `splash.variant.value = 'holiday'` escolhe o tema com que o sistema desenha o seu splash, através de `SplashScreen.setSplashScreenTheme`, e a shell desenha o mesmo aspeto. `null` volta ao predefinido.       |
| Android 8 a 12           | O sistema desenha o tema que o manifest nomeia, sempre o predefinido: uma escrita é rejeitada com `ERR_UNSUPPORTED`, reportada através do canal de erro, e o sinal volta atrás.                                |
| iOS                      | Um único ecrã de arranque, nomeado no Info.plist na build e guardado em cache pelo sistema como captura. Nenhuma API o altera, pelo que uma escrita é rejeitada com `ERR_UNSUPPORTED`, como no Android 8 a 12. |

`splash.variant` começa como a variante que este arranque mostrou, null para a
predefinida. Em todas as plataformas a app pode ainda mostrar o que quiser
depois da passagem de testemunho: um `SplashScreen` com filhos sazonais, ou a
sua própria vista no mesmo layout.

## O que a CLI gera

Em cada build, a CLI converte a configuração no ecrã de arranque de cada
plataforma em `.kuito/` (`src/cli/splash-screens.ts`), e salta-o quando nem a
configuração nem uma imagem mudaram desde a última build. As imagens são
reamostradas pelo mesmo codec PNG que os [ícones da app](apps.md#app-icons).

- **iOS**: `.kuito/ios/Splash/`, um launch storyboard (`Splash.storyboard`,
  que o `UILaunchStoryboardName` do Info.plist nomeia) e o seu asset catalog:
  o logótipo e a marca a 2x e 3x com as suas aparências escuras, e o fundo
  como cor nomeada com a sua aparência escura. Sem splash, a app recebe um
  `UILaunchScreen` vazio.
- **Android**: `.kuito/android/splash/`, um tema em que a activity arranca,
  `Theme.Kuito.Splash`, derivado do `AppTheme` da app ([definições nativas](apps.md#native-settings)):
  - **Android 8 a 11** (API 26–30): a starting window desenha o fundo de
    janela do tema, uma layer list com a cor, o logótipo centrado a
    `logoWidth` e a marca.
  - **Android 12 e posteriores**: a API SplashScreen desenha o
    `windowSplashScreenBackground` do tema, o logótipo como um
    `windowSplashScreenAnimatedIcon` de 288dp com o logótipo no seu próprio
    tamanho ao centro, e a marca como `windowSplashScreenBrandingImage`. O
    logótipo fica sobre os mesmos píxeis que antes do Android 12.
  - O modo escuro são resources `values-night` e `drawable-night`, e cada
    imagem é gerada de mdpi a xxxhdpi. `raw/kuito_splash.json` diz à shell o
    layout de cada aspeto.

O iOS guarda o ecrã de arranque em cache: depois de alterar o splash, apague a
app (ou reinicie o simulador) para ver o novo. O Android lê-o em cada arranque.

## Créditos

A abordagem, uma configuração a gerar o ecrã de arranque de cada plataforma e
uma vista que lhe sucede, vem de
[react-native-bootsplash](https://github.com/zoontek/react-native-bootsplash)
(MIT, Mathieu Acthernoene).
