// docs/styles.md's property table, from the style compiler's own table: one
// row per category, its CSS properties, the native props they write and
// what they take. scripts/generate-protocol.ts writes it.
import { markdownTable } from '../protocol/generate.ts';
import { STYLE_CATEGORIES, STYLE_PROPERTIES, type StyleCategory } from './properties.ts';

export const STYLES_DOC = 'docs/styles.md';

const START = '<!-- style properties: generated from src/style/properties.ts -->';
const END = '<!-- end of generated style properties -->';

const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
const code = (name: string) => '`' + name + '`';

/** The native props a row writes, or `same` when each property writes its own camelCase name. */
function nativeColumn(names: readonly string[]): string {
  const native = [...new Set(names.flatMap((name) => STYLE_PROPERTIES[name].native))];
  const own = names.every((name) => native.some((prop) => prop === camel(name)));

  if (own && native.every((prop) => names.some((name) => camel(name) === prop)))
    return names.some((name) => name.includes('-')) ? 'same, in camelCase' : 'same';

  return native.map(code).join(', ');
}

export function generateStyleDocs(text: string): string {
  const start = text.indexOf(START);
  const end = text.indexOf(END, start);

  if (start === -1 || end === -1)
    throw new Error(`${STYLES_DOC} has no generated style properties region`);

  const categories = Object.keys(STYLE_CATEGORIES).filter((name): name is StyleCategory =>
    Object.hasOwn(STYLE_CATEGORIES, name),
  );
  const rows = categories.map((category) => {
    const names = Object.keys(STYLE_PROPERTIES).filter(
      (name) => STYLE_PROPERTIES[name].category === category,
    );

    if (!names.length)
      throw new Error(`src/style/properties.ts: no property is in category ${category}`);

    return [names.map(code).join(', '), nativeColumn(names), STYLE_CATEGORIES[category]];
  });

  return (
    text.slice(0, start) +
    START +
    '\n\n' +
    markdownTable([['CSS', 'Native props', 'Values'], ...rows]) +
    '\n\n' +
    text.slice(end)
  );
}
