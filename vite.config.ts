import { defineConfig } from 'vite-plus';

// Generated or vendored output that is never hand-written.
const generated = [
  'dist/**',
  '.kuito/**',
  'node_modules/**',
  'native/ios/App/Resources/**',
  'native/android/app/src/main/assets/**',
  'native/android/**/build/**',
];

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    // Several suites compile C++ or bundle with Rolldown.
    testTimeout: 60_000,
    tags: [
      {
        name: 'macos',
        description:
          'Builds the iOS shell, which buildIOS refuses off macOS: skipped on other hosts',
        skip: process.platform !== 'darwin',
      },
    ],
  },
  lint: {
    // research/experiments holds raw Hermes probe inputs (global scripts, `print`).
    // The site's API examples are snippets; check-snippets.ts compiles them with the site's settings.
    ignorePatterns: [
      ...generated,
      'research/experiments/**',
      'apps/website/content/api/examples/**',
    ],
    options: { typeAware: true, typeCheck: true },
    jsPlugins: ['./lint/kuito-plugin.ts'],
    rules: {
      'kuito/padding-between-blocks': 'error',
    },
    overrides: [
      {
        // Code that runs on device Hermes, where loop bindings are shared.
        files: [
          'src/ui/**',
          'src/runtime/**',
          'src/ui-thread/**',
          'src/native/**',
          'demo/**',
          'templates/app/app/**',
        ],
        rules: { 'kuito/no-loop-closure': 'error' },
      },
      {
        // tsconfig.test.json resolves like a bundler so tests see the kernel's
        // types; Node still runs these files, so relative imports name the file.
        files: ['test/*.ts', 'test/support/**'],
        plugins: ['import'],
        rules: { 'import/extensions': ['error', 'always', { ignorePackages: true }] },
      },
    ],
  },
  fmt: {
    // scripts/generate-protocol.ts writes *.generated.* from src/protocol/manifest.ts.
    ignorePatterns: [...generated, '**/*.generated.*'],
    singleQuote: true,
    semi: true,
    printWidth: 100,
  },
});
