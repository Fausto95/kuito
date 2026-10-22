// Recordings on the dev machine (docs/devtools.md#recording-and-replay): the
// `.krec` a shell sends when asked (native/shared/Recording.h), saved with the
// native view tree it built, for the headless golden test to replay.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DeviceLink } from './device-server.ts';

const MAGIC = 'KREC';
/** Header: magic, u32 version, u8 truncated. */
const HEADER = 9;

const pad = (value: number) => String(value).padStart(2, '0');

function stamp(now: Date): string {
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function header(bytes: Buffer, file: string): { truncated: boolean } {
  if (bytes.length < HEADER || bytes.toString('latin1', 0, 4) !== MAGIC)
    throw new Error(`${file} is not a Kuito recording (.krec)`);

  return { truncated: bytes[8] === 1 };
}

export interface SavedRecording {
  file: string;
  bytes: number;
  /** The shell stopped recording at its limit: the file holds the start of the run. */
  truncated: boolean;
}

/** Writes a shell's recording under `.kuito/recordings`, its tree beside it as `<file>.tree`. */
export async function saveRecording({
  root,
  device,
  recording,
  tree,
  now = new Date(),
}: {
  root: string;
  device: DeviceLink;
  recording: string;
  tree: string;
  now?: Date;
}): Promise<SavedRecording> {
  const folder = join(root, '.kuito/recordings');
  const file = join(folder, `${stamp(now)}-${slug(device.name)}.krec`);
  const bytes = Buffer.from(recording, 'base64');
  const { truncated } = header(bytes, `${device.name}'s recording`);

  await mkdir(folder, { recursive: true });
  await writeFile(file, bytes);
  await writeFile(file + '.tree', tree);

  return { file, bytes: bytes.length, truncated };
}
