// Register a downloaded font file with its weight.
import { fonts, type FontWeight } from 'kuito';

export async function registerHeadingFont(localFileURI: string) {
  const weight: FontWeight = 700;
  await fonts.load({ Heading: { uri: localFileURI, weight } });
}
// Pass a file:// URI, then use fontFamily="Heading" and fontWeight={700}.
