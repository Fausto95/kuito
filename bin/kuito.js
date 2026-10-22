#!/usr/bin/env node
import './strip-types.js';

// Imported after the hooks are registered: a static import would load first.
await import('../scripts/kuito.ts');
