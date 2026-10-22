# Unidades de comprimento CSS no Kuito

O Kuito aceita as familiares **`px`**, **`rem`** e **`em`** em ficheiros `.css` para as propriedades de comprimento nativas (`width`, `height`, tamanhos `min-`/`max-`, `padding` e os seus lados, `gap`, `border-radius`, `border-width`, `font-size`, `letter-spacing`, `line-height`, translações e sombras). A lista completa está em [Estilos nativos](styles.md).

```css
:root {
  font-size: 18px;
  --space: 1rem;
}

.card {
  font-size: 1.25rem; /* 22.5 native logical units */
  padding: 2em; /* 45 units = element font size × 2 */
  gap: var(--space); /* 18 units */
  border-radius: 12px; /* 12 native logical units */
}

.caption {
  font-size: 0.875em;
} /* relative to inherited font size */
```

## Regras de compilação

- **`px`** é um _píxel lógico CSS_, compilado para um ponto de layout no iOS ou um píxel independente da densidade no Android — não um píxel físico do ecrã.
- **`rem`** é multiplicado no momento da compilação pelo tamanho de fonte da raiz. Por omissão: `16px`. Substitua-o com `:root { font-size: 18px; }` ou com a opção `rootFontSize` do compilador. Uma app tem um único tamanho de fonte da raiz: declare-o numa folha de estilos e importe essa com `@import` onde `rem` o deva seguir; uma segunda declaração noutro sítio do bundle é um erro.
- **`em`** é compilado numa instrução numérica compacta relativa à fonte. O Kuito resolve-a ao preparar o plano de vistas nativo: `font-size: Nem` é relativo ao tamanho herdado do pai; as outras dimensões em `em` são relativas ao tamanho de fonte calculado do elemento.
- **Comprimentos sem unidade e `dp`** continuam a ser aceites por compatibilidade com os estilos Kuito existentes.
- Os tempos de **`transition`** aceitam `ms` e `s` (normalizados para milissegundos). **`opacity`** não tem unidade.
- **`var(--token)`** resolve-se no momento da compilação, incluindo referências adiantadas e cadeias. Tokens em falta ou circulares produzem erros explícitos do compilador. Os tokens de uma folha de estilos importada com `@import`, incluindo o seu font-size de `:root`, também se aplicam ([Tokens](styles.md#tokens)).
- As dimensões não suportadas (`%`, `vh`, `vw`, `calc()` e outras) fazem falhar a compilação em vez de serem descartadas silenciosamente.

## Fronteira de implementação

As folhas de estilos compilam em propriedades numéricas nativas mais instruções `em` pré-analisadas. Nem o Hermes nem a thread de UI nativa analisam texto `.css`. As instruções relativas são multiplicadas pelo tamanho de fonte calculado durante o planeamento das vistas; os adaptadores de plataforma recebem apenas números escalares.

**Limitação atual:** a herança de fonte nativa e `em` são recalculados durante a renderização inicial e num Live Patch compatível, mas alterar o tamanho de fonte de um antepassado através de um sinal ainda não recalcula automaticamente todas as medições `em` dos descendentes. As media queries CSS, os tokens dinâmicos, a cascata completa do browser e o escalonamento do Dynamic Type do sistema também continuam a ser trabalho à parte. Evite assumir compatibilidade completa com o CSS do browser.

Ver `src/style/compiler.ts`, `src/runtime/plan-values.ts` e `test/css-units.test.ts`.
