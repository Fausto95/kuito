# keepAwake

Mantém o ecrã ligado enquanto o componente que o chama está montado. Cada chamada
segura o ecrã por si só, e o ecrã só pode voltar a adormecer quando todas as
retenções forem libertadas.

```tsx
import { keepAwake, app } from 'kuito';

function Player() {
  keepAwake(); // held while Player is mounted
  return <Video />;
}

// For the app's life, outside any component; call the result to let go.
const release = keepAwake({ scope: app });
release();
```

`keepAwake()` é um efeito de scope (ver [módulos nativos](native-modules.md#scope-effects)):
chamado enquanto um componente se configura, segura o ecrã desde a montagem até o
componente desmontar. Em qualquer outro lado precisa de `{ scope: app }`, e uma chamada
sem ele lança uma exceção. Em ambos os casos devolve a função que deixa o ecrã
adormecer mais cedo; chamá-la duas vezes é inofensivo.

O iOS desliga `UIApplication.isIdleTimerDisabled`; o Android adiciona
`FLAG_KEEP_SCREEN_ON` à janela da atividade, o que só se aplica enquanto a
aplicação está em primeiro plano. Um reload liberta todas as retenções.
