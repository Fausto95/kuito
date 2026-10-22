import BlurModule from '../../native/modules/blur/blur';
import type { KuitoNode } from '../ui/jsx';

/**
 * Apple's system materials, from the most see-through to the bars': the
 * blur and tint a surface is made of. Each follows the color scheme.
 */
export type BlurMaterial = 'ultraThin' | 'thin' | 'regular' | 'thick' | 'chrome';

/** Props of `Blur`: the material it is made of, and the children above it. */
export type BlurProps = {
  /** `regular` by default. */
  material?: BlurMaterial;
  /** Laid out inside it as a Box's, above the blur. */
  children?: KuitoNode;
};

/**
 * What is behind the view, blurred and tinted by its material, under its
 * children: contributed by the Blur module through the native views API.
 * UIVisualEffectView on iOS; on Android the view draws its backdrop
 * blurred from Android 12, and tinted only before (docs/blur.md).
 */
export const Blur = BlurModule.view;
