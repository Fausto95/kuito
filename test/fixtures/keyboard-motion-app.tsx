import { Box, TextField, keyboard } from 'kuito';

export default function App() {
  return (
    <Box flex={1}>
      <TextField id="field" />
      <Box id="bar" height={44} translateY={keyboard.height.map((height) => -height)} />
    </Box>
  );
}
