import { defineModule, fn } from '../../../src/native/define-module';

export type FontFaceStyle = 'normal' | 'italic';

/** A font file: a `file://` URI, and the weight (100 to 900) and style it draws. */
export type FontFace = { family: string; uri: string; weight: number; style: FontFaceStyle };

// Fonts registered at run time (docs/fonts.md), into the registry the text
// renderer resolves `fontFamily` through.
export default defineModule('Fonts', {
  load: fn.background<(faces: FontFace[]) => Promise<void>>(),
  /** Whether `fontFamily` takes `family`: bundled, or loaded. */
  isLoaded: fn.sync<(family: string) => boolean>(),
  ios: { class: 'KuitoFontsModule' },
  android: { class: 'dev.kuito.runtime.modules.fonts.KuitoFontsModule' },
});
