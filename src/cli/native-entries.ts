/**
 * The one merge every entry in a generated shell's Info.plist, entitlements,
 * AndroidManifest.xml overlay and Android theme goes through. Each source
 * (the shell itself, kuito.config.ts's keys, native modules, the config's
 * raw escape hatch) is a contribution; two that disagree on a key are an
 * error naming both. Pure: contributions in, entries and their XML out.
 */
import type { AndroidProvider, AndroidReceiver, AndroidService } from './modules.ts';
import type { AndroidIntentData, AndroidIntentFilter, PlistDictionary } from './kuito-config.ts';

/**
 * Who a contribution comes from, which decides a disagreement: the shell's
 * entries are claimed outright, the app's typed settings replace a module's
 * defaults, the development shell's defaults give way to anything, and
 * anything else that disagrees is an error.
 */
export type ContributionKind = 'shell' | 'development' | 'app' | 'module' | 'raw';

const REPLACES: Record<ContributionKind, readonly ContributionKind[]> = {
  shell: [],
  development: [],
  app: ['module', 'development'],
  module: ['development'],
  raw: ['development'],
};

export interface ManifestEntries {
  /** `<application>` and `<activity>` attributes, by name without `android:`. */
  application: Record<string, string>;
  activity: Record<string, string>;
  metaData: Record<string, string>;
  usesPermissions: { name: string; maxSdk?: number }[];
  usesFeatures: { name: string; required: boolean }[];
  queries: { packages: string[]; intents: { action: string; data: AndroidIntentData }[] };
  intentFilters: AndroidIntentFilter[];
  /** `<service>`s under `<application>`, each its attributes by name without `android:`. */
  services: AndroidService[];
  /** `<provider>`s under `<application>`, with the resources their meta-data names. */
  providers: AndroidProvider[];
  /** `<receiver>`s under `<application>`, with the actions their intent filter takes. */
  receivers: AndroidReceiver[];
}

export interface NativeEntries {
  infoPlist: PlistDictionary;
  entitlements: PlistDictionary;
  manifest: ManifestEntries;
  /** `AppTheme` items, by name, in both its day and night variants. */
  theme: Record<string, string>;
}

export interface Contribution {
  /** Names it in errors: a config key, or a module's spec. */
  source: string;
  kind: ContributionKind;
  infoPlist?: PlistDictionary;
  entitlements?: PlistDictionary;
  manifest?: Partial<ManifestEntries>;
  theme?: Record<string, string>;
}

/** Lists that sources add to rather than set: each value once, in order. */
const ADDITIVE = new Set([
  'UIBackgroundModes',
  'UIAppFonts',
  'LSApplicationQueriesSchemes',
  'BGTaskSchedulerPermittedIdentifiers',
  'com.apple.developer.associated-domains',
]);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const isDictionary = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((each) => typeof each === 'string');

/** One keyed map (Info.plist, attributes, theme items...) across every contribution. */
function mergeKeyed<V>(
  contributions: readonly Contribution[],
  read: (contribution: Contribution) => Record<string, V> | undefined,
  label: string,
) {
  const merged: Record<string, V> = {};
  const setBy = new Map<string, Contribution>();

  for (const contribution of contributions)
    for (const [key, value] of Object.entries(read(contribution) ?? {})) {
      const earlier = setBy.get(key);
      const current = merged[key];
      const conflict = () =>
        new Error(`${label}${key} is set by both ${earlier?.source} and ${contribution.source}`);

      if (!earlier) {
        merged[key] = value;
        setBy.set(key, contribution);
      } else if (earlier.kind === 'shell' || contribution.kind === 'shell') {
        throw conflict();
      } else if (ADDITIVE.has(key) && isStrings(current) && isStrings(value)) {
        // Both are string lists, so the union is one too.
        merged[key] = [...new Set([...current, ...value])] as never;
      } else if (REPLACES[contribution.kind].includes(earlier.kind)) {
        // A development default stays under the keys of the dictionary replacing it.
        merged[key] =
          earlier.kind === 'development' && isDictionary(current) && isDictionary(value)
            ? ({ ...current, ...value } as never)
            : value;

        setBy.set(key, contribution);
      } else if (!same(current, value) && !REPLACES[earlier.kind].includes(contribution.kind)) {
        throw conflict();
      }
    }

  // The shell's own files already hold what it claims.
  for (const [key, contribution] of setBy) if (contribution.kind === 'shell') delete merged[key];

  return merged;
}

/** Each entry once, the first of any with the same `identity`. */
function joined<T>(lists: readonly (readonly T[] | undefined)[], identity: (each: T) => string) {
  const seen = new Map<string, T>();

  for (const each of lists.flat())
    if (each !== undefined && !seen.has(identity(each))) seen.set(identity(each), each);

  return [...seen.values()];
}

