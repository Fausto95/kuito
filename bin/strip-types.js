// Node strips TypeScript's types itself, except from files under
// node_modules: there it throws ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING.
// Kuito ships its TypeScript sources, so a `kuito` installed from npm strips
// them here, the same way. Each Node process Kuito starts imports this first.
import { registerHooks, stripTypeScriptTypes } from 'node:module';

// The API's first call warns that it is experimental, in every process Kuito
// starts; the type stripping it shares with Node's own is not. Spend that
// one warning here, unseen.
const emitWarning = process.emitWarning.bind(process);

process.emitWarning = () => {};

try {
  stripTypeScriptTypes('');
} finally {
  process.emitWarning = emitWarning;
}

registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);

    if (loaded.format !== 'module-typescript' || !url.includes('/node_modules/')) return loaded;

    const source =
      typeof loaded.source === 'string' ? loaded.source : new TextDecoder().decode(loaded.source);

    return { ...loaded, format: 'module', source: stripTypeScriptTypes(source) };
  },
});
