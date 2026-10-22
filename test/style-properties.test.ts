import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROPS } from '../src/protocol/manifest.ts';
import { compileNativeCSS } from '../src/style/compiler.ts';
import { generateStyleDocs } from '../src/style/docs.ts';
import { extractInlineStyles } from '../src/style/inline.ts';
import { expandStyle, STYLE_PROPERTIES } from '../src/style/properties.ts';
import { present } from './support/present.ts';

const css = (body: string) => ({ ...compileNativeCSS(`.x { ${body} }`).classes.x });
const inline = (object: string) =>
  Object.values(
    present(extractInlineStyles(`const s = styles({ x: ${object} });`, 'a.tsx'), 'inline styles')
      .styles,
  )[0];

test('padding shorthand expands to sides like CSS (1 to 4 values)', () => {
  assert.deepEqual(css('padding: 12px'), {
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 12,
  });

  assert.deepEqual(css('padding: 20px 24px'), {
    paddingTop: 20,
    paddingRight: 24,
    paddingBottom: 20,
    paddingLeft: 24,
  });

  assert.deepEqual(css('padding: 1px 2px 3px'), {
    paddingTop: 1,
    paddingRight: 2,
    paddingBottom: 3,
    paddingLeft: 2,
  });

  assert.deepEqual(css('padding: 1px 2px 3px 4px'), {
    paddingTop: 1,
    paddingRight: 2,
    paddingBottom: 3,
    paddingLeft: 4,
  });

  assert.deepEqual(css('padding-left: 8px; padding-top: 4px'), { paddingLeft: 8, paddingTop: 4 });
});

test('size limits, overflow and stack alignment are native layout props', () => {
  assert.deepEqual(
    css('min-width: 40px; max-width: 320px; min-height: 44px; max-height: 2rem; overflow: hidden'),
    { minWidth: 40, maxWidth: 320, minHeight: 44, maxHeight: 32, overflow: 'hidden' },
  );

  // Keywords pass through as CSS spells them: start and flex-start differ in
  // reversed and wrap-reverse containers.
  assert.deepEqual(css('align-items: flex-start; justify-content: space-between'), {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  });

  assert.deepEqual(css('justify-content: space-around; align-content: safe center'), {
    justifyContent: 'space-around',
    alignContent: 'safe center',
  });

  assert.throws(() => css('justify-content: around'), /justify-content must be/);
});

test('sizes take percentages, auto and CSS sizing keywords', () => {
  assert.deepEqual(
    css('width: 50%; height: auto; min-width: min-content; max-width: fit-content(20rem)'),
    {
      width: '50%',
      height: 'auto',
      minWidth: 'min-content',
      maxWidth: 'fit-content(320)',
    },
  );

  assert.deepEqual(css('flex-basis: content; aspect-ratio: 16 / 9'), {
    flexBasis: 'content',
    aspectRatio: 16 / 9,
  });

  assert.throws(() => css('width: 10vw'), /Unsupported length unit "vw"/);
});

