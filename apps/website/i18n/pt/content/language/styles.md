# Estilos

O Kuito compila os estilos em propriedades nativas em tempo de build. Os módulos `.css` e `styles({...})` partilham uma única tabela de propriedades: o CSS usa nomes em kebab-case, `styles()` usa camelCase, e ambos aceitam os mesmos valores, incluindo cadeias abreviadas. Nada analisa CSS no dispositivo.

## Folhas de estilos

```css
.card {
  padding: 20px 24px;
  border: 1px solid #ffffff22;
  border-radius: 20px;
  box-shadow: 0 12px 32px #00000066;
  background: linear-gradient(135deg, #1e3a5f, #0b1220);
}
```

```tsx
const sheet = styles({
  card: { padding: '20px 24px', boxShadow: '0 12px 32px #00000066', fontWeight: 600 },
});
```

`styles()` inicializa uma `const` onde quer que uma possa ser declarada: no âmbito do módulo, no corpo de um componente, num bloco. Os comprimentos aceitam `px`/`dp`, `rem` e `em` ([unidades CSS](./css-units.md)). Propriedades desconhecidas e valores não suportados fazem falhar a build com o ficheiro, a linha e a razão.

## A prop `class`

Um elemento recebe as suas classes através de `class`: nomes de uma importação `.css` ou de `styles()`, como uma cadeia de nomes separados por espaços ou uma lista cujas entradas falsy são ignoradas. Quando um sinal que ela lê muda, o ramo da vista é planeado de novo com as novas classes. As declarações aplicam-se por ordem no código-fonte, e a classe posterior em `class` ganha.

```tsx
import css from './card.css';

<VStack class={[css.card, selected.value && css.selected]} />;
```

## Variantes

As variantes de uma classe são regras para os seus atributos de dados, `.card[data-size=large]` numa folha de estilos e `variants` numa entrada de `styles()`. Uma lista de classes escolhe-as com um objeto de atributos de dados; um valor falsy não escolhe nenhuma. Uma variante ganha à sua classe.

```css
.card {
  padding: 12px;
}
.card[data-size='large'] {
  padding: 24px;
}
```

```tsx
const button = styles({
  base: { padding: '8px 16px', variants: { tone: { primary: { backgroundColor: '#ff5a5f' } } } },
});

<Pressable class={[button.base, { tone: tone.value }]} />;
```

## A prop `style`

Uma primitiva aceita também os seus próprios estilos, `style={{ ... }}`, com as mesmas propriedades e valores camelCase de `styles()`. Uma declaração cujo valor muda tem de nomear uma única prop nativa (`opacity`, `paddingTop`, `backgroundColor`); uma abreviatura com uma expressão é um erro de build. `style` ganha a `class` nas props que ambos definem: partilhe estilos com `class`, guarde `style` para o que só uma vista precisa.

```tsx
<Box style={{ padding: '4px 8px', borderRadius: 12, opacity: dim.value ? 0.5 : 1 }} />
```

## Tokens

As propriedades personalizadas declaradas em `:root` são tokens: `var(--name)` é substituído pelo seu valor em tempo de build. Uma folha de estilos vê os seus próprios tokens e os das folhas de estilos que importa com `@import`. Um bloco `:root` dentro de `@media (prefers-color-scheme: dark)` redefine os tokens para esse esquema; uma mudança de tema reenvia apenas as props que o seguem.

```css
@import './tokens.css';

.card {
  padding: var(--space);
  border: 1px solid var(--accent);
}
```

## Condições e plataformas

Os blocos `@media` contêm regras cujas declarações se aplicam enquanto a sua query se verifica. Uma query são features entre parênteses unidas por `and`. As declarações de uma condição ganham às da sua classe enquanto ela se verifica; uma classe posterior em `class` ganha a ambas.

| Feature                  | Valores                         |
| ------------------------ | ------------------------------- |
| `min-width`, `max-width` | um comprimento em `px`          |
| `width-class`            | `compact`, `medium`, `expanded` |
| `prefers-color-scheme`   | `light`, `dark`                 |
| `prefers-reduced-motion` | `reduce`, `no-preference`       |

Um bloco `@platform` nomeia `ios` ou `android`; o bundle da outra plataforma nunca o vê. `platform` de `kuito` é uma constante que o compilador fixa por bundle. Não há `Platform.select` em tempo de execução.

```css
@media (width-class: expanded) {
  .grid {
    flex-direction: row;
  }
}

@platform android {
  .card {
    padding: 12px;
  }
}
```

## Em profundidade

[Estilos nativos](../../../../docs/styles.md) cobre os valores e as cores, a tabela de propriedades, o layout flexbox, as transições e as notas de plataforma.
