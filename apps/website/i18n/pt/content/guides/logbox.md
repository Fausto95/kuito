# LogBox

As builds de desenvolvimento mostram o que a sua aplicação regista e lança, no dispositivo e no terminal, mapeado de volta para o seu TSX.

## console

`console.log`, `info`, `debug`, `warn` e `error` funcionam no Hermes do dispositivo. Os valores imprimem-se numa só linha tal como o Node os imprime (`{ a: 1, b: [1, 'two'] }`, `[Circular]`, `[Function name]`), e cada entrada aparece também na consola do Xcode e no logcat (tag `Kuito`), e no terminal do `kuito dev`, na linha que a registou:

```text
12:39:27  › hello { taps: 0 }                     src/App.tsx:14
12:39:28  ▲ Image cache is 90% full               src/Feed.tsx:31
12:39:47  ✖ TypeError: Cannot read property 'name' of undefined  src/Profile.tsx:5
```

## O que o LogBox apanha

| Origem                                                                         | Mostrado como   |
| ------------------------------------------------------------------------------ | --------------- |
| `console.warn`                                                                 | aviso           |
| `console.error`                                                                | erro            |
| Uma exceção lançada num handler de evento, temporizador ou callback de `fetch` | erro            |
| Uma rejeição de promise não tratada                                            | erro            |
| Um Live Patch, ou a sua aplicação no arranque, que lança uma exceção           | falhou a correr |

Os avisos e os erros acumulam-se numa barra por cima do indicador de início: a entrada mais recente, quantos erros e avisos estão à espera, e um ✕ para os limpar. Toque nela para inspecionar. O código que falhou a correr abre o inspetor por si só, a versão anterior da aplicação permanece ativa por trás dele, e o inspetor fecha-se sozinho quando um Live Patch corrige o código.

## O inspetor

- A mensagem, e para uma repetição da mesma entrada quantas vezes aconteceu (x3) em vez de três cópias.
- O code frame: a linha do seu código-fonte que falhou, realçada, com a localização como um link que abre o seu editor nesse sítio.
- A call stack, mapeada através dos source maps do Live Patch. Os seus frames vêm primeiro; os frames do Kuito e das bibliotecas dobram-se atrás de "Show N Kuito and library frames". Toque em qualquer frame para o abrir no seu editor.
- Dismiss / Copy / Reload. Copy coloca a mensagem, a localização, o code frame e a stack na área de transferência como texto, prontos para um issue ou um chat. Reload reinicia a aplicação num runtime novo e limpa o LogBox.
- As setas percorrem as entradas.

## Abrir frames no seu editor

O servidor de desenvolvimento lança o editor, por isso funciona a partir de um simulador, de um emulador ou de um dispositivo. Defina `KUITO_EDITOR` para o escolher (`code`, `cursor`, `zed`, `subl`, `webstorm`, `idea`, `studio`, com flags se quiser: `KUITO_EDITOR="code --reuse-window"`); caso contrário um `VISUAL` ou `EDITOR` gráfico, depois o VS Code. Só abrem ficheiros dentro do projeto.

## Em profundidade

[LogBox](../../../../docs/logbox.md) cobre como o kernel, a shell e o servidor de desenvolvimento produzem cada entrada e mapeiam a sua stack.
