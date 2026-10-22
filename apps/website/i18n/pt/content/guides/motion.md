# Movimento

Tudo o que se move é uma pequena álgebra, escrita como dados: fontes (um valor de movimento, um gesto, um sinal, o tempo), transformações (`map`, `clamp`, `interpolate`; `timing`, `spring`, `decay`; `delay`, `sequence`, `parallel`, `stagger`, `repeat`, `keyframes`) e destinos (props). As declarações compilam para programas que a thread de UI executa ao lado das vistas, por isso mover nunca espera pelo JavaScript e nunca volta a renderizar um componente.

```tsx
import { Box, interpolate, motion, pan, spring } from 'kuito';

export function Card() {
  const drag = pan({ axis: 'x' }).release(spring());
  const x = motion(0).follows(drag.x);

  return (
    <Box
      translateX={x}
      opacity={interpolate(x, [0, 200], [1, 0.5])}
      rotate={x.map((v) => v / 20)}
      gestures={[drag]}
    />
  );
}
```

Um elemento arrastável completo que regressa a casa com uma mola, com a velocidade do dedo: sem handler, e nada atravessa para a thread de JavaScript enquanto se move.

## Valores de movimento

`motion(initial)` funciona como `signal()`: chame-o enquanto um componente se configura, leia e escreva `.value` em qualquer lado. Use `signal()` para valores a que os componentes reagem, e `motion()` para valores com que o ecrã se move.

- `x.follows(source)` move `x` com `source` na thread de UI: o campo de um gesto, outro valor de movimento, ou um derivado. `null` interrompe-o.
- `x.map(fn)`, `interpolate(x, input, output)` e `clamp(x, min, max)` criam valores derivados, calculados na thread de UI sempre que `x` se move.
- `x.value = animation` anima-o; `x.value = 5` move-o agora.

## Gestos

Os gestos são valores, reconhecidos nativamente, e anexados com uma só prop. `pan()` move `x`, `y` (a sua translação, somada); `touches()` move `x`, `y` (onde está o dedo); `pinch()` move `scale`, a multiplicar; `rotate()` move `rotation` em graus. Todos os gestos aceitam os callbacks que precisam de JavaScript: `onStart`, `onChange` e `onEnd(event, success)`.

`gesture.release(animation)` diz como os seus seguidores se soltam, com a velocidade do gesto: `drag.release(spring())` regressa a casa com uma mola, `drag.release(decay({ clamp: [0, 400] }))` desliza por inércia, `drag.release(spring().to([0, 400]))` encaixa no ponto mais próximo. Vários gestos numa vista disputam uma corrida; `race(a, b)`, `together(a, b)` e `orElse(a, b)` compõem-nos como valores, e aninham-se.

## Animações

Os builders descrevem como um valor se move; `.to(target)` diz para onde:

```tsx
<Box opacity={timing(200).to(0)} translateY={delay(80, spring().to(12))} />;

offset.value = sequence(timing(120).to(1.2), spring().to(1));
offset.value = repeat(keyframes({ 0: 1, 50: 1.1, 100: 1 }, 600));
```

`timing` corre 300 ms com `easing.inOut` por predefinição; `spring` tem por predefinição damping 10, stiffness 100, mass 1; `repeat` count Infinity.

Uma animação começa no frame seguinte, a partir de onde o valor estiver nesse momento. Atribuir um valor ou outra animação interrompe-a, e o seu `onEnd` corre com `false`. Números e cores hexadecimais animam; vários alvos são pontos de encaixe.

## Props animadas: `animate` e `transition`

```tsx
<Box
  animate={{ opacity: open.value ? 1 : 0.6, scale: open.value ? 1 : 0.96 }}
  transition={{ opacity: timing(200), transform: spring({ damping: 14 }) }}
/>
```

`animate` aceita valores para as props animáveis (`opacity`, `backgroundColor`, as translações, as escalas e `rotate`). Os seus primeiros valores aplicam-se de imediato; cada alteração seguinte move-se como `transition` diz. `transition` nomeia uma animação por grupo: `opacity`, `backgroundColor`, `transform` ou `all`. Sem uma, as transformações usam molas e o resto corre timings de 300 ms. Uma `transition` de CSS compila para a mesma prop.

## Entrar, sair e mover: `enter`, `exit`, `layout`

Um efeito nomeia as props de onde uma vista entra e para onde sai: `fade`, `slide.up(d)`, `slide.down(d)`, `slide.left(d)`, `slide.right(d)` (`d` é 24 por predefinição), `zoom(scale)` (0.85 por predefinição) e `keyframes`.

```tsx
<Box enter={fade.and(slide.up(12))} exit={fade} layout={spring()} />
```

`a.and(b)` e `parallel(a, b, ...)` reproduzem efeitos em simultâneo; `sequence` um a seguir ao outro; `stagger(ms, a, b, ...)` cada um `ms` depois do anterior. `enter` é reproduzido quando a vista é criada. Uma vista removida com `exit` sai de imediato da árvore do JavaScript mas fica no ecrã, sem receber toques, enquanto anima para fora. `layout={spring()}` (ou `timing(...)`) anima a vista até cada novo frame que o layout lhe dá.

Com a definição de movimento reduzido do utilizador ativa, todas as animações, transições e efeitos saltam para onde terminam. Os gestos continuam a seguir o dedo.

## Em profundidade

[Movimento](../../../../docs/motion.md) cobre todas as opções de gestos e animações, como o compilador e o kernel colocam código na thread de UI, os limites das plataformas e o contrato nativo.
