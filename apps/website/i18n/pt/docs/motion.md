# Movimento

Tudo o que se move é uma pequena álgebra, escrita como dados:

- **Fontes**: um valor de movimento, um gesto, um sinal, o tempo (uma animação).
- **Transformações**: `map`, `clamp`, `interpolate`; `timing`, `spring`, `decay`; `delay`, `sequence`, `parallel`, `stagger`, `repeat`, `keyframes`.
- **Destinos**: props.

As declarações compilam para programas que a thread de UI executa ao lado das vistas, por isso mover nunca espera pelo JavaScript e nunca volta a renderizar um componente. Um callback é a exceção, para o que precisa de JavaScript.

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

Isto é um elemento arrastável completo que regressa a casa com uma mola, com a velocidade do dedo: sem handler, e nada atravessa para a thread de JavaScript enquanto se move.

## Valores de movimento

`motion(initial)` funciona como `signal()`: chame-o enquanto um componente se configura, leia e escreva `.value` em qualquer lado. Use `signal()` para valores a que os componentes reagem, e `motion()` para valores com que o ecrã se move. Um valor de movimento desaparece quando o seu componente é desmontado.

- `x.follows(source)` move `x` com `source` na thread de UI: o campo de um gesto (`drag.x`), outro valor de movimento, ou um derivado. `null` interrompe-o.
- `x.map(fn)`, `interpolate(x, input, output)` e `clamp(x, min, max)` criam valores derivados: calculados na thread de UI sempre que `x` se move, e dados a uma prop ou seguidos como um valor de movimento. `interpolate` mapeia troço a troço entre números ou cores hexadecimais, mantendo os seus valores extremos salvo com `{ extrapolate: 'extend' }`. `map` recebe uma função que o compilador compilou para a thread de UI (ver [Nunca escolhe uma thread](placement.md)).
- `x.value = animation` anima-o; `x.value = 5` move-o agora.

## Gestos

