#!/usr/bin/env node
// Writes a font table (docs/testing.md#fonts) measured by UIKit on an iOS
// simulator: each face's glyph advances and line height, as the iOS renderer
// lays text out with them. A headless test that declares it lays text out
// like the simulator, within a fraction of a point.
//
//   node scripts/ios-font-table.ts <simulator> <faces.json | recording.krec> <out.json>
//
// faces.json: { "faces": [{ "size": 17, "weight": 400 }, ...], "text": "what the app shows" }:
// its glyphs and every pair of them are measured, and printable ASCII always.
// A recording (docs/devtools.md#recording-and-replay) gives the faces and the
// text its labels show.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replayBatches } from '../src/tests/batch.ts';
import { textStyle, transformed } from '../src/tests/fonts.ts';
import { LayoutEngine } from '../src/tests/layout.ts';

const SWIFT = String.raw`
import UIKit

let weights: [Int: UIFont.Weight] = [100: .ultraLight, 200: .thin, 300: .light, 400: .regular,
                                     500: .medium, 600: .semibold, 700: .bold, 800: .heavy, 900: .black]
let input = try! JSONSerialization.jsonObject(with: FileManager.default.contents(atPath: CommandLine.arguments[1])!) as! [String: Any]
let glyphs = (input["glyphs"] as! [String])
let pairs = (input["pairs"] as! [String])
var faces: [[String: Any]] = []

for face in input["faces"] as! [[String: Any]] {
    let size = CGFloat((face["size"] as! NSNumber).doubleValue)
    let weight = (face["weight"] as! NSNumber).intValue
    let font = UIFont.systemFont(ofSize: size, weight: weights[weight] ?? .regular)
    var advances: [String: Double] = [:]

    for glyph in glyphs {
        advances[glyph] = Double(NSAttributedString(string: glyph, attributes: [.font: font]).size().width)
    }

    var kerning: [String: Double] = [:]

    for pair in pairs {
        let both = Double(NSAttributedString(string: pair, attributes: [.font: font]).size().width)
        let apart = pair.map { advances[String($0)] ?? 0 }.reduce(0, +)

        if abs(both - apart) > 0.001 { kerning[pair] = both - apart }
    }

    faces.append(["weight": weight, "size": Double(size), "lineHeight": Double(font.lineHeight),
                  "advances": advances, "fallback": advances["M"] ?? Double(size) / 2, "kerning": kerning])
}

let data = try! JSONSerialization.data(withJSONObject: ["faces": faces], options: [.sortedKeys])
FileManager.default.createFile(atPath: CommandLine.arguments[2], contents: data)
`;

const [device, facesFile, out] = process.argv.slice(2);

if (!device || !facesFile || !out) {
  console.error('Usage: node scripts/ios-font-table.ts <simulator> <faces.json> <out.json>');
  process.exit(1);
}

interface FacesSpec {
  faces: { size: number; weight: number }[];
  text?: string;
}

/** The faces a recording's labels use, and their text. */
function recordedFaces(file: string): FacesSpec {
  const engine = new LayoutEngine();
  const props = new Map<number, Record<string, unknown>>();

  for (const batch of replayBatches(engine.native, readFileSync(file)))
    for (const m of batch.mutations)
      if (m.op === 'prop') props.set(m.id, { ...props.get(m.id), [m.name]: m.value });

  const faces = new Map<string, { size: number; weight: number }>();
  const texts: string[] = [];

  for (const each of props.values()) {
    if (typeof each.text !== 'string') continue;

    const style = textStyle(each);

    faces.set(`${style.fontSize}/${style.weight}`, { size: style.fontSize, weight: style.weight });
    texts.push(transformed(each.text, each.textTransform));
  }

  return { faces: [...faces.values()], text: texts.join('\n') };
}

const spec: FacesSpec = facesFile.endsWith('.krec')
  ? recordedFaces(facesFile)
  : JSON.parse(readFileSync(facesFile, 'utf8'));
const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const glyphs = [...new Set([...Array.from(ascii), ...Array.from(spec.text ?? '')])].filter(
  (glyph) => glyph !== '\n',
);
const pairs = new Set<string>();

for (const word of (spec.text ?? '').split(/\n/)) {
  const glyphsOf = Array.from(word);

  for (let at = 1; at < glyphsOf.length; at++) pairs.add(glyphsOf[at - 1] + glyphsOf[at]);
}

const temp = mkdtempSync(join(tmpdir(), 'kuito-fonts-'));

try {
  const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], {
    encoding: 'utf8',
  }).trim();

  writeFileSync(join(temp, 'measure.swift'), SWIFT);

  writeFileSync(
    join(temp, 'input.json'),
    JSON.stringify({ faces: spec.faces, glyphs, pairs: [...pairs] }),
  );

  execFileSync('xcrun', [
    'swiftc',
    '-sdk',
    sdk,
    '-target',
    `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-ios18.0-simulator`,
    join(temp, 'measure.swift'),
    '-o',
    join(temp, 'measure'),
  ]);
  // The simulator's processes see the host's files, so the output lands in place.

  execFileSync('xcrun', [
    'simctl',
    'spawn',
    device,
    join(temp, 'measure'),
    join(temp, 'input.json'),
    join(temp, 'table.json'),
  ]);

  const table: { faces: Record<string, unknown>[] } = JSON.parse(
    readFileSync(join(temp, 'table.json'), 'utf8'),
  );

  writeFileSync(out, JSON.stringify(table, null, 2) + '\n');
  console.log(`Wrote ${table.faces.length} faces of ${glyphs.length} glyphs to ${out}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
