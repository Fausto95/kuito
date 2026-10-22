// Font files for tests: the few sfnt tables src/cli/fonts.ts reads.

export type Face = { family: string; weight?: number; italic?: boolean; typographic?: string };

/** A minimal sfnt: the name table (Windows, UTF-16BE) and OS/2's weight and selection. */
export function font(
  { family, weight = 400, italic = false, typographic }: Face,
  version = 0x00010000,
) {
  const names: [number, string][] = [
    [1, family],
    [2, italic ? 'Italic' : 'Regular'],
  ];

  if (typographic) names.push([16, typographic]);

  const strings = names.map(([, text]) => Buffer.from(text, 'utf16le').swap16());
  const name = Buffer.alloc(6 + 12 * names.length);

  name.writeUInt16BE(0, 0);
  name.writeUInt16BE(names.length, 2);
  name.writeUInt16BE(name.length, 4);

  let offset = 0;

  names.forEach(([id], index) => {
    const at = 6 + 12 * index;

    name.writeUInt16BE(3, at);
    name.writeUInt16BE(1, at + 2);
    name.writeUInt16BE(0x409, at + 4);
    name.writeUInt16BE(id, at + 6);
    name.writeUInt16BE(strings[index].length, at + 8);
    name.writeUInt16BE(offset, at + 10);
    offset += strings[index].length;
  });

  const os2 = Buffer.alloc(78);

  os2.writeUInt16BE(weight, 4);
  os2.writeUInt16BE(italic ? 1 : 0x40, 62);

  const tables: [string, Buffer][] = [
    ['OS/2', os2],
    ['name', Buffer.concat([name, ...strings])],
  ];
  const header = Buffer.alloc(12 + 16 * tables.length);
  const bodies: Buffer[] = [];
  let at = header.length;

  header.writeUInt32BE(version, 0);
  header.writeUInt16BE(tables.length, 4);

  tables.forEach(([tag, body], index) => {
    const record = 12 + 16 * index;

    header.write(tag, record, 'latin1');
    header.writeUInt32BE(at, record + 8);
    header.writeUInt32BE(body.length, record + 12);
    bodies.push(body);
    at += body.length;
  });

  return new Uint8Array(Buffer.concat([header, ...bodies]));
}
