# Introdução

O Kuito constrói aplicações nativas iOS e Android a partir de TypeScript. Os componentes são TSX, os estilos são CSS, o estado são sinais. O resultado é UIKit e Android Views: sem webview, sem renderizador React.

> O Kuito é experimental e não está pronto para produção. As APIs e os projetos gerados mudam.

## Um componente

```tsx
import { signal, VStack, Text, Button } from 'kuito';

export default function Counter() {
  const count = signal(0);

  return (
    <VStack gap={16}>
      <Text>Count: {count.value}</Text>
      <Button onPress={() => count.value++}>Increment</Button>
    </VStack>
  );
}
```

`count` é um sinal. `<Text>` lê-o, pelo que uma escrita atualiza essa única label nativa; a função do componente nunca volta a executar.

## Como funciona

- **Compilado, não interpretado.** O TSX e o CSS compilam em tempo de build. Nenhum parser de CSS corre no dispositivo.
- **Hermes no dispositivo.** A aplicação corre no processo nativo. Cada evento envia um lote de mutações de vistas para a thread de UI.
- **Vistas reais.** Cada componente é uma vista UIKit ou Android, disposta por um único motor partilhado.
- **APIs Web.** `fetch`, `WebSocket`, `URL`, temporizadores e `crypto`, suportados pela plataforma.
- **Módulos nativos.** Swift e Kotlin por trás de uma única especificação TypeScript; `haptics`, `location`, `storage` e os restantes são construídos desta forma.

A página de [arquitetura](./architecture.md) explica cada parte.

## Requisitos

- Node.js 22.18 ou mais recente
- iOS: macOS, Xcode, XcodeGen
- Android: JDK 21, Android SDK e NDK, Gradle 8

## Criar uma aplicação

```sh
npx @kuito/kuito doctor
npx @kuito/kuito create MyApp
cd MyApp
npx kuito dev ios    # or: npx kuito dev android
```

`kuito doctor` indica o que falta. `kuito create` escreve a aplicação e instala a sua única dependência. `kuito dev ios` arranca um simulador, constrói a shell nativa, instala a aplicação e começa a observar os seus ficheiros.

```text
MyApp/
  app/               file-based routes
    _layout.tsx      tabs
    (home)/index.tsx the first screen
  assets/            icon.png, splash.png
  modules/           the app's own native modules
  kuito.config.ts    name, ids, icon, environments
```

Edite `app/(home)/index.tsx` e guarde: a aplicação em execução atualiza-se no lugar, mantendo o seu estado. Não se faz commit de nenhum projeto nativo; a CLI gera as shells em `.kuito/` em cada build.

## A seguir

- [Projetos de aplicação](../../../docs/apps.md): layout, `kuito.config.ts`, ambientes
- [Primitivas](../../../docs/primitives.md) e [Reatividade](../../../docs/reactivity.md)
- [Estilos](../../../docs/styles.md): o CSS que o Kuito compila
- [CLI](../../../docs/cli.md): todos os comandos
