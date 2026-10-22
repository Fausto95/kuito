import { buildKernel } from '../../src/dev/kernel.ts';

/** Tests evaluate the bundled kernel, as Hermes does; build it once per run. */
export default async function setup(): Promise<void> {
  await buildKernel();
}