Os gestos são valores, reconhecidos nativamente por ports dos reconhecedores do [React Native Gesture Handler](https://github.com/software-mansion/react-native-gesture-handler) (RNGH), e anexados com uma só prop:

| Gesto         | Opções                                                           | Move (siga estes)                   |
| ------------- | ---------------------------------------------------------------- | ----------------------------------- |
| `pan()`       | `axis`, `minDistance`                                            | `x`, `y`: a sua translação, somada  |
| `touches()`   |                                                                  | `x`, `y`: onde está o dedo na vista |
| `pinch()`     |                                                                  | `scale`, a multiplicar              |
| `rotate()`    |                                                                  | `rotation` em graus, somada         |
| `tap()`       | `count`, `maxDuration`, `maxDistance`                            |                                     |
| `longPress()` | `after` (500 ms), `maxDistance`                                  |                                     |
| `fling()`     | `direction`: `'left'`, … ou uma lista (direita por predefinição) |                                     |

Todos os gestos aceitam também `disabled` e `hitArea`, os nomes das props de vista (enviados como `enabled` e `hitSlop` do RNGH, ver [o contrato nativo](#native-contract)), movem `active` (1 enquanto está ativo), e aceitam os callbacks que precisam de JavaScript: `onStart` (ativou-se), `onChange` (moveu-se, com `changeX`/`changeY`, `scaleChange` ou `rotationChange`) e `onEnd(event, success)`. Cada um corre onde o compilador o consegue colocar. `axis` faz um pan começar após 10 pontos ao longo dele e falhar após 10 na transversal. Uma opção inválida é um erro.

- **Seguir**: um valor de movimento que segue um campo parte de onde está quando o gesto se ativa; `pan` e `rotate` somam a sua translação ou rotação, `pinch` multiplica pela sua escala, `touches` define a posição.
- **Libertação**: `gesture.release(animation)` diz como os seus seguidores se soltam. Cada um corre a animação com a velocidade do gesto, em direção à sua própria casa (o seu primeiro valor) salvo se a animação tiver um alvo: `drag.release(spring())` regressa a casa com uma mola, `drag.release(decay({ clamp: [0, 400] }))` desliza por inércia, `drag.release(spring().to([0, 400]))` encaixa no ponto mais próximo de onde o lançamento aterraria.
- **Composição**: vários gestos numa vista disputam uma corrida (o primeiro a ativar-se ganha). `race(a, b)`, `together(a, b)` (ambos ao mesmo tempo: pinch e rotate) e `orElse(a, b)` (b espera que a falhe: um duplo toque, ou senão um toque) compõem-nos como valores, e aninham-se. (Não `then`: um módulo que exporta `then` é um thenable, que `import()` chama.) Entre vistas, o gesto da vista mais interior recebe o toque primeiro, como no RNGH.

```tsx
const zoom = pinch().release(spring());
const turn = rotate().release(spring());
const scale = motion(1).follows(zoom.scale);
const angle = motion(0).follows(turn.rotation);

<Image scale={clamp(scale, 1, 3)} rotate={angle} gestures={[together(zoom, turn)]} />;

<Box
  gestures={[
    race(
      orElse(tap({ count: 2, onEnd: like }), tap({ onEnd: open })),
      longPress({ onStart: showMenu }),
    ),
  ]}
/>;
```

O puxar para atualizar é da própria scroll view: `<Scroll refreshing={loading}
onRefresh={reload}>`, cujo puxão a plataforma executa; `reload` é o trabalho de dados que precisa de JavaScript.

## Animações

Os builders descrevem como um valor se move; `.to(target)` diz para onde, para uma prop ou um valor de movimento a que a animação é dada diretamente:

```tsx
<Box opacity={timing(200).to(0)} translateY={delay(80, spring().to(12))} />;

offset.value = sequence(timing(120).to(1.2), spring().to(1));
offset.value = repeat(keyframes({ 0: 1, 50: 1.1, 100: 1 }, 600));
```

| Builder                                                                 | Valores por predefinição               |
| ----------------------------------------------------------------------- | -------------------------------------- |
| `timing(duration)`, `timing({ duration, easing, delay, onEnd })`        | 300 ms, `easing.inOut`                 |
| `spring({ damping, stiffness, mass, velocity, delay, onEnd })`          | damping 10, stiffness 100, mass 1      |
| `spring({ duration, dampingRatio, clamp, ... })`                        | 1333 ms, damping ratio 0.5             |
| `decay({ velocity, deceleration, clamp, rubberBand, onEnd })`           | velocity 0, deceleration 0.998         |
| `keyframes({ 0: a, 50: b, 100: c }, duration or timing config)`         | um timing por cada paragem             |
| `delay(ms, animation)`                                                  | adiciona um atraso a qualquer animação |
| `sequence(a, b, ...)`, `repeat(animation, { count, reverse, onEnd })`   | count Infinity                         |
| `easing.linear`, `ease`, `in`, `out`, `inOut`, `bezier(x1, y1, x2, y2)` | curvas cubic-bezier, como em CSS       |

Uma animação começa no frame seguinte, a partir de onde o valor estiver nesse momento. Atribuir um valor ou outra animação interrompe-a, e o seu `onEnd` corre com `false`. Uma mola mantém a velocidade do que interrompe, quando esta a leva em direção ao seu alvo, e mantém uma velocidade que lhe é dada (a de uma libertação) em qualquer caso. Números e cores hexadecimais (`#rrggbb`, `#rrggbbaa`) animam; uma cor corre qualquer animação canal a canal. Vários alvos são pontos de encaixe. `onEnd` precisa de um valor de movimento que a app detenha: uma prop a que se dê um é um erro, tal como um timing ou spring sem alvo. Até a thread de UI iniciar uma animação, uma leitura da thread de JS devolve onde o valor está, não para onde vai.

A matemática (timing ao longo de um bezier cúbico, molas por física ou por duração, decay rígido e elástico, sequence, repeat e delay) é um port da do Reanimated, com os seus nomes de configuração e valores por predefinição (os do Reanimated 3 para as molas): um delay deixa a animação que interrompe continuar a correr até começar.

## Props animadas: `animate` e `transition`

Uma vista diz o que muda e como se move:

```tsx
<Box
  animate={{ opacity: open.value ? 1 : 0.6, scale: open.value ? 1 : 0.96 }}
  transition={{ opacity: timing(200), transform: spring({ damping: 14 }) }}
/>
```

`animate` aceita valores para as props animáveis (`opacity`, `backgroundColor`, `translateX`, `translateY`, `scale`, `scaleX`, `scaleY`, `rotate`). Os seus primeiros valores aplicam-se de imediato; cada alteração seguinte move-se como `transition` diz. Uma prop definida ao mesmo tempo diretamente e em `animate` é um erro, tal como uma animação em `animate`.

`transition` nomeia uma animação por grupo: `opacity`, `backgroundColor`, `transform` (as translações, escalas e rotação) ou `all`. Aplica-se a `animate`, a `enter` e `exit`, e às alterações simples das props que nomeia. Sem uma, `animate`, `enter` e `exit` usam molas nas transformações e timings de 300 ms no resto; uma alteração simples de prop aplica-se de imediato. Uma `transition` de CSS num módulo `.css` ou em `styles()` compila para a mesma prop ([Estilos nativos](styles.md#transitions)):

```css
.card {
  transition:
    transform 400ms spring(14, 180),
    opacity 250ms ease-out;
}
```

Uma prop a que se dê uma animação, ou alterada sob uma transição, liga-se a um valor de movimento próprio, de modo que cada animação continua de onde a anterior estava.

## Entrar, sair e mover: `enter`, `exit`, `layout`

Um efeito nomeia as props de onde uma vista entra e para onde sai:

| Efeito                                                            | Entra de, sai para                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `fade`                                                            | transparente                                                       |
| `slide.up(d)`, `slide.down(d)`, `slide.left(d)`, `slide.right(d)` | a `d` (24 por predefinição) de distância, movendo-se nessa direção |
| `zoom(scale)`                                                     | `scale`, 0.85 por predefinição                                     |
| `keyframes({ 0: { ... }, 100: { ... } }, duration)`               | as suas próprias paragens, as mesmas nos dois sentidos             |

```tsx
<Box enter={fade.and(slide.up(12))} exit={fade} layout={spring()} />
```

`a.and(b)` e `parallel(a, b, ...)` reproduzem efeitos em simultâneo; `sequence` um a seguir ao outro, cada um começando quando a prop mais lenta do anterior termina; `stagger(ms, a, b, ...)` cada um `ms` depois do anterior; `delay(ms, effect)` mais tarde. Cada prop move-se como `transition` diz e termina no valor próprio da vista.

`enter` é reproduzido quando a vista é criada. Quando uma vista com `exit` é removida, sai de imediato da árvore do JavaScript, mas o renderizador mantém-na no ecrã, sem receber toques, enquanto a thread de UI a anima para fora a partir de onde estiver.

`layout={spring()}` (ou `timing(...)`) anima a vista até cada novo frame que o layout lhe dá, no animador da própria plataforma. O seu primeiro frame aplica-se de imediato.

Duas coisas ficam nos animadores da plataforma em vez do caminho de movimento da thread de UI, ambas na thread principal sem nenhum JavaScript. `layout` move uma vista para um frame que o passe de layout calcula ao aplicar-se, depois de o frame da thread de UI ter corrido; a thread de UI conduz props, não frames, por isso o renderizador interpola ele próprio o frame (um property animator do UIKit; um `ValueAnimator` ou `SpringAnimation` no Android). O feedback `pressedOpacity` e `pressedScale` de um Pressable segue o próprio rastreio de toque da vista nativa, um ease in rápido e um ease out suave, fixos; enviá-lo através do kernel de UI acrescentaria um salto a cada toque sem qualquer diferença no que o utilizador vê.

Uma vista com um `sharedId` voa até à vista com o mesmo `sharedId` no ecrã para o qual uma pilha faz push ou pop, a par da própria transição da pilha ([Elementos partilhados](navigation.md#shared-elements)).

## Movimento reduzido

Com a definição de movimento reduzido do utilizador ativa, todas as animações, transições e efeitos saltam para onde terminam, e `layout` aplica os frames de imediato (a definição de reduzir movimento do sistema no iOS, a escala de duração do animador no Android). Os gestos continuam a seguir o dedo: isso é manipulação direta, não animação. O kernel comunica a definição à thread de UI quando esta arranca e a cada alteração.

## Nunca escolhe uma thread

Não há diretiva `'worklet'`, `runOnUI` nem `runOnJS`. O compilador e o kernel decidem:

- **O compilador** (`src/dev/threads`) compila uma segunda vez, para um bundle de UI, todas as funções, expressões de prop JSX, handlers de eventos, callbacks `on*` e funções `map` de valores de movimento que consegue provar seguras para a thread de UI. "Segura" significa que as suas variáveis livres são apenas lidas, escritas através de `.value`, ou chamadas. As variáveis são capturadas por caminho de membro, por isso `props.dim` atravessa sem o resto de `props`, e `.value` mantém-se vivo.
- **O kernel** (`src/runtime/threads.ts`) coloca cada prop e handler ao fazer commit:
  - Uma prop cuja expressão lê um valor de movimento, ou que é um valor de movimento ou um derivado, é ligada na thread de UI. Atualiza-se no mesmo frame que o valor que lê. Um sinal que também leia reenvia-a a partir da thread de JS quando o sinal muda.
  - Os gestos, os seus seguidores e as suas libertações correm na thread de UI como dados; um callback de gesto corre aí quando o compilador o conseguiu colocar.
  - Um handler de evento que captura um valor de movimento corre na thread de UI, diretamente a partir do evento nativo, e as props que move atualizam-se antes do frame. Um handler de scroll aí recebe o evento de scroll de todos os frames salvo se a app definir o seu próprio `scrollInterval`.
  - Tudo o resto corre na thread de JS.

Dentro de código da thread de UI, as chamadas a funções da thread de JS cujo resultado não é usado, como logging ou analytics, são enviadas para a thread de JS e correm aí. As escritas num sinal voltam pelo mesmo caminho e voltam a renderizar como de costume. As leituras de um sinal veem o seu valor do momento em que o código foi enviado. Cada uma destas é uma mensagem `__kuito.ui`, contada em `__kuito.stats().total.uiMessages`.

O que atravessa vive enquanto viver o código que o enviou. Uma função da thread de JS ou um sinal que a thread de UI consiga alcançar é retido pelo plano confirmado de cada módulo que o codificou, e libertado quando nenhum o faz; uma chamada ou escrita que chegue para um que um patch posterior libertou é descartada. Cada bundle de UI que um Live Patch carrega substitui as funções do bundle anterior. O id de uma função de UI vem do seu ficheiro e do que faz, não de onde está: um patch que move, reformata ou comenta uma função, ou edita outra, mantém o seu id, e o que a thread de UI ligou a ela continua ligado.

## Quando tem de ficar na thread de JS

Uma prop que lê um valor de movimento mas não pode correr na thread de UI continua a funcionar. Corre na thread de JS, um frame atrasada, e Kuito regista um aviso uma vez com a razão e a localização:

```
Box width reads a motion value but runs on the JS thread, a frame late: it constructs Thing (app.tsx:4:7)
```

A thread de UI não pode correr código que:

- use `this`, `arguments`, `await` ou `yield`;
- crie JSX ou uma instância de classe (os built-ins como `Date` e `Map` são aceitáveis);
- atribua uma variável ou um objeto da thread de JS (`.value` é aceitável);
- use o resultado de uma função da thread de JS, o que o compilador sabe para qualquer função importada de um pacote (`clamp(x)` de `lodash-es`); chamar uma pelo seu efeito é aceitável;
- leia `typeof` de um nome que nada no módulo declara (`typeof document`);
- capture um valor que não pode atravessar threads, como uma instância de classe.

Um `map` cuja função o compilador não conseguiu colocar faz a prop ficar na thread de JS da mesma forma. As capturas mantêm `?.`: `theme.colors?.dim` lê `undefined` quando `colors` está ausente, como a função faria.

## Como as threads se mantêm em sincronia

- Os valores de movimento pertencem à thread de UI. Uma leitura da thread de JS nunca espera. Devolve a cópia que o runtime de UI escreve após cada alteração, salvo se a thread de JS tiver escrito um valor mais recente desde então; essa escrita é numerada, e a cópia mostra quando a thread de UI a aplicou. A cópia de um número é um número (`native/shared/MotionMirror.h`); as cópias dos outros valores são JSON.
- As operações para a thread de UI ficam em fila durante uma tarefa de JS e viajam dentro do lote de mutações nativo, depois das mutações de vistas a que se referem. As chamadas de volta para a thread de JS viajam como eventos `__kuito.ui` (`docs/events.md`).
- Os valores atravessam como JSON com algumas etiquetas (`src/runtime/thread-wire.ts`).
- O runtime de UI arranca com a primeira mensagem. Uma app que nunca move nada não paga nada, e um host sem runtime de UI corre tudo na thread de JS: os gestos e os seus seguidores também, enquanto uma animação atribuída salta para onde termina (um decay fica onde está) e chama `onEnd` com `true`, e os efeitos não fazem nada.

## Plataformas

No iOS e no Android, o runtime de UI é um segundo runtime Hermes na thread principal (`native/shared/UIRuntime.cpp`), ao lado do renderizador. Aplica as props que calcula antes de regressar, para que aterrem no frame em construção. As animações avançam em frames de ecrã, os mesmos que aplicam os lotes da thread de JS (docs/native-scheduling.md), que o runtime de UI só pede enquanto algo anima ou há lotes à espera.

Os gestos funcionam dentro de uma `Sheet` em ambas as plataformas: no Android o conteúdo da sheet é uma raiz de toques própria, uma vez que vive na sua própria janela.

Limites:

- Android: um `Scroll` vertical não cancela um gesto num antepassado quando começa a fazer scroll (o seu wrapper de refresh engole o pedido).
- Um toque num antepassado de um `Pressable` ganha à pressão, como no RNGH; o `onLongPress` de `Pressable` é o seu próprio evento de pressão.

## Contrato nativo

Os valores estruturados atravessam a fronteira nativa como strings JSON. Uma prop animada chega ao renderizador como os valores que a thread de UI define em cada frame; o kernel guarda os valores de `transition`, `animate`, `enter` e dos `gestures` da app e nunca os envia tal como foram dados.

- `exit`: `true` enquanto a vista tem um efeito de saída. Uma vista removida com ele fica na sua supervista, retida pelo renderizador, que aplica as props que a thread de UI define nela até a thread de UI definir `exited`; depois desaparece.
- `layout`: `{ type: 'timing', duration, easing: [x1, y1, x2, y2], delay }` ou `{ type: 'spring', damping, stiffness, mass, delay }`, a animação com que as alterações de frame correm (um property animator do UIKit; um `ValueAnimator` ou `SpringAnimation` nos bounds da vista no Android).
- `gestures`: uma entrada por reconhecedor anexado à vista (um gesto composto contribui com todos os seus gestos), detida por `properties/KuitoGestureProperties` em ambos os renderizadores, que guardam os reconhecedores portados do RNGH em `gestures/`:

```json
[
  {
    "tag": 7,
    "type": "pan",
    "config": { "activeOffsetXStart": -10, "activeOffsetXEnd": 10, "minDist": 4 },
    "waitFor": [],
    "simultaneousHandlers": [8],
    "blocksHandlers": []
  }
]
```

- `type`: `pan`, `tap`, `longPress`, `pinch`, `rotation` ou `fling`.
- `config`: as chaves de configuração nativa do RNGH, apenas as definidas: `enabled`, `shouldCancelWhenOutside`, `hitSlop` (`{ left, top, right, bottom, width,
  height, horizontal, vertical }`), `activeOffsetXStart/End`, `activeOffsetYStart/End`, `failOffsetXStart/End`, `failOffsetYStart/End`, `minDist`, `minPointers`, `maxPointers`, `minVelocity`, `minVelocityX/Y`, `avgTouches`, `activateAfterLongPress` do pan; `numberOfTaps`, `maxDurationMs`, `maxDelayMs`, `maxDist`, `maxDeltaX/Y`, `minPointers` do tap; `minDurationMs`, `maxDist`, `numberOfPointers` da pressão longa; `direction` (uma máscara de bits: RIGHT 1, LEFT 2, UP 4, DOWN 8) e `numberOfPointers` do fling.
- As relações nomeiam outros gestos pela `tag`, que é única na app.
- Um novo valor substitui os gestos da vista: os reconhecedores cuja tag desapareceu são removidos, os outros são reconfigurados. `null` remove-os todos.

A vista emite eventos `gesture` (o seu número, `gesture`, um payload JSON) com `handlerTag`, `state`, `numberOfPointers`, `pointerType` (0 toque) e os campos do gesto: `x`, `y`, `absoluteX/Y`; `translationX/Y` e `velocityX/Y` do pan; `scale`, `focalX/Y` e `velocity` do pinch; `rotation` (radianos na ligação, graus para a app), `anchorX/Y` e `velocity` da rotação; `duration` da pressão longa; mais `oldState` numa mudança de estado. Uma mudança de estado e uma atualização são eventos separados: uma atualização não tem `oldState`. Os estados são os do RNGH: UNDETERMINED 0, FAILED 1, BEGAN 2, CANCELLED 3, ACTIVE 4, END 5. As distâncias são em pontos (iOS) ou em píxeis independentes da densidade (Android).

O kernel transforma os valores de gesto neste contrato (`src/runtime/gestures.ts`, compondo com as regras do RNGH em `src/runtime/gesture-specs.ts`), e o dispatcher que ambas as threads partilham (`src/runtime/gesture-events.ts`) transforma eventos em callbacks e movimentos de seguidores, o mapeamento do `useAnimatedGesture` do RNGH.

## Créditos

- O modelo de props calculadas na thread de UI a partir de valores partilhados, a matemática das animações e `interpolate` vêm do [Reanimated](https://github.com/software-mansion/react-native-reanimated) (MIT, Software Mansion). Kuito rastreia dependências por execução, como os seus sinais fazem, em vez de através de tudo o que uma função capturou.
- Os reconhecedores nativos são ports dos do React Native Gesture Handler, e as regras de composição e o mapeamento de eventos seguem a sua API `Gesture`: MIT License, Copyright (c) 2016 Software Mansion.
- Compilar funções de thread num segundo bundle, com capturas avaliadas de forma preguiçosa, segue o compilador do [Octane](https://github.com/octanejs/octane) (MIT, Dominic Gannaway).
