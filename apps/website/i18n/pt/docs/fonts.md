# fonts

`fontFamily` nomeia uma família do sistema, uma fonte que a aplicação inclui no
bundle, ou uma que carrega em tempo de execução. `fontWeight` e `fontStyle`
escolhem entre os ficheiros da família tal como o CSS faz. Uma família que não
é nenhuma destas é um erro que a nomeia, nunca um recurso silencioso à fonte do
sistema.

```tsx
<Text fontFamily="Pacifico">Bundled</Text>
<Text fontFamily="Lato" fontWeight="bold">Loaded at run time</Text>
```

## Incluir fontes no bundle

Liste ficheiros .ttf e .otf em `fonts` no `kuito.config.ts`, relativos a ele:

```ts
export default {
  // …
  fonts: [
    './assets/fonts/Pacifico-Regular.ttf',
    './assets/fonts/Lato-Regular.ttf',
    './assets/fonts/Lato-Bold.ttf',
    // A file whose own tables name its face wrongly:
    { file: './assets/fonts/LatoHeavy.otf', family: 'Lato', weight: 900, style: 'italic' },
  ],
  environments: {
    staging: { fonts: ['./assets/fonts/Staging.ttf'] },
  },
} satisfies KuitoConfig;
```

A família, o peso e o estilo de cada ficheiro vêm do próprio ficheiro: a sua
família tipográfica (name ID 16, senão a família, ID 1), a sua classe de peso
OS/2 e o bit de itálico do OS/2. Assim, `Lato-Regular.ttf` e `Lato-Bold.ttf`
são ambos `Lato`, a 400 e 700, e `fontFamily: 'Lato'` com `fontWeight: 'bold'`
desenha o ficheiro bold. Um objeto define em vez disso qualquer um de `family`,
`weight` (`normal`, `bold` ou `100`–`900`) e `style` (`normal` ou `italic`).

O `fonts` de um ambiente substitui a lista inteira. A CLI verifica a lista de
cada ambiente: um caminho que não é .ttf nem .otf, uma chave de fonte que não
conhece, dois ficheiros com um mesmo nome, um ficheiro que não é uma única fonte
TrueType ou OpenType (uma coleção `.ttc` é um erro), e dois ficheiros da mesma
família, peso e estilo falham cada um nomeando a chave.

Em cada build (`src/cli/fonts.ts`) os ficheiros e um manifesto, `fonts.json`,
com a face que cada um é, vão para as shells:

- **iOS**: `.kuito/ios/fonts/`, uma pasta no bundle da aplicação, com cada
  ficheiro listado em `UIAppFonts` para que o iOS os registe no arranque.
- **Android**: `.kuito/android/assets/fonts/`, carregados com
  `Typeface.createFromAsset`.

## Carregar fontes em tempo de execução

`fonts.load` regista ficheiros de fontes que a aplicação tem em disco,
tipicamente os que descarregou com [fileSystem](file-system.md). Cada chave é a
família que `fontFamily` usará; um ficheiro sem peso nem estilo é 400 e normal.

```tsx
import { fileSystem, fonts } from 'kuito';

const regular = fileSystem.cache + 'Lato-Regular.ttf';
const bold = fileSystem.cache + 'Lato-Bold.ttf';

await fileSystem.download(LATO_REGULAR_URL, regular);
await fileSystem.download(LATO_BOLD_URL, bold);
await fonts.load({ Lato: [regular, { uri: bold, weight: 'bold' }] });

fonts.loaded('Lato'); // true: bundled or loaded
```

| Função           | Corre em                            | Notas                                                |
| ---------------- | ----------------------------------- | ---------------------------------------------------- |
| `load(fonts)`    | a thread de segundo plano do módulo | `{ Family: uri \| { uri, weight, style } \| [...] }` |
| `loaded(family)` | a thread JS, de forma síncrona      | se uma fonte do bundle ou carregada tem essa família |

Os URIs têm de ser `file://`; um URL remoto, uma família vazia, uma lista vazia,
ou um peso ou estilo fora dos indicados acima é um `TypeError` antes de algo
atravessar. Um ficheiro que a plataforma não consegue carregar rejeita com
`ERR_FONT`, um que não existe com `ERR_NOT_FOUND`.

O iOS regista cada ficheiro para o processo com
`CTFontManagerRegisterFontsForURL`; o Android cria um `Typeface` com
`Typeface.createFromFile`. Um registo dura até a aplicação terminar, através
dos reloads. Carregar de novo o peso e o estilo de uma família substitui essa
face. Aguarde `load` antes de renderizar texto na família: até lá a família não
existe.

## Como `fontFamily` é resolvido

Cada renderizador mantém um único registo de famílias (`KuitoFonts` em ambas
as plataformas): o manifesto do bundle, lido na primeira utilização, mais o que
`fonts.load` acrescentou. Para uma família que lá está, a face é escolhida tal
como o CSS Fonts 4 faz a correspondência de fontes:

1. **Estilo**: as faces do `fontStyle` pedido, ou todas elas se a família não
   tiver nenhuma nesse estilo. Nada é inclinado ou engrossado sinteticamente.
2. **Peso**: o `fontWeight` pedido se a família o tiver. Caso contrário,
   para 400 e 500, faces mais pesadas até 500, depois mais leves, depois
   mais pesadas; para pesos mais leves, primeiro as faces mais leves; para
   pesos mais pesados, primeiro as faces mais pesadas. Assim, uma família
   de 400 e 700 desenha `fontWeight: 600` em bold e `300` em regular.

Uma família que o registo não tem recorre ao sistema: qualquer família ou nome
de fonte que o iOS conheça (`Menlo`, `Georgia-Bold`), ou uma família do sistema
no Android (`serif`, `monospace`, `sans-serif-condensed`), com peso e
inclinação dados pelo sistema como antes. Tudo o resto falha na prop:

```text
Unsupported: UILabel.fontFamily: no font family "Inter": bundle it with fonts in kuito.config.ts or load it with fonts.load (docs/fonts.md)
```

As fontes variáveis desenham a sua instância predefinida; os seus eixos ainda
não estão mapeados para `fontWeight`.
