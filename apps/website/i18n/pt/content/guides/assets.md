# Recursos e símbolos

As imagens que acompanham a aplicação são importadas, não carregadas por URL: o compilador empacota cada uma em ambas as shells e transforma a importação numa fonte cujo tamanho já conhece. Os símbolos próprios das plataformas são uma primitiva, `<Symbol>`, verificada pelo nome quando a aplicação compila.

```tsx
import { Image, Symbol } from 'kuito';
import cover from './assets/cover.png';

<Image src={cover} />
<Symbol name="star" size={18} weight="semibold" tintColor="#f5c451" />
```

## Imagens empacotadas

`import cover from './cover.png'` faz de `cover` um `BundledImageSource`, `{ asset, width, height }`, que `<Image src>` aceita como um URL. As aplicações tipam a importação através de `kuito/src/ui/assets.d.ts`, que o `tsconfig.json` de uma aplicação nova inclui.

| Ficheiro       | iOS                                     | Android                                            |
| -------------- | --------------------------------------- | -------------------------------------------------- |
| `.png`, `.jpg` | um conjunto de imagens das suas escalas | `drawable-mdpi`, `-xhdpi`, `-xxhdpi`               |
| `.svg`         | o SVG, desenhado como vetor             | um VectorDrawable, convertido ao compilar          |
| `.pdf`         | a primeira página do PDF, como vetor    | a sua primeira página, desenhada por `PdfRenderer` |

- **Escalas.** `cover@2x.png` e `cover@3x.png` ao lado de `cover.png` são a mesma imagem a 2x e 3x; cada plataforma escolhe a que corresponde ao ecrã.
- **Tamanho.** O compilador lê o tamanho em pontos a partir do ficheiro. Uma Image de uma fonte empacotada sem `width`, `height` nem classe que a dimensione tem esse tamanho; dado um dos lados, mantém a proporção da imagem. Um tamanho dado pela aplicação ganha sempre.
- **Ficheiros em falta.** Uma importação de uma imagem que não existe, em qualquer escala, é um erro de compilação na importação: mudar o nome de uma imagem parte a compilação onde ela é usada, não num dispositivo.

## Vetores

O iOS mantém SVG e PDF como vetores, pelo que ficam nítidos em qualquer tamanho. O Android desenha vetores no seu próprio formato XML, que cobre aquilo de que os ícones são feitos: caminhos, retângulos, círculos, elipses, linhas, polilinhas e polígonos; grupos com transformações `translate`, `scale`, `rotate` e `matrix` sem distorção; preenchimentos e traços sólidos. Tudo o resto (texto, gradientes, folhas `<style>`, caminhos de recorte, máscaras, filtros, imagens incorporadas, `<use>`) falha a compilação Android nomeando o elemento; em alternativa, empacote um PNG ou PDF dele.

## Símbolos

`<Symbol>` desenha o símbolo próprio da plataforma: um [SF Symbol](https://developer.apple.com/sf-symbols/) no iOS, um [Material Symbol](https://fonts.google.com/icons) no Android, tal como os ícones dos separadores ([navegação](../../../../docs/navigation.md#icons)).

| Prop        | Significado                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `name`      | Um nome que ambas as plataformas têm, como `"star"`, ou `{ ios, android }`, já que a maioria difere.        |
| `size`      | Tamanho em pontos; 24 por omissão. A vista é um quadrado desse tamanho, salvo se a aplicação a dimensionar. |
| `weight`    | `ultralight`, `thin`, `light`, `regular` (por omissão), `medium`, `semibold`, `bold`, `heavy`, `black`.     |
| `tintColor` | A cor do símbolo; preto por omissão, como o Text.                                                           |

```tsx
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} />
```

Um nome literal que uma plataforma não tem falha a compilação na sua linha, tanto para `<Symbol name>` como para `<Tab icon>`. Um nome calculado em tempo de execução é verificado pelo renderizador, que reporta um nome que não tem como prop inválida. O tipo de letra Material Symbols do Android tem um único peso, pelo que `medium` e os mais pesados engrossam o contorno e os pesos mais leves desenham regular; o iOS desenha cada peso dos SF Symbols.

## Em profundidade

[Recursos e símbolos](../../../../docs/assets.md) cobre como as shells nomeiam as imagens, como o compilador lê o tamanho de cada ficheiro, o Live Patch de imagens editadas, e de onde vêm os nomes de símbolos que verifica.
