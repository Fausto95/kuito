// Read the current window dimensions.
import { Text, window } from 'kuito';

<Text>{`${window.size.value.width} x ${window.size.value.height}`}</Text>;
<Text>{window.orientation.value === 'landscape' ? 'Wide' : 'Tall'}</Text>;
window.insets.value; // { top, left, bottom, right }
window.widthClass.value; // 'compact', 'medium' or 'expanded'
