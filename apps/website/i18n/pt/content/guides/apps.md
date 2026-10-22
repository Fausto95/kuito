# Projetos de aplicação

Uma aplicação criada por `kuito create` contém apenas TypeScript e configuração. Tudo o que é nativo vem no framework, e a CLI gera e compila as shells nativas de cada aplicação a pedido.

```text
MyApp/
  app/                 the app: file-based routes
  assets/              icon.png and icon-staging.png, the app icons; splash.png
  modules/             the app's own native modules
  kuito.config.ts      native settings: name, ids, icon, environments
  package.json         one dependency: kuito
  .kuito/              generated shells and builds; never committed
```

A aplicação não faz commit de nenhum projeto `ios/` ou `android/`. `kuito` é a sua única dependência, e as shells são regeneradas a partir do framework instalado em cada compilação, pelo que uma versão nova traz shells novas.

## kuito.config.ts

`kuito.config.ts` é a única entrada nativa. Todos os comandos `kuito` que compilam ou executam uma aplicação precisam de um no diretório em que correm, e falham sem ele.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  version: '1.2.0',
  buildNumber: 14,
  icon: './assets/icon.png',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
} satisfies KuitoConfig;
```

| Chave                                           | Efeito                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `name`                                          | O nome sob o ícone da aplicação.                                                                 |
| `version`                                       | O que os utilizadores veem. Até três números. `1.0.0`.                                           |
| `buildNumber`                                   | Aquilo pelo que as lojas ordenam os envios. Aumente-o a cada envio. `1`.                         |
| `icon`                                          | O ícone da aplicação em ambas as plataformas: um PNG quadrado de pelo menos 1024x1024. Opcional. |
| `ios.bundleIdentifier`, `android.applicationId` | Ids em DNS invertido (`com.example.app`); o que o `kuito dev` instala e lança.                   |

Outras chaves têm páginas próprias: `permissions` ([Permissões](../../../../docs/permissions.md#declare-them-in-kuitoconfigts)), `backgroundTasks` ([Tarefas em segundo plano](../../../../docs/background-tasks.md)), `fonts` ([Fontes](../../../../docs/fonts.md#bundle-fonts)), `migrations` ([Armazenamento](../../../../docs/storage.md#migrations)) e `splash` ([Ecrã splash](../../../../docs/splash.md)).

A CLI verifica o ficheiro: uma chave em falta ou desconhecida, um id malformado, um ícone que não é um caminho `.png` ou uma cor malformada é um erro que nomeia o ficheiro e a chave. Os caminhos de imagens são relativos a `kuito.config.ts`.

## Definições nativas

O que de outro modo significaria editar o `Info.plist`, os entitlements, o `AndroidManifest.xml` ou um tema é uma chave na configuração. As chaves tipadas vêm primeiro: um valor, escrito na definição própria de cada plataforma. Uma chave deixada no seu valor por predefinição não escreve nada, pelo que a definição da própria shell prevalece.

```ts
export default {
  // ...
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#101418',
  statusBar: { style: 'light' },
  urlSchemes: ['myapp'],
  linkDomains: ['example.com'],
} satisfies KuitoConfig;
```

Tudo o que não tem chave tipada continua a ser dados, nunca um ficheiro nativo nem uma cadeia XML: `ios.infoPlist`, `ios.entitlements`, `android.manifest` e `android.theme`. Todas as fontes de entradas passam por uma única fusão; duas que discordem numa chave falham a compilação nomeando ambas, pelo que uma entrada em bruto não pode contradizer uma chave tipada nem um módulo.

## Ambientes

A própria configuração é a aplicação de produção. Um ambiente é um nome e as chaves que diferem dela; todas as outras chaves são herdadas, as aninhadas uma a uma. Uma lista (`fonts`, `urlSchemes`, `android.manifest.intentFilters`) é substituída por inteiro. `idSuffix` acrescenta-se tanto ao bundle id como ao applicationId, pelo que cada ambiente se instala como uma aplicação própria ao lado das outras.

```ts
export default {
  // ...
  environments: {
    staging: {
      name: 'MyApp Staging',
      idSuffix: '.staging',
      icon: './assets/icon-staging.png',
    },
  },
} satisfies KuitoConfig;
```

```sh
kuito dev ios                   # development
kuito dev ios --env staging     # MyApp Staging, com.example.myapp.staging
kuito build android             # production
```

`--env` escolhe um. `kuito dev` executa `development` e `kuito build` compila `production` quando não é indicado; qualquer outro nome tem de ser declarado em `environments`. O ambiente é apenas uma definição de compilação; o JS da aplicação ainda não o vê.

## Módulos nativos

`modules/<name>/` contém os módulos nativos próprios de uma aplicação: a especificação `<name>.ts`, `ios/*.swift` e `android/*.kt`. `kuito module create <Name>` cria um. A CLI inclui em cada shell apenas os módulos que o bundle da aplicação chama, pelo que ninguém edita o framework ([módulos nativos](../../../../docs/native-modules.md#write-your-own-module)).

## Em profundidade

[Projetos de aplicação](../../../../docs/apps.md) cobre todas as chaves da configuração, a tabela completa de definições nativas, as entradas em bruto do `Info.plist` e do manifesto, a geração do ícone da aplicação, e o que as shells Xcode e Gradle geradas contêm.
