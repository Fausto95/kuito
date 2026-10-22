// The Components panel's page (src/dev/components-panel), as the dev server
// serves it: its HTML, and its script, bundled with Rolldown once per server.
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('./components-panel/panel.ts', import.meta.url));

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The page for one target (`page` is its id at /json/list). */
export function componentsHtml(page: string, title: string, token: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Components · ${escape(title)}</title>
<style>
  :root { color-scheme: light dark; --line: #8884; --muted: #888; --accent: #6366f1; --signal: #0e9f6e; --view: #d97706; font: 13px system-ui; }
  html, body, #panel { margin: 0; height: 100%; }
  #panel { display: flex; flex-direction: column; }
  header { display: flex; gap: 12px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  header button[aria-pressed="true"] { background: var(--accent); color: white; }
  .status { color: var(--muted); }
  main { flex: 1; display: flex; min-height: 0; }
  nav { width: 34%; min-width: 200px; overflow: auto; border-right: 1px solid var(--line); padding: 4px 0; }
  .node { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 3px 8px; font: 12px ui-monospace, monospace; color: inherit; cursor: pointer; }
  .node:hover { background: #8882; }
  .node.selected { background: var(--accent); color: white; }
  .key { color: var(--muted); }
  .node.selected .key { color: #fffc; }
  .details { flex: 1; overflow: auto; padding: 0 12px 12px; }
  section { border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  h2 { font-size: 13px; margin: 12px 0 6px; display: flex; justify-content: space-between; font-family: ui-monospace, monospace; }
  h3 { font-size: 11px; text-transform: uppercase; color: var(--muted); margin: 10px 0 4px; }
  .close { border: 0; background: none; color: var(--muted); cursor: pointer; font-size: 15px; }
  .row { display: flex; gap: 8px; align-items: baseline; padding: 2px 0; }
  .name { min-width: 110px; color: var(--muted); font-family: ui-monospace, monospace; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { border: 1px solid var(--line); border-radius: 10px; padding: 1px 8px; background: none; color: inherit; font: 12px ui-monospace, monospace; cursor: pointer; }
  .chip.signal { border-color: var(--signal); color: var(--signal); }
  .chip.view { border-color: var(--view); color: var(--view); }
  .chip.component { border-color: var(--accent); color: var(--accent); }
  .value { font: 12px ui-monospace, monospace; min-width: 160px; flex: 0 1 280px; border: 1px solid var(--line); border-radius: 4px; padding: 2px 4px; background: none; color: inherit; }
  code { font: 12px ui-monospace, monospace; }
  .kind, .empty { color: var(--muted); font-style: italic; }
  .task { display: flex; gap: 8px; }
  .error { color: #dc2626; }
</style>
</head>
<body data-page="${escape(page)}">
<div id="panel"></div>
<script src="/components/panel.js?token=${escape(encodeURIComponent(token))}"></script>
</body>
</html>
`;
}

let built: Promise<string> | null = null;

async function bundle(): Promise<string> {
  const { rolldown } = await import('rolldown');
  const build = await rolldown({ input: ENTRY, platform: 'browser', tsconfig: false });

  try {
    const { output } = await build.generate({ format: 'iife' });

    if (output.length !== 1 || output[0].type !== 'chunk')
      throw new Error('Expected one chunk for the Components panel');

    return output[0].code;
  } finally {
    await build.close();
  }
}

/** The panel's script; a failed build is retried by the next request. */
export function componentsScript(): Promise<string> {
  built ??= bundle().catch((error: unknown) => {
    built = null;
    throw error;
  });

  return built;
}