test('flex shorthands expand like CSS', () => {
  assert.deepEqual(css('flex: 1'), { flexGrow: 1, flexShrink: 1, flexBasis: '0%' });
  assert.deepEqual(css('flex: none'), { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' });
  assert.deepEqual(css('flex: auto'), { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' });
  assert.deepEqual(css('flex: 2 0 120px'), { flexGrow: 2, flexShrink: 0, flexBasis: 120 });

  assert.deepEqual(css('flex-flow: column wrap-reverse'), {
    flexDirection: 'column',
    flexWrap: 'wrap-reverse',
  });

  assert.deepEqual(css('flex-grow: 2; flex-shrink: 0; flex-wrap: balance'), {
    flexGrow: 2,
    flexShrink: 0,
    flexWrap: 'balance',
  });
});

test('margins, insets and position place boxes like CSS', () => {
  assert.deepEqual(css('margin: 0 auto'), {
    marginTop: 0,
    marginRight: 'auto',
    marginBottom: 0,
    marginLeft: 'auto',
  });

  assert.deepEqual(css('margin-horizontal: 8px; margin-top: 5%'), {
    marginLeft: 8,
    marginRight: 8,
    marginTop: '5%',
  });

  assert.deepEqual(css('position: absolute; inset: 0'), {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  assert.deepEqual(css('top: 10%; right: 1rem'), { top: '10%', right: 16 });
  assert.throws(() => css('position: fixed'), /position must be one of relative, absolute/);
});

test('inline logical sides stay logical for the layout to resolve; block sides are top and bottom', () => {
  assert.deepEqual(css('padding-inline-start: 8px; padding-inline-end: 1rem'), {
    paddingInlineStart: 8,
    paddingInlineEnd: 16,
  });

  assert.deepEqual(css('padding-inline: 4px 6px'), { paddingInlineStart: 4, paddingInlineEnd: 6 });

  assert.deepEqual(css('margin-inline: auto'), {
    marginInlineStart: 'auto',
    marginInlineEnd: 'auto',
  });

  assert.deepEqual(css('margin-inline-start: 5%; margin-inline-end: -2px'), {
    marginInlineStart: '5%',
    marginInlineEnd: -2,
  });

  assert.deepEqual(css('position: absolute; inset-inline: 0 12px'), {
    position: 'absolute',
    insetInlineStart: 0,
    insetInlineEnd: 12,
  });

  assert.deepEqual(css('inset-inline-start: 10%; inset-inline-end: auto'), {
    insetInlineStart: '10%',
    insetInlineEnd: 'auto',
  });

  assert.deepEqual(css('padding-block: 2px 3px; margin-block-start: 4px; inset-block-end: 0'), {
    paddingTop: 2,
    paddingBottom: 3,
    marginTop: 4,
    bottom: 0,
  });

  assert.deepEqual(inline("{ paddingInline: '8px', insetInlineEnd: 0 }"), {
    paddingInlineStart: 8,
    paddingInlineEnd: 8,
    insetInlineEnd: 0,
  });

  assert.throws(() => css('padding-inline-start: -1px'), /must not be negative|non-negative/);

  assert.throws(() => css('padding-inline: 1px 2px 3px'), /padding-inline takes one or two values/);
});

test('gaps, overflow, direction and box sizing are layout props', () => {
  assert.deepEqual(css('gap: 8px 16px'), { rowGap: 8, columnGap: 16 });
  assert.deepEqual(css('gap: 4px; row-gap: 10%'), { rowGap: '10%', columnGap: 4 });

  assert.deepEqual(css('overflow: scroll; direction: rtl; box-sizing: content-box'), {
    overflow: 'scroll',
    direction: 'rtl',
    boxSizing: 'content-box',
  });

  assert.deepEqual(css('align-self: baseline; flex-line-count: 2'), {
    alignSelf: 'baseline',
    flexLineCount: 2,
  });
});

test('border and box-shadow shorthands become native border and shadow props', () => {
  assert.deepEqual(css('border: 1px solid #ffffff22'), {
    borderWidth: 1,
    borderColor: '#ffffff22',
  });

  assert.deepEqual(css('border-width: 2px; border-color: #ff0000; border-radius: 20px'), {
    borderWidth: 2,
    borderColor: '#ff0000',
    borderRadius: 20,
  });

  assert.deepEqual(css('box-shadow: 0 12px 32px #00000066'), {
    shadowOffsetX: 0,
    shadowOffsetY: 12,
    shadowRadius: 16,
    shadowColor: '#00000066',
  });

  assert.throws(() => css('border: 1px dashed #fff'), /Only solid borders are supported/);
});

test('background accepts a color or a linear gradient', () => {
  assert.deepEqual(css('background: #0b1220'), { backgroundColor: '#0b1220' });

  assert.deepEqual(css('background: linear-gradient(135deg, #1e3a5f, #0b1220)'), {
    backgroundGradient: { angle: 135, colors: ['#1e3a5f', '#0b1220'] },
  });

  assert.deepEqual(css('background: linear-gradient(to bottom, #fff, #eee, #ddd)'), {
    backgroundGradient: { angle: 180, colors: ['#fff', '#eee', '#ddd'] },
  });

  assert.throws(() => css('background: radial-gradient(#fff, #000)'), /linear-gradient/);
});

test('typography covers family, weight, style, spacing, alignment and case', () => {
  assert.deepEqual(css("font-family: 'Avenir Next'; font-weight: 600; font-style: italic"), {
    fontFamily: 'Avenir Next',
    fontWeight: 600,
    fontStyle: 'italic',
  });

  assert.deepEqual(css('font-weight: bold'), { fontWeight: 700 });

  assert.deepEqual(css('letter-spacing: 0.5px; text-align: center; text-transform: uppercase'), {
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  });

  assert.deepEqual(css('line-height: 22px'), { lineHeight: 22 });

  assert.deepEqual(
    css('line-height: 1.4'),
    { lineHeight: { __kuitoLength: 'em', factor: 1.4 } },
    'unitless line-height scales with the font',
  );

  assert.deepEqual(css('-webkit-line-clamp: 2'), { lineClamp: 2 });

  assert.throws(
    () => css('font-weight: 450'),
    /font-weight must be normal, bold or 100-900 in steps of 100/,
  );
});

test('transform lists become individual animatable transform props', () => {
  assert.deepEqual(css('transform: translateY(4px) scale(0.98) rotate(2deg)'), {
    translateY: 4,
    scale: 0.98,
    rotate: 2,
  });

  assert.deepEqual(css('transform: translate(3px, -6px) scaleX(1.1) rotate(0.5turn)'), {
    translateX: 3,
    translateY: -6,
    scaleX: 1.1,
    rotate: 180,
  });

  assert.throws(() => css('transform: skewX(10deg)'), /Unsupported transform skewX/);
});

test('transition shorthand compiles timing curves, springs and delays per property', () => {
  assert.deepEqual(
    css('transition: transform 400ms spring(14, 180), opacity 250ms ease-out 50ms'),
    {
      transition: {
        transform: { type: 'spring', damping: 14, stiffness: 180, mass: 1, delay: 0 },
        opacity: { type: 'timing', duration: 250, easing: [0, 0, 0.58, 1], delay: 50 },
      },
    },
  );

  assert.deepEqual(
    css('transition: background-color 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)').transition,
    { backgroundColor: { type: 'timing', duration: 300, easing: [0.2, 0.8, 0.2, 1], delay: 0 } },
  );

  assert.deepEqual(css('transition: all 200ms').transition, {
    all: { type: 'timing', duration: 200, easing: [0.25, 0.1, 0.25, 1], delay: 0 },
  });

  assert.deepEqual(
    css(
      'transition: border-radius 200ms, border-color 200ms, box-shadow 200ms, width 1s, height 1s',
    ).transition,
    {
      borderRadius: { type: 'timing', duration: 200, easing: [0.25, 0.1, 0.25, 1], delay: 0 },
      borderColor: { type: 'timing', duration: 200, easing: [0.25, 0.1, 0.25, 1], delay: 0 },
      shadow: { type: 'timing', duration: 200, easing: [0.25, 0.1, 0.25, 1], delay: 0 },
      width: { type: 'timing', duration: 1000, easing: [0.25, 0.1, 0.25, 1], delay: 0 },
      height: { type: 'timing', duration: 1000, easing: [0.25, 0.1, 0.25, 1], delay: 0 },
    },
  );

  assert.throws(() => css('transition: margin 200ms ease'), /margin cannot be animated natively/);
  assert.throws(() => css('transition: opacity 200ms bouncy'), /Unknown timing function bouncy/);
});

test('names inherited from Object.prototype are rejected, not looked up', () => {
  assert.throws(() => css('transform: constructor(1)'), /Unsupported transform constructor/);
  assert.throws(() => css('transition: constructor 1s'), /constructor cannot be animated/);
  assert.throws(() => css('transition: opacity 1s toString'), /Unknown timing function toString/);
  assert.throws(() => css('rotate: 1constructor'), /rotate requires deg, rad or turn/);

  assert.throws(
    () => css('background: linear-gradient(to constructor, #fff, #000)'),
    /linear-gradient direction must be/,
  );

  assert.throws(() => css('text-align: constructor'), /text-align must be one of/);
  assert.throws(() => css('font-weight: toString'), /font-weight must be normal, bold/);
});

test('an em box-shadow blur stays font-relative, halved like a pixel blur', () => {
  assert.deepEqual(css('box-shadow: 0 0 1em #000'), {
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowRadius: { __kuitoLength: 'em', factor: 0.5 },
    shadowColor: '#000',
  });
});

test('styles() accepts the same properties in camelCase, including shorthand strings', () => {
  assert.deepEqual(
    inline("{ padding: '20px 24px', boxShadow: '0 12px 32px #00000066', fontWeight: 600 }"),
    { ...css('padding: 20px 24px; box-shadow: 0 12px 32px #00000066; font-weight: 600') },
  );

  assert.deepEqual(
    inline(
      "{ transform: 'scale(0.96)', transition: 'transform 300ms ease-in-out', translateX: -2 }",
    ),
    {
      scale: 0.96,
      translateX: -2,
      transition: {
        transform: { type: 'timing', duration: 300, easing: [0.42, 0, 0.58, 1], delay: 0 },
      },
    },
  );

  assert.deepEqual(inline("{ background: 'linear-gradient(90deg, #a1c4fd, #c2e9fb)' }"), {
    backgroundGradient: { angle: 90, colors: ['#a1c4fd', '#c2e9fb'] },
  });
});

test('existing scalar properties keep their meaning', () => {
  assert.deepEqual(
    css(
      'background-color: #123456; border-radius: 14px; font-size: 17px; opacity: 0.9; gap: 8px; display: none',
    ),
    {
      backgroundColor: '#123456',
      borderRadius: 14,
      fontSize: 17,
      opacity: 0.9,
      rowGap: 8,
      columnGap: 8,
      hidden: true,
    },
  );
});

test('each CSS property names the manifest props it writes, and writes no others', () => {
  const samples: Partial<Record<string, string>> = {
    background: 'linear-gradient(to right, red, blue)',
    'aspect-ratio': '16 / 9',
    display: 'none',
    'font-weight': 'bold',
    'line-height': '1.5',
    '-webkit-line-clamp': '2',
    'number-of-lines': '2',
    'flex-line-count': '2',
    transform: 'translateX(4px) scale(2) rotate(1turn)',
    transition: 'opacity 200ms',
    'box-shadow': '0 2px 4px #000',
    border: '1px solid red',
    'flex-flow': 'row wrap',
    hidden: 'true',
    overflow: 'hidden',
    direction: 'rtl',
    'box-sizing': 'border-box',
    position: 'absolute',
    'flex-direction': 'row',
    'flex-wrap': 'wrap',
    'flex-grow': '1',
    'flex-shrink': '1',
    flex: '1',
    'align-items': 'center',
    'align-self': 'center',
    'align-content': 'center',
    'justify-content': 'center',
    'text-align': 'center',
    'text-transform': 'uppercase',
    'border-color': 'red',
    'shadow-color': 'red',
  };

  for (const [name, spec] of Object.entries(STYLE_PROPERTIES)) {
    for (const prop of spec.native) assert(Object.hasOwn(PROPS, prop), `${name} writes ${prop}`);

    const value = samples[name] ?? sampleFor(spec.category);
    const written = Object.keys(expandStyle(name, value));

    assert(written.length > 0, `${name}: ${value} writes nothing`);

    for (const prop of written)
      assert(
        spec.native.some((listed) => listed === prop),
        `${name} writes ${prop} unlisted`,
      );
  }
});

test('docs/styles.md lists every CSS property', () => {
  const table = generateStyleDocs(
    readFileSync(new URL('../docs/styles.md', import.meta.url), 'utf8'),
  );

  for (const name of Object.keys(STYLE_PROPERTIES))
    assert.match(table, new RegExp('`' + name + '`'));
});

/** A value each category's properties accept. */
function sampleFor(category: string): string {
  const samples: Partial<Record<string, string>> = {
    color: 'red',
    opacity: '0.5',
    font: 'italic',
    transformParts: '2',
  };

  return samples[category] ?? '4px';
}
