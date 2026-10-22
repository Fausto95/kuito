import { defineModule, view } from '../../../src/native/define-module';
import type { DrawingViewProps } from '../../../src/native/drawing';

// Shapes drawn as vectors from parsed path data: CAShapeLayers on iOS, a
// Canvas on Android. The Drawing component makes its props from its shapes.
export default defineModule('Drawing', {
  view: view<DrawingViewProps>(),
  ios: { class: 'KuitoDrawingModule' },
  android: { class: 'dev.kuito.runtime.modules.drawing.KuitoDrawingModule' },
});
