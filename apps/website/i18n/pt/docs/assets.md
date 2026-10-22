# Recursos e símbolos

As imagens que acompanham a app são importadas, não carregadas por URL: o
compilador empacota cada uma em ambas as shells e transforma a importação numa
fonte cujo tamanho já conhece. Os símbolos próprios das plataformas são uma
primitiva, `<Symbol>`, verificada pelo nome quando a app compila.

```tsx
import { Image, Symbol } from 'kuito';
import cover from './assets/cover.png';

<Image src={cover} />
<Symbol name="star" size={18} weight="semibold" tintColor="#f5c451" />
```

## Imagens empacotadas

`import cover from './cover.png'` faz de `cover` um `BundledImageSource`,
`{ asset, width, height }`, que `<Image src>` aceita como um URL. As apps tipam
a importação através de `kuito/src/ui/assets.d.ts`, que o `tsconfig.json` de
uma app nova inclui.

| Ficheiro       | iOS                                     | Android                                            |
| -------------- | --------------------------------------- | -------------------------------------------------- |
| `.png`, `.jpg` | um conjunto de imagens das suas escalas | `drawable-mdpi`, `-xhdpi`, `-xxhdpi`               |
| `.svg`         | o SVG, desenhado como vetor             | um VectorDrawable, convertido ao compilar          |
| `.pdf`         | a primeira página do PDF, como vetor    | a sua primeira página, desenhada por `PdfRenderer` |

- **Escalas.** `cover@2x.png` e `cover@3x.png` ao lado de `cover.png` são a
  mesma imagem a 2× e 3×; cada plataforma escolhe a que corresponde ao ecrã. A
  importação nomeia o ficheiro simples, que pode ele próprio estar em falta.
- **Tamanho.** O compilador lê o tamanho em pontos a partir do ficheiro: os
  píxeis de um raster divididos pela sua maior escala, o `width` e o `height`
  de um SVG (ou, na sua falta, o `viewBox`), a página de um PDF. Uma Image de
  uma fonte empacotada sem `width`, `height` nem classe que a dimensione tem
  esse tamanho; dado um dos lados, mantém a proporção da imagem. Um tamanho
  dado pela app ganha sempre.
- **Nomes.** Ambas as shells conhecem uma imagem pelo seu caminho a partir da
  raiz da app (a pasta com `kuito.config.ts`), como nome de recurso Android:
  `assets/Cover Art.png` é `asset_assets_cover_art`. Dois ficheiros que
  resultem no mesmo nome são um erro de compilação que nomeia ambos.
- **Ficheiros em falta.** Uma importação de uma imagem que não existe, em
  qualquer escala, é um erro de compilação na importação, como qualquer
  importação por resolver: mudar o nome de uma imagem parte a compilação onde
  ela é usada, não num dispositivo.
- **Vetores.** O iOS mantém SVG e PDF como vetores, pelo que ficam nítidos em
  qualquer tamanho. O Android desenha vetores no seu próprio formato XML, que
  cobre aquilo de que os ícones são feitos: caminhos, retângulos, círculos,
  elipses, linhas, polilinhas e polígonos; grupos com transformações
  `translate`, `scale`, `rotate` e `matrix` sem distorção; preenchimentos e
  traços sólidos com a sua opacidade, extremidades, junções e `fill-rule`.
  Tudo o resto (texto, gradientes, folhas `<style>`, caminhos de recorte,
  máscaras, filtros, imagens incorporadas, `<use>`) falha a compilação Android
  nomeando o elemento; em alternativa, empacote um PNG ou PDF dele. Um PDF é
  redesenhado no tamanho em que aparece, em ambas as plataformas.

### Live Patch

Uma imagem importada é vigiada como um ficheiro de código. Editar uma recompila
a app e envia o patch; o `kuito dev` vê que a shell em execução foi
compilada com outros bytes, ou sem a imagem de todo, e di-lo no seu feed
(`Rebuilding the shell: the app now bundles assets/cover.png`) enquanto
recompila e relança, tal como faz para um módulo nativo recém-requerido.
Adicionar um ficheiro `@2x` ao lado de uma imagem é detetado na edição
seguinte de quem a importa.

No dispositivo, uma Image cujo nome empacotado a shell não tem é uma prop
inválida (`The app was built without the image …: build it again`), nunca
uma vista em branco.

## Símbolos

`<Symbol>` desenha o símbolo próprio da plataforma: um
[SF Symbol](https://developer.apple.com/sf-symbols/) no iOS, um
[Material Symbol](https://fonts.google.com/icons) no Android, tal como os
ícones dos separadores ([navegação](navigation.md#icons)).

| Prop        | Significado                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `name`      | Um nome que ambas as plataformas têm, como `"star"`, ou `{ ios, android }`, já que a maioria difere.                           |
| `size`      | Tamanho em pontos; 24 por omissão. A vista é um quadrado desse tamanho, salvo se a app a dimensionar, e o símbolo cabe dentro. |
| `weight`    | `ultralight`, `thin`, `light`, `regular` (por omissão), `medium`, `semibold`, `bold`, `heavy`, `black`.                        |
| `tintColor` | A cor do símbolo; preto por omissão, como o Text.                                                                              |

```tsx
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} />
```

Um nome literal que uma plataforma não tem falha a compilação na sua linha,
tanto para `<Symbol name>` como para `<Tab icon>`:

```
app/home.tsx:12:20 <Symbol name="magnifyingglass">: no Material Symbol has that name (fonts.google.com/icons)
```

O compilador lê os nomes do iOS a partir dos SF Symbols que o Mac lista, pelo
que um nome iOS é verificado quando a app compila num Mac (como uma compilação
iOS tem de ser), e os do Android a partir do tipo de letra Material Symbols
com que a shell Android desenha. Um nome calculado em tempo de execução é
verificado pelo renderizador, que reporta um nome que não tem como prop
inválida.

O tipo de letra Material Symbols do Android tem um único peso, pelo que
`medium` e os mais pesados engrossam o contorno e os pesos mais leves desenham
regular; o iOS desenha cada peso dos SF Symbols.
