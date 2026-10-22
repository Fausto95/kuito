# LogBox

As builds de desenvolvimento mostram o que a sua app regista e lança, no
dispositivo e no terminal, mapeado de volta para o seu TSX.

## console

`console.log`, `info`, `debug`, `warn` e `error` funcionam no Hermes do
dispositivo. Os valores imprimem-se numa só linha tal como o Node os imprime
(`{ a: 1, b: [1, 'two'] }`, `[Circular]`, `[Function name]`), e cada entrada
aparece também:

- no terminal do `kuito dev`, na linha que a registou:

  ```
  12:39:27  › hello { taps: 0 }                     src/App.tsx:14
  12:39:28  ▲ Image cache is 90% full               src/Feed.tsx:31
  12:39:47  ✖ TypeError: Cannot read property 'name' of undefined  src/Profile.tsx:5
  ```

- na consola do Xcode e no logcat (tag `Kuito`).

## O que o LogBox apanha

| Origem                                                                         | Mostrado como   |
| ------------------------------------------------------------------------------ | --------------- |
| `console.warn`                                                                 | aviso           |
| `console.error`                                                                | erro            |
| Uma exceção lançada num handler de evento, temporizador ou callback de `fetch` | erro            |
| Uma rejeição de promise não tratada                                            | erro            |
| Um Live Patch, ou a sua app no arranque, que lança uma exceção                 | falhou a correr |

Os avisos e os erros acumulam-se numa barra por cima do indicador de início: a
entrada mais recente, quantos erros e avisos estão à espera, e um ✕ para os
limpar. Toque nela para inspecionar. O código que **falhou a correr** abre o
inspetor por si só — a versão anterior da app permanece ativa por trás dele —
e o inspetor fecha-se sozinho quando um Live Patch corrige o código.

## O inspetor

- **A mensagem**, e, para uma repetição da mesma entrada, quantas vezes
  aconteceu (×3) em vez de três cópias.
- **O excerto de código**: a linha do seu código-fonte que falhou, realçada,
  com a localização como ligação que abre o seu editor nesse ponto.
- **A pilha de chamadas**, mapeada através dos source maps do Live Patch. Os
  seus frames vêm primeiro; os frames do Kuito e das bibliotecas ficam
  recolhidos atrás de "Show N Kuito and library frames". Toque em qualquer
  frame para o abrir no seu editor.
- **Dismiss / Copy / Reload.** Copy coloca a mensagem, a localização, o excerto
  de código e a pilha na área de transferência como texto, prontos para um
  issue ou uma conversa. Reload reinicia a app num runtime novo e limpa o
  LogBox.
- **‹ ›** percorre as entradas.

## Abrir frames no seu editor

O servidor de desenvolvimento lança o editor, pelo que funciona a partir de um
simulador, de um emulador ou de um dispositivo. Defina `KUITO_EDITOR` para o
escolher (`code`, `cursor`, `zed`, `subl`, `webstorm`, `idea`, `studio`, …,
com flags se quiser: `KUITO_EDITOR="code --reuse-window"`); caso contrário,
um `VISUAL` ou `EDITOR` gráfico, e depois o VS Code. Só abrem ficheiros dentro
do projeto.

## Como funciona

O kernel instala `console` quando o host nativo fornece `__kuitoHostLog`;
cada entrada transporta uma pilha (a própria de um argumento `Error`, ou a do
ponto de chamada). Os erros lançados por callbacks que o host nativo inicia
(eventos, temporizadores, fetch) passam pelo mesmo registo, tal como as
rejeições não tratadas do Hermes. A shell mostra os avisos e os erros e envia
cada entrada ao servidor de desenvolvimento, que mapeia a pilha através do
source map do bundle que a executou (`kuito://patch/N`) e responde com os
frames e um excerto de código.
