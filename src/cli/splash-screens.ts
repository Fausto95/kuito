/**
 * Splash screens (docs/splash.md): the config's `splash` becomes each
 * platform's launch screen, written into the app's `.kuito/`. The generators
 * are pure (sources in, files out); `writeSplashScreen` reads and writes, and
 * skips both when nothing changed. The approach follows react-native-bootsplash.
 */
import { contain, decodePng, encodePng, pad, type Image } from './png.ts';
import { writeStamped, type Generated, type Read } from './generated.ts';
import type { Platform } from './config.ts';
import type { AppConfig, IconSource, SplashConfig, SplashLook } from './kuito-config.ts';

/**
 * The brand's box and its distance from the bottom of the screen, in points
 * and dp: what Android 12's SplashScreen gives a branding image, used on every
 * platform so the splash looks the same everywhere.
 */
export const BRAND = { width: 200, height: 80, bottom: 60 };

// Android 12 draws a splash icon without a background in a 288dp box and
// shows the 192dp circle in its middle.
const ICON_DP = 288;
const CIRCLE_DP = 192;

/** xxxhdpi, the densest screens either platform draws a splash for. */
const MAX_SCALE = 4;

const IOS_SCALES = [2, 3];
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** A look's images, decoded once and checked for the sizes they are drawn at. */
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
        { cause: error },
      );
    }

    loaded.set(source.path, image);

    return image;
  };
}

/** The logo's box in points: `logoWidth` wide, as tall as the light logo's shape makes it. */
const logoBox = (look: SplashLook, logo: Image) => ({
  width: look.logoWidth,
  height: Math.max(1, Math.round((look.logoWidth * logo.height) / logo.width)),
});

/** The brand's size inside its box, in points. */
function brandFit(brand: Image) {
  const scale = Math.min(BRAND.width / brand.width, BRAND.height / brand.height);

  return { width: brand.width * scale, height: brand.height * scale };
}

/** The look's images, decoded and big enough for the densest screens. */
function images(look: SplashLook, read: (source: IconSource) => Image) {
  const logo = read(look.logo);
  const box = logoBox(look, logo);
  const logoSource = (source: IconSource) => {
    const image = read(source);

    if (image.width < box.width * MAX_SCALE)
      throw new Error(
        `${source.origin} is ${image.width}×${image.height}: a ${look.logoWidth}-point-wide splash logo needs at least ${box.width * MAX_SCALE} pixels across, for the densest screens`,
      );

    return image;
  };
  const brandSource = (source: IconSource) => {
    const image = read(source);
    const fit = brandFit(image);
    const width = Math.ceil(fit.width * MAX_SCALE);
    const height = Math.ceil(fit.height * MAX_SCALE);

    if (image.width < width || image.height < height)
      throw new Error(
        `${source.origin} is ${image.width}×${image.height}: the brand needs at least ${width}×${height} pixels, its ${BRAND.width}×${BRAND.height} box on the densest screens`,
      );

    return image;
  };

  return {
    box,
    logo: logoSource(look.logo),
    darkLogo: look.dark.logo && logoSource(look.dark.logo),
    brand: look.brand && brandSource(look.brand),
    darkBrand: look.dark.brand && brandSource(look.dark.brand),
  };
}

type Images = ReturnType<typeof images>;

/** Every look of a splash, keyed by its variant; `null` is the default one. */
const looks = (splash: SplashConfig): [string | null, SplashLook][] => [
  [null, splash],
  ...Object.entries(splash.variants),
];

// iOS

const catalog = (value: object) => JSON.stringify(value, null, 2) + '\n';
const INFO = { author: 'kuito', version: 1 };
const DARK = [{ appearance: 'luminosity', value: 'dark' }];

const components = (color: string) => ({
  red: '0x' + color.slice(1, 3).toUpperCase(),
  green: '0x' + color.slice(3, 5).toUpperCase(),
  blue: '0x' + color.slice(5, 7).toUpperCase(),
  alpha: '1.000',
});

function colorSet(light: string, dark: string | null) {
  const color = (value: string) => ({ 'color-space': 'srgb', components: components(value) });

  return catalog({
    colors: [
      { color: color(light), idiom: 'universal' },
      ...(dark ? [{ appearances: DARK, color: color(dark), idiom: 'universal' }] : []),
    ],
    info: INFO,
  });
}

