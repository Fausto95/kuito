/**
 * App icons (docs/apps.md): the config's source PNGs become what each
 * platform's shell needs, written into the app's `.kuito/`. The generators
 * are pure (sources in, files out); `writeAppIcon` reads and writes, and
 * skips both when nothing changed (src/cli/generated.ts).
 */
import { writeStamped, type Generated, type Read } from './generated.ts';
import {
  composite,
  crop,
  decodePng,
  encodePng,
  flatten,
  hasTransparency,
  inset,
  resize,
  solid,
  type Image,
  type Rgb,
} from './png.ts';
import type { Platform } from './config.ts';
import type { AppConfig, IconSource } from './kuito-config.ts';

/** Generated files, by path under the platform's icon directory. */
export type IconOutput = Generated;

/** What App Store Connect takes and Xcode scales from. */
const MIN_SIZE = 1024;

function loader(read: Read) {
  const loaded = new Map<string, Image>();

  return (source: IconSource) => {
    const cached = loaded.get(source.path);

    if (cached) return cached;

    let image: Image;

    try {
      image = decodePng(read(source));
    } catch (error) {
      throw new Error(
        `${source.origin} is ${error instanceof Error ? error.message : String(error)}`,
        {
          cause: error,
        },
      );
    }

    if (image.width !== image.height || image.width < MIN_SIZE)
      throw new Error(
        `${source.origin} is ${image.width}×${image.height}: app icons need a square PNG of at least ${MIN_SIZE}×${MIN_SIZE}`,
      );

    loaded.set(source.path, image);

    return image;
  };
}

const WHITE = [255, 255, 255] as const;

/** Whether a platform's shell has an app icon: iOS needs its default appearance, Android a foreground. */
export const HAS_APP_ICON: Record<Platform, (config: AppConfig) => boolean> = {
  ios: ({ icon, ios }) => Boolean(ios.icon.light ?? icon),
  android: ({ icon, android }) => Boolean(android.adaptiveIcon.foreground ?? icon),
};

/** iOS 18's appearances of one single-size icon; only the default one must be opaque. */
const IOS_APPEARANCES = [
  { key: 'light', file: 'icon.png', appearance: null },
  { key: 'dark', file: 'icon-dark.png', appearance: 'dark' },
  { key: 'tinted', file: 'icon-tinted.png', appearance: 'tinted' },
] as const;

const catalog = (value: object) => JSON.stringify(value, null, 2) + '\n';

/** `AppIcon.xcassets`, the asset catalog the shell's ASSETCATALOG_COMPILER_APPICON_NAME names. */
export function iosAppIcon(config: AppConfig, read: Read): IconOutput | null {
  const sources = { ...config.ios.icon, light: config.ios.icon.light ?? config.icon };

  if (!sources.light) return null;

  const load = loader(read);
  const files: IconOutput['files'] = {};
  const warnings: string[] = [];
  const images = [];

  for (const { key, file, appearance } of IOS_APPEARANCES) {
    const source = sources[key];

    if (!source) continue;

    let image = resize(load(source), MIN_SIZE, MIN_SIZE);

    if (!appearance && hasTransparency(image)) {
      image = flatten(image, WHITE);

      warnings.push(
        `${source.origin} has transparency, which iOS app icons cannot have: it was flattened onto white. Export it without an alpha channel to choose the background.`,
      );
    }

    files[`AppIcon.appiconset/${file}`] = encodePng(image);

    images.push({
      ...(appearance && { appearances: [{ appearance: 'luminosity', value: appearance }] }),
      filename: file,
      idiom: 'universal',
      platform: 'ios',
      size: `${MIN_SIZE}x${MIN_SIZE}`,
    });
  }

  const info = { author: 'kuito', version: 1 };

  files['Contents.json'] = catalog({ info });
  files['AppIcon.appiconset/Contents.json'] = catalog({ images, info });

  return { files, warnings };
}

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// Adaptive icon layers are 108dp; launchers mask them to at most the middle
// 72dp and use the rest for parallax. Legacy icons are 48dp.
const LAYER_DP = 108;
const VISIBLE_DP = 72;
const LEGACY_DP = 48;

