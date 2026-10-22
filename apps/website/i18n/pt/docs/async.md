# Runtime assíncrono do Kuito — experimental

O Kuito tem ações e recursos assíncronos **com âmbito de componente**. Estão
implementados no kernel Hermes em JavaScript puro e testados na VM isolada do
Node. Os temporizadores, o `fetch` e o resto da biblioteca padrão sobre a qual
assentam estão listados em [web-apis.md](web-apis.md), com o que cada um não
faz.

`async`/`await` funciona no código da app em ambas as plataformas. Os bundles
da app têm como alvo ES2022, que o Hermes V1 compila tal como está escrito,
pelo que as funções assíncronas permanecem nativas. O Hermes V1 rejeita
geradores assíncronos (`async function*`, e `for await` sobre um); o compilador
de bytecode reporta-os em tempo de compilação, e um Live Patch que use um
falha ao avaliar no dispositivo.

## API pública

```tsx
import { task, resource, VStack, Text, Button } from 'kuito';

function Example() {
  const query = resource(async ({ signal }) => {
    const response = await fetch('https://example.com/api', { signal });
    return response.json();
  });

  const save = task(
    async ({ signal }) => {
      await saveChanges({ signal });
    },
    { policy: 'drop' },
  );

  return (
    <VStack>
      <Text>{query.running.value ? 'Loading...' : String(query.data.value ?? '')}</Text>
      <Button
        onPress={() => {
          void save.run().catch(() => {});
        }}
      >
        Save
      </Button>
    </VStack>
  );
}
```

## Execução e ciclo de vida

- `task()` só arranca quando o seu método `run(...args)` é chamado, e
  normalmente devolve uma Promise que rejeita em caso de falha. Quem chama
  trata as rejeições.
- `resource()` arranca após um commit de patch bem-sucedido e expõe
  `refresh()`. As falhas de um recurso preenchem `error.value` em vez de
  provocarem uma rejeição não tratada a partir do carregamento automático.
- Ambos expõem sinais persistentes `running`, `data` e `error`, e `cancel()`.
  Políticas de task: `replace` (cancela a anterior, o último resultado ganha) e
  `drop` (reutiliza a Promise em curso).
- Num Fast Refresh compatível, os registos assíncronos antigos são
  invalidados/abortados, enquanto os objetos de sinal permanecem estáveis. As
  continuações obsoletas não conseguem fazer commit de resultados. Em patches
  rejeitados, o trabalho antigo continua ativo. O descarte do componente
  cancela o trabalho.
- O aborto é cooperativo. As operações não abortáveis podem terminar, mas os
  seus resultados obsoletos nunca atualizam o estado assíncrono do Kuito. O
  sinal é o `AbortSignal` do próprio kernel
  ([web-apis.md](web-apis.md#abortcontroller)), pelo que passá-lo ao `fetch`
  cancela o pedido.
- Uma task ou um recurso mantém o seu slot por nome, como todos os hooks
  (`docs/reactivity.md`): adicionar, remover ou reordenar hooks à sua volta
  mantém os seus sinais, e removê-lo descarta-o.

## Integração de Promises com o host

O runtime Hermes móvel partilhado chama agora `drainMicrotasks()` após a
avaliação do código-fonte e o despacho de eventos. Isto é um ponto de controlo
para os jobs de Promise; **não** fornece um event loop. Os callbacks nativos
externos têm de voltar a entrar na thread da VM que os detém e drenar os jobs
de novo.

Os callbacks de temporizadores, HTTP e módulos voltam a entrar na thread da VM
como jobs próprios, cada um seguido de um ponto de controlo de microtasks.

Os bindings reativos de UI atuais observam as dependências capturadas na sua
avaliação inicial. As dependências de sinais que dependem de ramos ainda
precisam de re-rastreio dinâmico.

## Próximos marcos nativos

1. Adicionar workers nativos independentes, cache de recursos e desempenho medido em dispositivo.