/** An image set at 2x and 3x, and its dark appearance; each drawn into `width`×`height` points. */
function imageSet(
  files: Generated['files'],
  set: string,
  name: string,
  [light, dark]: [Image, Image | null],
  width: number,
  height: number,
) {
  const images = [];

  for (const [image, suffix, appearances] of [
    [light, '', null],
    [dark, '-dark', DARK],
  ] as const) {
    if (!image) continue;

    for (const scale of IOS_SCALES) {
      const filename = `${name}${suffix}@${scale}x.png`;

      files[`Splash.xcassets/${set}.imageset/${filename}`] = encodePng(
        contain(image, Math.round(width * scale), Math.round(height * scale)),
      );

      images.push({
        ...(appearances && { appearances }),
        filename,
        idiom: 'universal',
        scale: `${scale}x`,
      });
    }
  }

  files[`Splash.xcassets/${set}.imageset/Contents.json`] = catalog({ images, info: INFO });
}

// The frames IB shows the storyboard at; Auto Layout places the views at launch.
const DEVICE = { width: 393, height: 852 };

function storyboard(look: SplashLook, { box, brand }: Images) {
  const logo = {
    x: (DEVICE.width - box.width) / 2,
    y: (DEVICE.height - box.height) / 2,
  };
  const brandView = brand
    ? `
                            <imageView userInteractionEnabled="NO" tag="2" contentMode="scaleToFill" image="SplashBrand" translatesAutoresizingMaskIntoConstraints="NO" id="Vsp-Br-and">
                                <rect key="frame" x="${(DEVICE.width - BRAND.width) / 2}" y="${DEVICE.height - BRAND.bottom - BRAND.height}" width="${BRAND.width}" height="${BRAND.height}"/>
                                <constraints>
                                    <constraint firstAttribute="width" constant="${BRAND.width}" id="Vsp-Br-wid"/>
                                    <constraint firstAttribute="height" constant="${BRAND.height}" id="Vsp-Br-hei"/>
                                </constraints>
                            </imageView>`
    : '';
  const brandConstraints = brand
    ? `
                            <constraint firstItem="Vsp-Br-and" firstAttribute="centerX" secondItem="Vsp-Vi-ew0" secondAttribute="centerX" id="Vsp-Br-cnx"/>
                            <constraint firstItem="Vsp-Vi-ew0" firstAttribute="bottom" secondItem="Vsp-Br-and" secondAttribute="bottom" constant="${BRAND.bottom}" id="Vsp-Br-bot"/>`
    : '';
  const brandResource = brand
    ? `
        <image name="SplashBrand" width="${BRAND.width}" height="${BRAND.height}"/>`
    : '';
  const [r, g, b] = [1, 3, 5].map((at) =>
    (parseInt(look.background.slice(at, at + 2), 16) / 255).toFixed(3),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by kuito from kuito.config.ts (docs/splash.md). The shell
     instantiates this storyboard again at launch and keeps it over the app
     until it hides, so tags 1 and 2 name the logo and the brand. -->
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="23504" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="Vsp-Co-ntr">
    <device id="retina6_12" orientation="portrait" appearance="light"/>
    <dependencies>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="23506"/>
        <capability name="Named colors" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="Vsp-Sc-ene">
            <objects>
                <viewController id="Vsp-Co-ntr" sceneMemberID="viewController">
                    <view key="view" userInteractionEnabled="NO" contentMode="scaleToFill" id="Vsp-Vi-ew0">
                        <rect key="frame" x="0.0" y="0.0" width="${DEVICE.width}" height="${DEVICE.height}"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <subviews>
                            <imageView userInteractionEnabled="NO" tag="1" contentMode="scaleToFill" image="SplashLogo" translatesAutoresizingMaskIntoConstraints="NO" id="Vsp-Lo-go0">
                                <rect key="frame" x="${logo.x}" y="${logo.y}" width="${box.width}" height="${box.height}"/>
                                <constraints>
                                    <constraint firstAttribute="width" constant="${box.width}" id="Vsp-Lo-wid"/>
                                    <constraint firstAttribute="height" constant="${box.height}" id="Vsp-Lo-hei"/>
                                </constraints>
                            </imageView>${brandView}
                        </subviews>
                        <color key="backgroundColor" name="SplashBackground"/>
                        <constraints>
                            <constraint firstItem="Vsp-Lo-go0" firstAttribute="centerX" secondItem="Vsp-Vi-ew0" secondAttribute="centerX" id="Vsp-Lo-cnx"/>
                            <constraint firstItem="Vsp-Lo-go0" firstAttribute="centerY" secondItem="Vsp-Vi-ew0" secondAttribute="centerY" id="Vsp-Lo-cny"/>${brandConstraints}
                        </constraints>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="Vsp-Fi-rst" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
        </scene>
    </scenes>
    <resources>
        <image name="SplashLogo" width="${box.width}" height="${box.height}"/>${brandResource}
        <namedColor name="SplashBackground">
            <color red="${r}" green="${g}" blue="${b}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
        </namedColor>
    </resources>
</document>
`;
}

/**
 * `Splash.storyboard`, the launch screen Info.plist's UILaunchStoryboardName
 * names, and `Splash.xcassets`, its images and color with their dark
 * appearances. iOS has one launch screen: variants are Android's.
 */
export function iosSplashScreen(config: AppConfig, read: Read): Generated | null {
  const { splash } = config;

  if (!splash) return null;

  const look = images(splash, loader(read));
  const files: Generated['files'] = {
    'Splash.storyboard': storyboard(splash, look),
    'Splash.xcassets/Contents.json': catalog({ info: INFO }),
    'Splash.xcassets/SplashBackground.colorset/Contents.json': colorSet(
      splash.background,
      splash.dark.background,
    ),
  };

  imageSet(
    files,
    'SplashLogo',
    'logo',
    [look.logo, look.darkLogo],
    look.box.width,
    look.box.height,
  );

  if (look.brand)
    imageSet(
      files,
      'SplashBrand',
      'brand',
      [look.brand, look.darkBrand],
      BRAND.width,
      BRAND.height,
    );

  return { files, warnings: [] };
}

// Android

const xml = (body: string) => `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by kuito from kuito.config.ts (docs/splash.md). -->
${body}
`;

/** Resource names of a look: `kuito_splash` and its theme, or a variant's. */
const names = (variant: string | null) => ({
  prefix: variant ? `kuito_splash_${variant}` : 'kuito_splash',
  theme: variant ? `Theme.Kuito.Splash.${variant}` : 'Theme.Kuito.Splash',
  // The app's own theme (src/cli/shells.ts androidThemes), so the starting
  // window shares its items; the splash replaces what it draws.
  parent: variant ? 'Theme.Kuito.Splash' : '@style/AppTheme',
});

/** Whether a background is light enough for dark status bar icons. */
function isLight(color: string) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16) / 255);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

function layers(prefix: string, { box, brand }: Images) {
  const items = [
    `<item android:drawable="@color/${prefix}_background" />`,
    `<item android:width="${box.width}dp" android:height="${box.height}dp" android:gravity="center" android:drawable="@drawable/${prefix}_logo" />`,
    ...(brand
      ? [
          `<item android:width="${BRAND.width}dp" android:height="${BRAND.height}dp" android:gravity="bottom|center_horizontal" android:bottom="${BRAND.bottom}dp" android:drawable="@drawable/${prefix}_brand" />`,
        ]
      : []),
  ];

  return xml(`<layer-list xmlns:android="http://schemas.android.com/apk/res/android" android:opacity="opaque">
${items.map((item) => `    ${item}\n`).join('')}</layer-list>`);
}

const item = (name: string, value: string) => `        <item name="${name}">${value}</item>\n`;

/** A look's theme: the window background before Android 12, and the SplashScreen API's attributes on it. */
function theme(variant: string | null, brand: boolean, splashScreen: boolean) {
  const { prefix, theme, parent } = names(variant);
  const items = [
    item('android:windowBackground', `@drawable/${prefix}`),
    item('android:statusBarColor', '@android:color/transparent'),
    item('android:navigationBarColor', '@android:color/transparent'),
    item('android:windowLightStatusBar', `@bool/${prefix}_light_bars`),
    ...(splashScreen
      ? [
          item('android:windowSplashScreenBackground', `@color/${prefix}_background`),
          item('android:windowSplashScreenAnimatedIcon', `@drawable/${prefix}_icon`),
          item(
            'android:windowSplashScreenBrandingImage',
            brand ? `@drawable/${prefix}_brand` : '@null',
          ),
        ]
      : []),
  ];

  return `    <style name="${theme}" parent="${parent}">\n${items.join('')}    </style>\n`;
}

const colors = (prefix: string, background: string) =>
  `    <color name="${prefix}_background">${background}</color>\n` +
  `    <bool name="${prefix}_light_bars">${isLight(background)}</bool>\n`;

/** How far a logo of `box` reaches past the circle Android 12 shows, as a warning. */
function circleWarning(look: SplashLook, logo: Image, box: { width: number; height: number }) {
  if (Math.hypot(box.width, box.height) <= CIRCLE_DP) return [];

  const widest = Math.floor(CIRCLE_DP / Math.hypot(1, logo.height / logo.width));

  return [
    `${look.logo.origin} at ${box.width}×${box.height} reaches outside the ${CIRCLE_DP}dp circle Android 12 and later show of a splash icon, so its corners are cut there. Keep the logo's diagonal under ${CIRCLE_DP}: a logoWidth of ${widest} or less.`,
  ];
}

