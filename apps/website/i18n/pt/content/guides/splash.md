# Ecrã splash

O ecrã splash é o ecrã de arranque que o sistema mostra enquanto a aplicação inicia: um logótipo sobre uma cor, e uma marca opcional em baixo. O Kuito gera-o para ambas as plataformas a partir de `kuito.config.ts`, e mantém-se até o primeiro ecrã da aplicação estar no ecrã.

## Configuração

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  splash: {
    logo: './assets/splash.png',
    logoWidth: 120,
    background: '#7B5BEA',
    brand: './assets/brand.png',
    dark: { background: '#21164A' },
  },
} satisfies KuitoConfig;
```

- `logo`: um PNG, desenhado com `logoWidth` de largura no centro do ecrã. Obrigatório.
- `logoWidth`: em pontos (iOS) e dp (Android), de 1 a 288. Por predefinição `100`.
- `background`: uma cor como `#1E88E5`. Por predefinição `#FFFFFF`.
- `brand`: um PNG ajustado a uma caixa de 200x80, centrado a 60 do fundo. Opcional.
- `dark`: `logo`, `background` e `brand` em modo escuro; cada um recorre ao seu equivalente claro.
- `variants.<name>`: outro aspeto, o splash com estas chaves substituídas.

Cada chave pode ser substituída por [ambiente](../../../../docs/apps.md#environments). Os caminhos são relativos a `kuito.config.ts`. Cada PNG tem de ser 4x o seu tamanho em pontos: um logótipo de 120 pontos precisa de 480 píxeis de largura. O Android 12 e posteriores mostram o ícone do splash através de um círculo de 192dp: desenhe o logótipo com espaço à volta.

## Até a aplicação estar pronta

O splash nativo mantém-se enquanto a aplicação renderiza o seu primeiro ecrã, e desaparece no frame que mostra esse ecrã, sem código na aplicação. Para o manter mais tempo:

```tsx
import { splash } from 'kuito';

splash.hold(); // before the first render: keep it up

async function start() {
  await loadSession();
  screen.value = 'home';
  await splash.hide({ fade: true }); // after the home screen is drawn
}
```

- `splash.hold()` mantém o splash depois do primeiro ecrã, até `hide`. Chame-o antes da primeira renderização.
- `splash.hide({ fade })` esconde-o assim que as vistas que a aplicação renderizou até então estão no ecrã; `fade` demora 250 ms.
- `splash.visible` é um sinal: se o splash nativo está visível.
- `splash.layout()` são os frames do logótipo e da marca na janela; null sem splash.

`hide` depois de definir o estado do ecrã seguinte mostra esse ecrã, nunca o anterior.

## Animado: SplashScreen

`SplashScreen` desenha de novo o ecrã de arranque com vistas Kuito, a partir das mesmas imagens e cores. O splash nativo passa-lhe o testemunho sem alteração visível, e a partir daí é uma vista normal que a aplicação anima com props e [valores de movimento](../../../../docs/motion.md), e remove.

```tsx
import { motion, signal, timing, Show, SplashScreen } from 'kuito';

const splash = signal(true);
const scale = motion(1);
const opacity = motion(1);

<Show when={splash.value}>
  <SplashScreen
    opacity={opacity}
    logo={{ scale }}
    onReady={() => {
      scale.value = timing(450).to(6);
      opacity.value = timing({ duration: 450, onEnd: () => (splash.value = false) }).to(0);
    }}
  />
</Show>;
```

- Renderize-o na raiz, sobre a aplicação, no primeiro ecrã: o splash nativo esconde-se depois do primeiro frame como de costume, o que revela o `SplashScreen` desenhado por baixo, píxel por píxel.
- As suas próprias props (`opacity`, `scale`, `translateY`, qualquer prop de vista) aplicam-se ao splash inteiro; `logo` e `brand` aceitam as mesmas props para essas partes.
- `onReady` corre assim que o splash nativo desapareceu e esta vista é o que está a ser mostrado: inicie a animação aí.

O modo escuro segue o sistema em ambas as plataformas, na fase nativa e no `SplashScreen`.

## Variantes

`splash.variants` declara outros aspetos, e `splash.variant` é um sinal gravável que começa como a variante que este arranque mostrou, null para a predefinida. No Android 13 e posteriores, `splash.variant.value = 'holiday'` escolhe o tema com que o sistema desenha o seu próximo splash, e `null` volta ao predefinido. No Android 8 a 12 e no iOS, uma escrita é rejeitada com `ERR_UNSUPPORTED`, e o sinal volta atrás.

## Em profundidade

[Ecrã splash](../../../../docs/splash.md) cobre os filhos dinâmicos de `SplashScreen`, como cada plataforma mantém e passa o splash, e o que a CLI gera em `.kuito/`.
