# Ciclo de vida dos componentes e eventos nativos lógicos

## APIs experimentais atuais

- `onMount(callback)` corre após um commit bem-sucedido de vistas no host; uma função devolvida é limpa no descarte da instância; uma atualização compatível conserva a mesma instância montada.
- `onCleanup(callback)` regista uma limpeza sem correr na montagem.
- `watch(source, observer, {immediate?})` observa o valor do sinal selecionado, saltando a notificação inicial por predefinição. As dependências são rastreadas de novo à medida que a fonte muda. Um watch compara valores durante a vida da sua instância: quando a instância volta a executar (novas props, um ramo replaneado), um valor selecionado que difere do último que viu notifica o observador.
- `effect(callback)` rastreia leituras síncronas de sinais e corre após a montagem; a limpeza devolvida corre antes da reexecução e durante o desmantelamento.
- `ref()` devolve um handle de vista estável para IDs de vistas nativas; os handles fornecem pai/filhos lógicos, `setProperty`, os comandos de host `focus`/`blur`, e listeners à maneira do EventTarget.
- O toque nativo é entregue pelas fases de captura, alvo e bubbling; `dispatchEvent` aceita objetos personalizados com a forma de evento. O dispatch do host nativo é ainda uma prova de conceito, não uma implementação conforme à W3C.

## Limitações

- O Fast Refresh recria atualmente a árvore de descritores dos componentes. Os scopes de ciclo de vida dos componentes inalterados são conservados numa atualização compatível; os efeitos alterados são substituídos, e os handles estáveis sobrevivem enquanto as identidades das vistas forem conservadas.
- `focus` e `blur` exigem uma implementação real de comando nativo da plataforma e lançam um erro descritivo se estiver ausente.
- `setProperty` escreve de forma imperativa; commits de sinais posteriores podem sobrescrever este valor.
- O cancelamento de eventos aplica-se ao grafo lógico de eventos do Kuito; não interrompe automaticamente uma ação do UIKit/SO Android já emitida.
- Os callbacks de limpeza não são atualmente transacionais: uma exceção durante uma limpeza após o commit no host não pode reverter as mutações das vistas nativas.
- A tipagem dos argumentos de eventos e os listeners passivos, a semântica de acessibilidade, os portais compostos e o descarte de scopes de ciclo de vida aninhados estão incompletos.
