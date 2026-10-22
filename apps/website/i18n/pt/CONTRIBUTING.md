# Contribuir para o Kuito

Obrigado por ajudar a melhorar o Kuito. O projeto é experimental: as contribuições mais úteis são pequenas, testadas e claramente documentadas.

## Antes de abrir um PR

1. Pesquise as issues e discussões existentes para evitar trabalho duplicado.
2. Explique o problema e o comportamento proposto, sobretudo em alterações à API pública.
3. Adicione ou atualize o smoke test mais próximo do runtime, do compilador, da CLI ou nativo.
4. Atualize a documentação e os exemplos quando o comportamento visível para o utilizador mudar.
5. Mantenha explícitas as limitações específicas de cada plataforma. Não afirme desempenho medido sem um benchmark reproduzível.

## Configuração local

```bash
npm install
npm ci --prefix apps/website             # o lint verifica também o site
npm --prefix apps/website run build      # escreve os ficheiros que o site importa
npm test
npm run lint
npm run fmt
```

Para executar o showcase nativo, use `npm run demo:ios` ou `npm run demo:android`. As toolchains móveis têm de estar instaladas localmente.

### Website

O website em TanStack Start encontra-se em `apps/website`.

```bash
cd apps/website
npm install
npm run typecheck
npm run build
```

As contribuições para o site devem manter-se acessíveis, responsivas e transparentes quanto às funcionalidades experimentais.

## Expectativas para pull requests

- Descreva a alteração visível para o utilizador e inclua capturas de ecrã de antes/depois para alterações de UI.
- Ligue a issue ou explique a motivação.
- Mostre que comandos executou e em que dispositivos.
- Mantenha a atribuição a terceiros e as obrigações de licença.
- Adicione um changeset quando os utilizadores derem pela alteração (ver [Versões](#releases)).

## Versões

O pacote npm `kuito` é versionado com [Changesets](https://github.com/changesets/changesets).
Um PR que muda o que os utilizadores recebem (a CLI, `kuito`, `kuito/config`, `kuito/tests`, as
shells nativas, os templates) adiciona um:

```bash
npm run changeset
```

O comando pergunta o nível da versão (patch, minor ou major) e uma linha para o changelog, e
escreve-o em `.changeset/`. Documentação, testes e refatorações internas não precisam de nenhum.

Em `main`, o workflow de publicação (`.github/workflows/release.yml`) mantém aberto um PR
"Version packages" com os changesets pendentes aplicados: a nova versão em `package.json` e a sua
entrada no `CHANGELOG.md`. Fazer merge desse PR publica a versão no npm e cria a sua tag.

## Código de conduta e licença

Espera-se uma colaboração respeitosa e construtiva. O Kuito é distribuído sob a
[licença MIT](LICENSE).
