/**
 * The Intl formats Hermes lacks that call the platform's locale data
 * (docs/web-apis.md#intl), installed only where the app names one: a module
 * whose source mentions `RelativeTimeFormat`, `ListFormat` or `DisplayNames`
 * imports its installer first, so it is on `Intl` before the module runs and
 * a bundle that names none links none of the IntlFormats module. The source
 * is matched as text: a comment or a type that names one installs it too,
 * and a name built at run time (`Intl['List' + 'Format']`) is not seen.
 */
import { fileURLToPath } from 'node:url';
import MagicString from 'magic-string';
import type { Plugin } from 'rolldown';

const INTL = fileURLToPath(new URL('../native/intl/', import.meta.url));

const INSTALLERS: Record<string, string> = {
  RelativeTimeFormat: INTL + 'install-relative-time-format.ts',
  ListFormat: INTL + 'install-list-format.ts',
  DisplayNames: INTL + 'install-display-names.ts',
};

const NAMED = /\b(RelativeTimeFormat|ListFormat|DisplayNames)\b/g;

/** Script modules only: JSON, styles and virtual modules take no import. */
const SCRIPT = /\.[cm]?[jt]sx?$/;

/** A hashbang stays the first line. */
const HASHBANG = /^#![^\n]*\n?/;

export function createIntlFormatsPlugin(): Plugin {
  return {
    name: 'kuito-intl-formats',
    transform(code: string, id: string) {
      // The formats' own modules define them.
      if (id.startsWith('\0') || id.startsWith(INTL) || !SCRIPT.test(id.split('?')[0])) return null;

      const named = new Set([...code.matchAll(NAMED)].map(([name]) => name));

      if (!named.size) return null;

      const source = new MagicString(code);
      const imports = [...named]
        .map((name) => `import ${JSON.stringify(INSTALLERS[name])};\n`)
        .join('');
      const hashbang = HASHBANG.exec(code)?.[0].length ?? 0;

      if (hashbang) source.appendLeft(hashbang, imports);
      else source.prepend(imports);

      return { code: source.toString(), map: source.generateMap({ hires: true }) };
    },
  };
}
