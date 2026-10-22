#!/usr/bin/env node
// Rebuilds native/headless/headless.wasm, the shared C++ the headless host
// runs (src/cli/headless-wasm.ts), after a change to what it is built from.
import { relative } from 'node:path';
import { buildHeadlessWasm } from '../src/cli/headless-wasm.ts';

console.log('Built ' + relative(process.cwd(), await buildHeadlessWasm()));
