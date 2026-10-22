# Fontes

`fontFamily` nomeia uma família do sistema, uma fonte que a aplicação inclui no bundle, ou uma que carrega em tempo de execução. `fontWeight` e `fontStyle` escolhem entre os ficheiros da família tal como o CSS faz. Uma família que não é nenhuma destas é um erro que a nomeia, nunca um recurso silencioso à fonte do sistema.

```tsx
<Text fontFamily="Pacifico">Bundled</Text>
<Text fontFamily="Lato" fontWeight="bold">Loaded at run time</Text>
```

## Incluir fontes no bundle

Liste ficheiros .ttf e .otf em `fonts` no `kuito.config.ts`, relativos a ele:

```ts
export default {
  // ...
  fonts: [
    './assets/fonts/Pacifico-Regular.ttf',
    './assets/fonts/Lato-Regular.ttf',
    './assets/fonts/Lato-Bold.ttf',
    // A file whose own tables name its face wrongly:
    { file: './assets/fonts/LatoHeavy.otf', family: 'Lato', weight: 900, style: 'italic' },
  ],
} satisfies KuitoConfig;
```

A família, o peso e o estilo de cada ficheiro vêm do próprio ficheiro. Assim, `Lato-Regular.ttf` e `Lato-Bold.ttf` são ambos `Lato`, a 400 e 700, e `fontFamily: 'Lato'` com `fontWeight: 'bold'` desenha o ficheiro bold. Um objeto define em vez disso qualquer um de `family`, `weight` (`normal`, `bold` ou `100`-`900`) e `style` (`normal` ou `italic`).

O `fonts` de um ambiente substitui a lista inteira. A CLI verifica a lista de cada ambiente: um caminho que não é .ttf nem .otf, dois ficheiros com um mesmo nome, uma coleção `.ttc`, e dois ficheiros da mesma família, peso e estilo falham cada um nomeando a chave.

## Carregar fontes em tempo de execução

`fonts.load` regista ficheiros de fontes que a aplicação tem em disco, tipicamente os que descarregou com [fileSystem](../../../../docs/file-system.md). Cada chave é a família que `fontFamily` usará; um ficheiro sem peso nem estilo é 400 e normal.

```tsx
import { fileSystem, fonts } from 'kuito';

const regular = fileSystem.cache + 'Lato-Regular.ttf';
const bold = fileSystem.cache + 'Lato-Bold.ttf';

await fileSystem.download(LATO_REGULAR_URL, regular);
await fileSystem.download(LATO_BOLD_URL, bold);
await fonts.load({ Lato: [regular, { uri: bold, weight: 'bold' }] });

fonts.loaded('Lato'); // true: bundled or loaded
```

Os URIs têm de ser `file://`; um URL remoto, uma família vazia, uma lista vazia, ou um peso ou estilo fora dos indicados acima é um `TypeError`. Um ficheiro que a plataforma não consegue carregar rejeita com `ERR_FONT`, um que não existe com `ERR_NOT_FOUND`. Um registo dura até a aplicação terminar, através dos reloads. Carregar de novo o peso e o estilo de uma família substitui essa face. Aguarde `load` antes de renderizar texto na família: até lá a família não existe.

## Como fontFamily é resolvido

Para uma família do bundle ou carregada, a face é escolhida tal como o CSS Fonts 4 faz a correspondência de fontes:

1. Estilo: as faces do `fontStyle` pedido, ou todas elas se a família não tiver nenhuma nesse estilo. Nada é inclinado ou engrossado sinteticamente.
2. Peso: o `fontWeight` pedido se a família o tiver. Caso contrário, para pesos mais leves, primeiro as faces mais leves; para pesos mais pesados, primeiro as faces mais pesadas. Assim, uma família de 400 e 700 desenha `fontWeight: 600` em bold e `300` em regular.

Uma família que o registo não tem recorre ao sistema: qualquer família ou nome de fonte que o iOS conheça (`Menlo`, `Georgia-Bold`), ou uma família do sistema no Android (`serif`, `monospace`, `sans-serif-condensed`). Tudo o resto falha na prop:

```text
Unsupported: UILabel.fontFamily: no font family "Inter": bundle it with fonts in kuito.config.ts or load it with fonts.load (docs/fonts.md)
```

As fontes variáveis desenham a sua instância predefinida; os seus eixos ainda não estão mapeados para `fontWeight`.

## Em profundidade

[Fontes](../../../../docs/fonts.md) cobre como a face de um ficheiro é lida a partir das suas tabelas, onde os ficheiros do bundle ficam em cada shell, em que thread `load` e `loaded` correm, e a ordem completa de correspondência de pesos.
