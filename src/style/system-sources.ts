/**
 * The modules a stylesheet imports when its classes follow the system: each
 * provides a platform signal the kernel resolves their conditions with
 * (src/native/media/), so an app links only what its styles read.
 */
import { fileURLToPath } from 'node:url';

const SOURCES = {
  colorScheme: {
    file: fileURLToPath(new URL('../native/media/color-scheme.ts', import.meta.url)),
    provide: 'provideColorScheme',
  },
  windowWidth: {
    file: fileURLToPath(new URL('../native/media/window-width.ts', import.meta.url)),
    provide: 'provideWindowWidth',
  },
};

interface Query {
  colorScheme?: unknown;
  minWidth?: unknown;
  maxWidth?: unknown;
  widthClass?: unknown;
}

/** What a stylesheet's output branches on, as the kernel installs it. */
interface Conditions {
  themes?: { dark: Record<string, unknown> };
  when?: Record<string, readonly { media: Query }[]>;
}

/**
 * The code a stylesheet's starts with: for each platform signal its classes
 * follow, the import of what provides it, and the call.
 */
export function systemSources({ themes, when = {} }: Conditions): string {
  const queries = Object.values(when).flatMap((alternates) => alternates.map(({ media }) => media));
  const follows = {
    colorScheme:
      Object.keys(themes?.dark ?? {}).length > 0 ||
      queries.some((query) => query.colorScheme !== undefined),
    windowWidth: queries.some(
      (query) =>
        query.minWidth !== undefined ||
        query.maxWidth !== undefined ||
        query.widthClass !== undefined,
    ),
  };

  return (Object.keys(SOURCES) as (keyof typeof SOURCES)[])
    .filter((source) => follows[source])
    .map((source) => {
      const { file, provide } = SOURCES[source];

      return `import { ${provide} } from ${JSON.stringify(file)};\n${provide}();\n`;
    })
    .join('');
}
