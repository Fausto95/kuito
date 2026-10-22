# Registo de decisão de arquitetura 0001 — Desacoplar os backends de execução

Estado: **aceite**

## Decisão

1. O Kuito detém o lowering do TSX, os metadados de binding, as identidades estáveis dos componentes, o ciclo de vida das vistas nativas e as regras de compatibilidade dos Live Patches.
2. **Desenvolvimento:** um runtime Hermes persistente dentro de cada shell nativo executa a aplicação e recebe os Live Patches como código-fonte (o [histórico](history.md) tem os modelos da Etapa 0 que vieram antes).
3. **AOT de produção:** o Static Hermes é um backend medido separadamente. Onde o subconjunto tipado da linguagem é suportado, preservar a sintaxe de tipos no caminho para `shermes -parse-ts`; não executar primeiro uma transformação incondicional de remoção de TS pelo Oxc.
4. **Dependências:** o Rolldown resolve e empacota pacotes npm sem modificações; o Oxc é a base das transformações TSX/reativas específicas do Kuito. O JavaScript npm normal, sem tipos, tem de continuar a ser tratado.
5. Definir as APIs do host e o IR de mutação da UI independentemente do Hermes, para que possamos substituir um backend sem redesenhar a renderização.

## Contratos previstos (ainda não implementados)

- `Host.createView(kind, id, props)` / `Host.setProperty(id, name, value)` / `Host.disposeView(id)`
- `Host.attachEvent(viewId, eventName, handlerId)` — ID estável, consulta dinâmica na tabela de manipuladores atual
- `Live.applyModule(moduleId, bytecode)` — validar, preparar, trocar, descartar as subscrições antigas, caso contrário rejeitar e conservar o módulo antigo
- `State.get(moduleId, stateId)` — identidade estável sob patches compatíveis
- `Compiler.emitBindings(tsx)` — registar subscrições de propriedade-alvo, não re-renderizações de componentes inteiros

## Propriedade e segurança

- Um host nativo não deve conservar ponteiros brutos para closures JS entre patches. Guardar IDs de manipuladores, resolver na invocação.
- A identidade do estado não deve depender dos números de linha do código-fonte nem da ordem de chamada. O slot de cada hook é indexado pela sua instância de componente e pelo nome que o compilador lhe dá ([reatividade](reactivity.md)).
- A preparação de um patch tem de ter efeitos secundários restringidos. As escritas nativas não são automaticamente reversíveis; as trocas transacionais precisam de uma política de staging/reconciliação.
- A compatibilidade da ABI do Hermes e da versão do bytecode tem de estar fixada numa revisão exata da toolchain.
- No iOS, a atualização em desenvolvimento pode carregar bytecode interpretado, mas as mudanças de código nativo AOT exigem uma rebuild; isto não é um mecanismo OTA nativo sem restrições.

## Questões em aberto

- Que APIs de carregamento de unidades de bytecode/módulos estão disponíveis para a revisão do Hermes **escolhida** num host persistente?
- Podem o código antigo e o novo coexistir durante a preparação de um patch, e quando é possível um descarte seguro?
- Como são representados os imports/exports de módulos, os singletons ao nível do pacote e as referências nativas entre patches?
- Podem o código Kuito tipado e os pacotes npm empacotados sem tipos coexistir sob AOT nativo com paridade observável?
- O lowering do compilador e o empacotamento preservam as anotações que tornam o AOT tipado valioso?

## Fontes

- https://github.com/facebook/hermes/blob/static_h/doc/TypedLanguage.md
- https://github.com/facebook/hermes/blob/static_h/doc/BuildingAndRunning.md
- https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-11-02-hermes-compilation-runtime-modes.md
- https://rolldown.rs/apis/plugin-api
