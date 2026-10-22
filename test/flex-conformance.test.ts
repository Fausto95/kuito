import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Taffy's flexbox fixtures (generated from Chrome, see test/fixtures/taffy/README.md)
// run through Kuito's layout engine: the parity suite for native/shared/layout.

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = join(root, 'test/fixtures/taffy/flex');

interface Element {
  tag: string;
  attributes: Record<string, string>;
  children: Element[];
  text: string | null;
}

/** Just enough XML for the fixtures: elements, double-quoted attributes and text. */
function parseXml(source: string): Element {
  let index = 0;
  const document: Element = { tag: '#document', attributes: {}, children: [], text: null };
  const stack = [document];

  while (index < source.length) {
    const open = source.indexOf('<', index);
    const text = source.slice(index, open === -1 ? source.length : open);
    const parent = stack[stack.length - 1];

    if (text.length && parent) parent.text = (parent.text ?? '') + text;
    if (open === -1) break;

    const close = source.indexOf('>', open);
    const tag = source.slice(open + 1, close);

    index = close + 1;

    if (tag.startsWith('/')) {
      stack.pop();
      continue;
    }

    const selfClosing = tag.endsWith('/');
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const name = body.split(/\s/)[0] ?? '';
    const attributes: Record<string, string> = {};

    for (const match of body.matchAll(/([\w-]+)="([^"]*)"/g))
      attributes[match[1] ?? ''] = match[2] ?? '';

    const element: Element = { tag: name, attributes, children: [], text: null };

    parent?.children.push(element);
    if (!selfClosing) stack.push(element);
  }

  return document;
}

const child = (element: Element, tag: string) => element.children.find((c) => c.tag === tag);

/** Layout modes Kuito does not have: block, grid, vertical text. */
const otherLayoutModes = (source: string) => /display="(block|grid)"|writing-mode=/.test(source);

/**
 * A box without `position` is static in CSS, so an absolute child is laid out
 * by the nearest positioned ancestor instead. Like React Native, every Kuito
 * view is the containing block of its absolute children.
 */
function hoistsAbsoluteBoxes(element: Element): boolean {
  const isStatic = element.tag !== '#document' && !('position' in element.attributes);

  return element.children.some(
    (c) => (isStatic && c.attributes.position === 'absolute') || hoistsAbsoluteBoxes(c),
  );
}

function outOfScope(source: string) {
  const root = child(child(parseXml(source), 'test') ?? parseXml(''), 'input')?.children[0];

  return otherLayoutModes(source) || (root !== undefined && hoistsAbsoluteBoxes(root));
}

interface Expected {
  name: string;
  boxes: number[][];
}

function serialize(file: string, out: string[], expected: Expected[]) {
  const source = readFileSync(join(fixtures, file), 'utf8');
  const testElement = child(parseXml(source), 'test');

  if (!testElement) throw new Error(`No <test> in ${file}`);

  const viewport = child(testElement, 'viewport')?.attributes ?? {};
  const input = child(testElement, 'input')?.children[0];
  const expectation = child(testElement, 'expectations')?.children[0];

  if (!input || !expectation) throw new Error(`Malformed fixture ${file}`);

  out.push(`test ${file}`);
  out.push(`viewport ${viewport.width ?? 'max-content'} ${viewport.height ?? 'max-content'}`);
  out.push(`rounding ${testElement.attributes['use-rounding'] === 'false' ? 0 : 1}`);

  const walk = (element: Element, depth: number) => {
    const fields = Object.entries(element.attributes).map(([key, value]) => `${key}=${value}`);
    const leaf = element.children.length === 0;

    if (leaf && element.text !== null) fields.push(`text=${element.text.trim()}`);
    out.push(`node ${depth}\t${fields.join('\t')}`);
    element.children.forEach((c) => walk(c, depth + 1));
  };

  walk(input, 0);
  out.push('end');

  const boxes: number[][] = [];
  const collect = (node: Element) => {
    const { x, y, width, height } = node.attributes;

    boxes.push([Number(x), Number(y), Number(width), Number(height)]);
    node.children.forEach(collect);
  };

  collect(expectation);
  expected.push({ name: file, boxes });
}