/**
 * Android resources: before Android 12 the starting window draws its theme's
 * window background, a layer list; Android 12 and later draw the theme's
 * SplashScreen attributes, the logo as a 288dp icon. Both place the logo and
 * the brand where the other does, and where the shell's overlay draws them.
 * `raw/kuito_splash.json` tells the shell the layout of each look.
 */
export function androidSplashScreen(config: AppConfig, read: Read): Generated | null {
  const { splash } = config;

  if (!splash) return null;

  const load = loader(read);
  const files: Generated['files'] = {};
  const warnings = new Set<string>();
  const values: string[] = [];
  const night: string[] = [];
  const v31: string[] = [];
  const layout: Record<string, object> = {};

  for (const [variant, look] of looks(splash)) {
    const { prefix } = names(variant);
    const found = images(look, load);
    const { box } = found;

    circleWarning(look, found.logo, box).forEach((warning) => warnings.add(warning));
    values.push(colors(prefix, look.background), theme(variant, Boolean(found.brand), false));
    v31.push(theme(variant, Boolean(found.brand), true));

    if (look.dark.background) night.push(colors(prefix, look.dark.background));

    files[`drawable/${prefix}.xml`] = layers(prefix, found);

    for (const [density, scale] of Object.entries(DENSITIES)) {
      const size = (points: number) => Math.round(points * scale);
      const logo = (image: Image) => contain(image, size(box.width), size(box.height));
      const draw = (qualifier: string, logoImage: Image | null, brandImage: Image | null) => {
        const directory = `drawable-${qualifier}${density}`;

        if (logoImage) {
          files[`${directory}/${prefix}_logo.png`] = encodePng(logo(logoImage));

          files[`${directory}/${prefix}_icon.png`] = encodePng(
            pad(logo(logoImage), size(ICON_DP), size(ICON_DP)),
          );
        }

        if (brandImage)
          files[`${directory}/${prefix}_brand.png`] = encodePng(
            contain(brandImage, size(BRAND.width), size(BRAND.height)),
          );
      };

      draw('', found.logo, found.brand);
      draw('night-', found.darkLogo, found.darkBrand);
    }

    const entry = {
      logo: box,
      brand: found.brand ? BRAND : null,
    };

    if (variant) layout[variant] = entry;
    else Object.assign(layout, entry, { variants: {} });
  }

  const resources = (entries: string[]) => xml(`<resources>\n${entries.join('')}</resources>`);

  files['values/kuito_splash.xml'] = resources(values);
  files['values-v31/kuito_splash.xml'] = resources(v31);

  if (night.length) files['values-night/kuito_splash.xml'] = resources(night);

  files['raw/kuito_splash.json'] = JSON.stringify({
    logo: layout.logo,
    brand: layout.brand,
    variants: Object.fromEntries(
      Object.keys(splash.variants).map((variant) => [variant, layout[variant]]),
    ),
  });

  return { files, warnings: [...warnings] };
}

const GENERATORS: Record<Platform, (config: AppConfig, read: Read) => Generated | null> = {
  ios: iosSplashScreen,
  android: androidSplashScreen,
};

/** Bump when the generated files change for the same sources and config. */
const FORMAT = 1;

/**
 * Generates `platform`'s launch screen into `directory` when the splash or
 * its images changed since the last build, and removes it when the config has
 * none. Returns the generated warnings, replayed when it was kept.
 */
export function writeSplashScreen(platform: Platform, config: AppConfig, directory: string) {
  return writeStamped(directory, { FORMAT, platform, splash: config.splash }, (read) =>
    GENERATORS[platform](config, read),
  );
}