/** The top-left pixel as `#RRGGBB`, over white where it is transparent. */
function cornerColor({ data }: Image) {
  const alpha = data[3] / 255;
  const channel = (c: number) => Math.round(data[c] * alpha + 255 * (1 - alpha));

  return (
    '#' +
    [0, 1, 2]
      .map((c) => channel(c).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

const rgb = (color: string): Rgb => [
  parseInt(color.slice(1, 3), 16),
  parseInt(color.slice(3, 5), 16),
  parseInt(color.slice(5, 7), 16),
];

function adaptiveXml(background: string, monochrome: boolean) {
  const layers = [
    `<background android:drawable="${background}" />`,
    '<foreground android:drawable="@mipmap/ic_launcher_foreground" />',
    ...(monochrome ? ['<monochrome android:drawable="@mipmap/ic_launcher_monochrome" />'] : []),
  ];

  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
${layers.map((layer) => `    ${layer}\n`).join('')}</adaptive-icon>
`;
}

const colorXml = (color: string) => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${color}</color>
</resources>
`;

/**
 * Android resources: the adaptive icon every launcher since API 26 shows,
 * and the legacy square icons, composed from its layers, at every density.
 */
export function androidAppIcon(config: AppConfig, read: Read): IconOutput | null {
  const { foreground, background, monochrome } = config.android.adaptiveIcon;
  const load = loader(read);
  const icon = config.icon && load(config.icon);
  const scaled = (source: IconSource) => (size: number) => resize(load(source), size, size);

  // Without its own foreground, the whole icon fills the visible area, over
  // its own corner color.
  const front: ((size: number, scale: number) => Image) | null = foreground
    ? scaled(foreground)
    : icon
      ? (size, scale) => inset(icon, size, VISIBLE_DP * scale)
      : null;

  if (!front) return null;

  const image = typeof background === 'object' && background !== null ? scaled(background) : null;
  const color =
    typeof background === 'string'
      ? background
      : icon && !foreground
        ? cornerColor(icon)
        : '#FFFFFF';
  const back = image ?? ((size: number) => solid(size, size, rgb(color)));
  const files: IconOutput['files'] = {
    'mipmap-anydpi-v26/ic_launcher.xml': adaptiveXml(
      image ? '@mipmap/ic_launcher_background' : '@color/ic_launcher_background',
      Boolean(monochrome),
    ),
  };

  if (!image) files['values/ic_launcher_background.xml'] = colorXml(color);

  for (const [density, scale] of Object.entries(DENSITIES)) {
    const size = LAYER_DP * scale;
    const layers = { foreground: front(size, scale), background: back(size) };
    const visible = crop(composite(layers.background, layers.foreground), VISIBLE_DP * scale);
    const directory = `mipmap-${density}`;

    files[`${directory}/ic_launcher_foreground.png`] = encodePng(layers.foreground);

    files[`${directory}/ic_launcher.png`] = encodePng(
      resize(visible, LEGACY_DP * scale, LEGACY_DP * scale),
    );

    if (image) files[`${directory}/ic_launcher_background.png`] = encodePng(layers.background);

    if (monochrome)
      files[`${directory}/ic_launcher_monochrome.png`] = encodePng(scaled(monochrome)(size));
  }

  return { files, warnings: [] };
}

/** Each platform's generator, and the parts of the config it reads. */
const PLATFORMS: Record<
  Platform,
  {
    generate: (config: AppConfig, read: Read) => IconOutput | null;
    settings: (config: AppConfig) => Record<string, IconSource | string | null>;
  }
> = {
  ios: { generate: iosAppIcon, settings: ({ icon, ios }) => ({ icon, ...ios.icon }) },
  android: {
    generate: androidAppIcon,
    settings: ({ icon, android }) => ({ icon, ...android.adaptiveIcon }),
  },
};

/** Bump when the generated files change for the same sources and config. */
const FORMAT = 1;

/**
 * Generates `platform`'s icon into `directory` when its sources or config
 * changed since the last build, and removes it when the config has none.
 * Returns the warnings of the generated icon, replayed when it was kept.
 */
export function writeAppIcon(platform: Platform, config: AppConfig, directory: string) {
  const { generate, settings } = PLATFORMS[platform];

  return writeStamped(directory, { FORMAT, platform, used: settings(config) }, (read) =>
    generate(config, read),
  );
}
