import { Box, Sheet, Text, interpolate, sheetMotion, signal } from 'kuito';

function Player() {
  const open = signal(true);
  const sheet = sheetMotion();

  return (
    <>
      {/* The screen behind dims and shrinks as the sheet rises, every frame on the UI thread. */}
      <Box
        flex={1}
        opacity={interpolate(sheet.progress, [0, 1], [1, 0.6])}
        scale={interpolate(sheet.progress, [0, 1], [1, 0.94])}
      />
      <Sheet
        open={open.value}
        snapPoints={['30%', '90%']}
        motion={sheet}
        onClose={() => (open.value = false)}
      >
        <Text>Up next</Text>
      </Sheet>
    </>
  );
}
