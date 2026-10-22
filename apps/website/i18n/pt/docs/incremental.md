# Atualização incremental ao nível do componente

O compilador de desenvolvimento do Kuito atribui IDs estáveis `modulePath#functionName` e
impressões digitais do código-fonte às funções de componente com nome. O runtime conserva uma
cache de descritores por instância, indexada pelo ID do módulo e pelo caminho lógico do componente.

A impressão digital de um componente cobre o seu próprio código e cada declaração de nível superior
do seu módulo que ele lê, diretamente ou através de outras declarações de nível superior: editar
uma constante ou um auxiliar volta a executar os componentes que a leem, e só esses. As leituras
são resolvidas por binding, pelo que um nome que o componente declara ele próprio não é uma leitura
da declaração do módulo com esse nome. Um componente que outro apenas renderiza como
JSX (`<Card />`) não é lido: a sua própria impressão digital cobre as suas edições.

Uma impressão digital faz o hash da árvore de sintaxe, não do texto: posições, comentários,
parênteses, estilos de aspas e indentação do JSX não contam. Uma edição que apenas
reformata ou comenta código não volta a executar nenhum componente e não envia nenhuma prop. As expressões
JSX são indexadas da mesma forma, tal como as funções da thread de UI
(`docs/motion.md`).

Na atualização do código-fonte, os componentes inalterados com identidade de props inalterada reutilizam a sua
árvore de descritores anterior, evitando reexecuções de código arbitrário nesses
componentes. Os componentes filhos aninhados são resolvidos através de um registo de definições
novo, pelo que editar um filho pode atualizá-lo mesmo quando o pai permanece em cache.

Uma instância de componente é o seu lugar na árvore, a sua definição de componente e
a sua `key`, os três no seu caminho: `<parent path>.<place>.c<definition>:<key>`.
Uma `key` conta onde quer que um elemento esteja, numa lista ou como filho único. Assim, um
lugar que renderiza outro componente, ou o mesmo com outra key, contém
uma nova instância com um caminho próprio, cujas vistas recebem novas etiquetas e remontam,
e a instância que saiu liberta o seu estado (`docs/control-flow.md`). Uma vista
com uma prop `id` é a exceção: a sua etiqueta é o id, pelo que permanece a mesma
vista nativa onde quer que renderize, desde que o seu tipo e o seu pai se mantenham.

Qualquer replaneamento, uma atualização ou uma alternância de `Show`, envia a uma vista nativa apenas as props
que mudaram: os escalares comparam-se com `Object.is`, e as props objeto (`style`,
`gestures`, gradientes) pelo JSON com que atravessaram a fronteira do host da última vez,
já que o planeador as reconstrói em cada percurso. Uma alternância de `Show` planeia apenas o seu
ramo (`docs/control-flow.md`).

Os slots de estado, a identidade das vistas nativas, as refs e os registos de `onMount` da vida da instância
são conservados enquanto o caminho de uma instância durar. Dentro de uma
instância, cada hook mantém o seu slot pelo nome, não pela ordem de chamada
(`docs/reactivity.md`): adicionar, reordenar ou chamar condicionalmente hooks mantém
o estado dos outros.
Os scopes de effect/watch e o trabalho assíncrono são descartados e substituídos quando o seu
componente dono executa de novo; os scopes de componentes inalterados permanecem intactos. Um hook que um
patch remove é descartado, e os componentes removidos libertam os scopes de estado, assíncronos
e de ciclo de vida de todos os seus hooks.

**Limitações restantes:** isto é memoização por componente durante o HMR, não
um bundler de código-fonte incremental: o Rolldown continua a regenerar um bundle JS. Um
componente com código-fonte alterado volta a executar a sua função, pelo que as expressões fora
de bindings em cache de granularidade fina podem ser reavaliadas. Um valor importado de outro ficheiro é coberto apenas
pela sua declaração `import`, pelo que um componente que lê uma constante editada noutro
ficheiro permanece em cache até que o seu próprio módulo mude. A comparação de props é
`Object.is` superficial; objetos mutáveis podem invalidar a correção. Componentes recém-compostos
sem identidades estáveis do compilador recorrem à reexecução.
Filhos condicionais sem keys estáveis podem mudar de identidade ao serem reordenados.
As mutações do host não são transacionalmente reversíveis, e os efeitos correm na
thread atual da VM/UI. Evite efeitos secundários no corpo das funções de componente.
