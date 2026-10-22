# Unidades CSS

O Kuito aceita `px`, `rem` e `em` em ficheiros `.css` para as propriedades de comprimento nativas: `width`, `height`, tamanhos `min-`/`max-`, `padding` e os seus lados, `gap`, `border-radius`, `border-width`, `font-size`, `letter-spacing`, `line-height`, translações e sombras.

```css
:root {
  font-size: 18px;
  --space: 1rem;
}

.card {
  font-size: 1.25rem; /* 22.5 native logical units */
  padding: 2em; /* 45 units = element font size x 2 */
  gap: var(--space); /* 18 units */
  border-radius: 12px; /* 12 native logical units */
}
```

## px, rem e em

- `px` é um pixel lógico CSS, compilado para um ponto de layout no iOS ou um pixel independente da densidade no Android, não um pixel físico do ecrã.
- `rem` é multiplicado em tempo de build pelo tamanho de fonte da raiz. Por omissão: `16px`. Substitua-o com `:root { font-size: 18px; }` ou com a opção `rootFontSize` do compilador. Uma aplicação tem um único tamanho de fonte da raiz: declare-o numa folha de estilos e importe essa com `@import` onde `rem` o deva seguir; uma segunda declaração noutro sítio do bundle é um erro.
- `em` é resolvido ao preparar o plano de vistas nativo: `font-size: Nem` é relativo ao tamanho herdado do pai; as outras dimensões em `em` são relativas ao tamanho de fonte calculado do elemento.
- Os comprimentos sem unidade e `dp` continuam a ser aceites.

```css
.caption {
  font-size: 0.875em; /* relative to inherited font size */
}
```

## Outros valores

- Os tempos de `transition` aceitam `ms` e `s` (normalizados para milissegundos). `opacity` não tem unidade.
- `var(--token)` resolve-se em tempo de build, incluindo referências adiantadas e cadeias. Tokens em falta ou circulares produzem erros explícitos do compilador. Os tokens de uma folha de estilos importada com `@import`, incluindo o seu font-size de `:root`, também se aplicam ([Tokens](../../../../docs/styles.md#tokens)).
- As dimensões não suportadas (`%`, `vh`, `vw`, `calc()` e outras) fazem falhar a compilação em vez de serem descartadas silenciosamente.

## Limitações

Nem o Hermes nem a thread de UI nativa analisam texto `.css`; os adaptadores de plataforma recebem apenas números escalares. Alterar o tamanho de fonte de um antepassado através de um sinal ainda não recalcula automaticamente todas as medições `em` dos descendentes. Não assuma compatibilidade completa com o CSS do browser.

## Em profundidade

[Unidades de comprimento CSS](../../../../docs/css-units.md) cobre a fronteira de implementação entre o compilador e o planeamento das vistas, e o trabalho que continua à parte.
