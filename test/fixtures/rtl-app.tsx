import { Box, HStack, Route, Router, styles } from 'kuito';

// A screen in a navigation stack with a row padded on its inline start: the
// layout puts it on the side the app's direction starts from.
const sheet = styles({
  row: { paddingInlineStart: '10px' },
  cell: { width: '50px', height: '10px' },
});

function Home() {
  return (
    <HStack id="row" class={sheet.row}>
      <Box id="first" class={sheet.cell} />
    </HStack>
  );
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} title="Home" />
    </Router>
  );
}
