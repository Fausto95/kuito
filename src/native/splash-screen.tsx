import type { KuitoNode } from '../ui/jsx';
import { Box, type BoxProps } from '../ui/primitives';
import { watch } from '../ui/reactivity';
import SplashModule from '../../native/modules/splash/splash';
import { layout, visible, type SplashFrame } from './splash';
import type { NativeViewProps } from './views';

/** The Splash module's view: which part of the launch screen it draws. */
export type SplashPartViewProps = { part: 'background' | 'logo' | 'brand' };

/** The view that draws one part of the launch screen, from the same images and colors. */
export const SplashPart = SplashModule.view;

/** Style, transforms and opacity for a part of the splash; plain values, animations or motion values. */
export type SplashPartProps = Omit<NativeViewProps<{ part: string }>, 'part'>;

/**
 * Props of `SplashScreen`: the whole splash's props, its `logo` and `brand`
 * parts', and `onReady`.
 */
export type SplashScreenProps = BoxProps & {
  logo?: SplashPartProps;
  brand?: SplashPartProps;
  /** Runs once the native splash is gone and this view is what shows. */
  onReady?: () => void;
  /** Live content, drawn over the launch screen in the same window. */
  children?: KuitoNode;
};

const at = ({ x, y, width, height }: SplashFrame) => ({
  position: 'absolute' as const,
  left: x,
  top: y,
  width,
  height,
});

/**
 * The launch screen again, as Kuito views over the whole window: the native
 * splash hands off to it pixel for pixel, and the app animates it away with
 * its own props and motion values (docs/splash.md). Render it at the root,
 * over the app, in the first screen.
 */
export function SplashScreen({ logo, brand, onReady, children, ...props }: SplashScreenProps) {
  const frames = layout();

  // Runs once with the splash gone: at once when it already is, or when it goes.
  watch(
    () => !frames || !visible.value,
    (gone) => {
      if (gone) onReady?.();
    },
    { immediate: true },
  );

  if (!frames) return null;

  return (
    <Box position="absolute" left={0} top={0} right={0} bottom={0} {...props}>
      <SplashPart part="background" position="absolute" left={0} top={0} right={0} bottom={0} />
      <SplashPart part="logo" {...at(frames.logo)} {...logo} />
      {frames.brand && <SplashPart part="brand" {...at(frames.brand)} {...brand} />}
      {children}
    </Box>
  );
}
