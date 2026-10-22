# Devtools

As builds de desenvolvimento das shells do Kuito incluem devtools. Elas não se metem no caminho da sua aplicação: não há nenhum botão flutuante.

## Abri-las

| Onde                  | Como                                            |
| --------------------- | ----------------------------------------------- |
| Simulador iOS         | Cmd+D                                           |
| Emulador Android      | Cmd+M / Ctrl+M, ou a tecla de menu              |
| Um dispositivo físico | Abane-o                                         |
| A CLI `kuito dev`     | Prima `m` (funciona para todos os dispositivos) |

Abrem como uma folha nativa com o estado da ligação, Recarregar e Religar, as últimas atualizações Live Patch, o último erro, o URL do servidor de desenvolvimento e dois monitores. O monitor de desempenho mostra os FPS da thread de UI, o tempo da última frame, as frames perdidas e os commits do Kuito. Realçar atualizações faz piscar cada vista que o renderizador atualiza, de verde a vermelho à medida que a mesma vista continua a atualizar-se dentro de um segundo, com a escrita de sinal que o causou por baixo de cada piscar.

## Depurar com o Chrome DevTools

Ambos os runtimes Hermes da aplicação são depuráveis pelo Chrome DevTools Protocol: a thread JS corre a sua aplicação e o kernel do Kuito; a thread de UI corre os motion values, os gestos e os callbacks da thread de UI. Prima `j` no `kuito dev` para abrir o DevTools na thread JS do dispositivo que se ligou por último, ou `u` para a sua thread de UI. Obtém o frontend do próprio Chrome: Sources (o seu TypeScript, através de source maps; o Live Patch continua a funcionar enquanto está ligado), Console, Performance (um perfil de CPU) e Memory (um heap snapshot).

Qualquer outro cliente CDP também funciona: o `kuito dev` lista os alvos em `http://127.0.0.1:8765/json/list`, por isso o `chrome://inspect` encontra-os assim que `127.0.0.1:8765` é adicionado em Discover network targets.

## Painel Components

Prima `k` no `kuito dev` para o painel Components: o modelo que o próprio Kuito tem da aplicação, do sinal ao binding e à vista.

- Tree: cada instância de componente montada, com o nome que lhe deu. Passar o rato por cima de uma contorna as vistas que ela renderizou.
- Component: as suas props, os seus hooks por nome (`const visits = signal(1)` aparece como `visits`), os seus owners e as vistas nativas que renderizou.
- View: cada prop com o binding por trás dela, os sinais que a sua última execução leu. Select on device, depois toque na vista.
- Signal: cada prop cujo binding o lê, e cada ramo que ele decide.
- Edição: os valores são JSON; Enter define um. Um sinal recebe a edição como se o seu código tivesse escrito `.value`.
- History: as últimas 500 escritas dos sinais que os componentes possuem. Step back aqui reinicia a aplicação e reproduz as escritas até essa.

O grafo é lido quando o painel o pede, por isso não custa nada à aplicação enquanto ninguém olha.

## Gravação e replay

As builds de desenvolvimento gravam cada lote que o runtime da aplicação faz commit. Prima `s` no `kuito dev` para guardar a gravação de cada dispositivo ligado em `.kuito/recordings/<time>-<device>.krec`, com a árvore de vistas nativa que construiu ao lado, como `<file>.tree`.

```sh
kuito replay .kuito/recordings/20261019-014618-p17-iphone-18-pro.krec ios
```

`kuito replay` lança a shell sem aplicação nem runtime Hermes: o servidor de desenvolvimento envia-lhe a gravação, e ela aplica os lotes ao ritmo a que foram gravados. A CLI guarda depois a árvore de vistas como `<file>.replayed` e reporta se corresponde ao `.tree` gravado. Um replay não reproduz código da thread de UI nem estado nativo como os offsets de scroll, e corre apenas numa shell construída a partir do mesmo Kuito, na plataforma que gravou.

## Limites

- Os pontos de paragem num ficheiro que edita são descartados quando o seu Live Patch chega.
- O código da thread de UI ainda não tem source map.
- O runtime headless que corre as tarefas em segundo plano não é depurável.
- Só uma janela do DevTools depura um runtime de cada vez.
- As builds de release não incluem nada disto.

## Em profundidade

[Devtools](../../../../docs/devtools.md) cobre o ecrã de arranque e a pílula de estado, as mensagens da ligação de desenvolvimento, o browser em que o DevTools abre, o que cada thread faz enquanto está em pausa, o formato `.krec` e o seu limite de tamanho, como o proxy do inspetor retransmite o CDP, e o que o painel Components ainda não suporta.