/** Compiles the conformance driver into `tmp`; null without a C++ compiler. */
function build(tmp: string): string | null {
  const cc = process.env.CXX || 'c++';

  if (spawnSync(cc, ['--version']).error) return null;

  const exe = join(tmp, 'flex-conformance');
  const sources = ['FlexLayout.cpp', 'Flexbox.cpp', 'Absolute.cpp', 'Balance.cpp'].map((file) =>
    join(root, 'native/shared/layout', file),
  );
  const compile = spawnSync(
    cc,
    [
      '-std=c++17',
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-I',
      join(root, 'native/shared'),
      ...sources,
      join(root, 'test/flex-conformance.cpp'),
      '-o',
      exe,
    ],
    { encoding: 'utf8' },
  );

  assert.equal(compile.status, 0, compile.stderr);

  return exe;
}

/** The in-scope fixtures as the driver reads them, and their expected boxes. */
function inScopeFixtures() {
  const files = readdirSync(fixtures).filter((file) => file.endsWith('.xml'));
  const inScope = files.filter((file) => !outOfScope(readFileSync(join(fixtures, file), 'utf8')));
  const lines: string[] = [];
  const expected: Expected[] = [];

  inScope.forEach((file) => serialize(file, lines, expected));

  return { skipped: files.length - inScope.length, lines, expected };
}

test('Kuito lays out every in-scope Taffy flexbox fixture like Chrome', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'kuito-conformance-'));

  try {
    const exe = build(tmp);

    if (!exe) return t.skip('No C++ compiler');

    const { skipped, lines, expected } = inScopeFixtures();

    // 80 need block, grid or vertical text; 4 hoist absolute boxes past a static parent.
    assert.equal(skipped, 84, 'fixtures skipped');

    const run = spawnSync(exe, [], {
      input: lines.join('\n') + '\n',
      encoding: 'utf8',
      maxBuffer: 64 << 20,
    });

    assert.equal(run.status, 0, run.stderr);

    const actual = new Map<string, string[]>();
    let current: string[] = [];

    for (const line of run.stdout.split('\n')) {
      if (line.startsWith('test ')) actual.set(line.slice(5), (current = []));
      else if (line) current.push(line);
    }

    const failures = expected.flatMap(({ name, boxes }) => {
      const got = actual.get(name) ?? [];
      const mismatch = boxes.findIndex((box, i) => {
        const values = (got[i] ?? '').split(' ').map(Number);

        return box.some((value, j) => !(Math.abs(value - (values[j] ?? NaN)) < 0.1));
      });

      if (mismatch === -1 && got.length === boxes.length) return [];

      return [
        `${name}: node ${mismatch} expected ${boxes[mismatch]?.join(' ')} got ${got[mismatch] ?? got[0]}`,
      ];
    });

    assert.deepEqual(
      failures,
      [],
      `${failures.length} of ${expected.length} fixtures differ:\n${failures.slice(0, 40).join('\n')}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('frame after frame of partial layouts match a layout from scratch, in every fixture', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'kuito-relayout-'));

  try {
    const exe = build(tmp);

    if (!exe) return t.skip('No C++ compiler');

    const run = spawnSync(exe, ['--relayout'], {
      input: inScopeFixtures().lines.join('\n') + '\n',
      encoding: 'utf8',
      maxBuffer: 64 << 20,
    });

    assert.equal(run.status, 0, run.stderr);

    const results = run.stdout.split('\n').filter(Boolean);
    const differ = results.filter((line) => !line.startsWith('same '));
    const partial = results.filter((line) => line.includes(' partial '));

    assert.deepEqual(
      differ,
      [],
      `${differ.length} of ${results.length} changes differ:\n${differ.slice(0, 20).join('\n')}`,
    );

    // Most fixtures are a container and its items, which the change resizes;
    // the rest stop at a box whose size cannot change.
    assert.ok(partial.length > 3000, `${partial.length} of ${results.length} laid out a subtree`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