export function mergeEntries(contributions: readonly Contribution[]): NativeEntries {
  const manifests = contributions.map(({ manifest }) => manifest ?? {});
  const keyed = <V>(
    read: (contribution: Contribution) => Record<string, V> | undefined,
    label: string,
  ) => mergeKeyed(contributions, read, label);
  const attributes = (tag: 'application' | 'activity') =>
    keyed((c) => c.manifest?.[tag], `<${tag}> attribute android:`);

  return {
    infoPlist: keyed((c) => c.infoPlist, 'Info.plist key '),
    entitlements: keyed((c) => c.entitlements, 'entitlement '),
    manifest: {
      application: attributes('application'),
      activity: attributes('activity'),
      metaData: keyed((c) => c.manifest?.metaData, 'meta-data '),
      usesPermissions: joined(
        manifests.map((m) => m.usesPermissions),
        ({ name }) => name,
      ),
      usesFeatures: joined(
        manifests.map((m) => m.usesFeatures),
        ({ name }) => name,
      ),
      queries: {
        packages: joined(
          manifests.map((m) => m.queries?.packages),
          (name) => name,
        ),
        intents: joined(
          manifests.map((m) => m.queries?.intents),
          (each) => JSON.stringify(each),
        ),
      },
      intentFilters: joined(
        manifests.map((m) => m.intentFilters),
        (each) => JSON.stringify(each),
      ),
      services: joined(
        manifests.map((m) => m.services),
        ({ name }) => name,
      ),
      providers: joined(
        manifests.map((m) => m.providers),
        ({ attributes }) => attributes.name,
      ),
      receivers: joined(
        manifests.map((m) => m.receivers),
        ({ attributes }) => attributes.name,
      ),
    },
    theme: keyed((c) => c.theme, 'AppTheme item '),
  };
}

const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const attributes = (values: Record<string, string | number | undefined>) =>
  Object.entries(values)
    .flatMap(([name, value]) =>
      value === undefined ? [] : [` ${name}="${escape(String(value))}"`],
    )
    .join('');

const android = (values: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(values).map(([name, value]) => [`android:${name}`, value]));

const element = (
  indent: string,
  tag: string,
  values: Record<string, string | number | undefined>,
) => `${indent}<${tag}${attributes(values)} />`;

/**
 * The opening tag of an element the shell's manifest also declares: each
 * attribute it sets replaces the shell's, which the merger only allows
 * when told to (`tools:replace`).
 */
function overriding(indent: string, tag: string, values: Record<string, string>, name?: string) {
  const replaced = Object.keys(values).map((attribute) => `android:${attribute}`);

  return `${indent}<${tag}${attributes({
    'android:name': name,
    ...android(values),
    'tools:replace': replaced.length ? replaced.join(',') : undefined,
  })}>`;
}

function intentFilter(
  indent: string,
  { actions, categories, data, autoVerify }: AndroidIntentFilter,
) {
  const inner = indent + '    ';

  return [
    `${indent}<intent-filter${autoVerify ? ' android:autoVerify="true"' : ''}>`,
    ...actions.map((name) => element(inner, 'action', { 'android:name': name })),
    ...categories.map((name) => element(inner, 'category', { 'android:name': name })),
    ...data.map((each) => element(inner, 'data', android({ ...each }))),
    `${indent}</intent-filter>`,
  ];
}

function provider(indent: string, { attributes: values, resources }: AndroidProvider) {
  const { name, authorities, ...rest } = values;
  const inner = indent + '    ';

  return [
    `${indent}<provider${attributes(android({ name, authorities, ...rest }))}>`,
    ...Object.entries(resources).map(([key, resource]) =>
      element(inner, 'meta-data', { 'android:name': key, 'android:resource': resource }),
    ),
    `${indent}</provider>`,
  ];
}

function receiver(indent: string, { attributes: values, actions }: AndroidReceiver) {
  if (actions.length === 0) return [element(indent, 'receiver', android(values))];

  const inner = indent + '    ';

  return [
    `${indent}<receiver${attributes(android(values))}>`,
    `${inner}<intent-filter>`,
    ...actions.map((name) => element(inner + '    ', 'action', { 'android:name': name })),
    `${inner}</intent-filter>`,
    `${indent}</receiver>`,
  ];
}

const ACTIVITY = 'dev.kuito.runtime.KuitoActivity';

/** The overlay Gradle merges over the shell's AndroidManifest.xml. */
export function renderManifest(manifest: ManifestEntries) {
  const { application, activity, metaData, usesPermissions, usesFeatures, queries } = manifest;
  const { intentFilters, services, providers, receivers } = manifest;
  const queried = queries.packages.length + queries.intents.length > 0;

  return [
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">',
    ...usesPermissions.map(({ name, maxSdk }) =>
      element('    ', 'uses-permission', { 'android:name': name, 'android:maxSdkVersion': maxSdk }),
    ),
    ...usesFeatures.map(({ name, required }) =>
      element('    ', 'uses-feature', {
        'android:name': name,
        'android:required': String(required),
      }),
    ),
    ...(queried
      ? [
          '    <queries>',
          ...queries.packages.map((name) =>
            element('        ', 'package', { 'android:name': name }),
          ),
          ...queries.intents.flatMap(({ action, data }) => [
            '        <intent>',
            element('            ', 'action', { 'android:name': action }),
            ...(Object.keys(data).length
              ? [element('            ', 'data', android({ ...data }))]
              : []),
            '        </intent>',
          ]),
          '    </queries>',
        ]
      : []),
    overriding('    ', 'application', application),
    ...Object.entries(metaData).map(([name, value]) =>
      element('        ', 'meta-data', { 'android:name': name, 'android:value': value }),
    ),
    ...services.map((service) => element('        ', 'service', android(service))),
    ...providers.flatMap((each) => provider('        ', each)),
    ...receivers.flatMap((each) => receiver('        ', each)),
    overriding('        ', 'activity', activity, ACTIVITY),
    ...intentFilters.flatMap((filter) => intentFilter('            ', filter)),
    '        </activity>',
    '    </application>',
    '</manifest>',
    '',
  ].join('\n');
}

/** A themes.xml defining `AppTheme`, for `values` or `values-night`. */
export function renderTheme(parent: string, items: Record<string, string>) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<resources>',
    `    <style name="AppTheme" parent="${escape(parent)}">`,
    ...Object.entries(items).map(
      ([name, value]) => `        <item name="${escape(name)}">${escape(value)}</item>`,
    ),
    '    </style>',
    '</resources>',
    '',
  ].join('\n');
}
