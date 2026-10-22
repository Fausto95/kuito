/** Where the PR's earlier `/docs/<slug>` addresses now live, as `section/slug[#anchor]`. */
export const legacyRedirects: Record<string, string> = {
  introduction: 'guides/introduction',
  quickstart: 'guides/introduction#create-an-app',
  components: 'guides/primitives',
  reactivity: 'guides/reactivity',
  styling: 'language/styles',
  'web-apis': 'guides/web-apis',
  navigation: 'guides/navigation',
  motion: 'guides/motion',
  'native-modules': 'guides/native-modules',
  'app-icons': 'guides/splash',
  cli: 'cli/cli',
  architecture: 'architecture/overview',
  contributing: 'guides/contributing',
  'status-bar': 'components/SystemBars',
  'kill-criteria': 'architecture/overview',
};
