// Pick a photo and hand its local file to an upload function.
import { mediaPicker, type MediaAsset, type MediaType } from 'kuito';

export async function choosePhoto(upload: (asset: MediaAsset) => Promise<void>) {
  const mediaTypes: MediaType[] = ['images'];
  const result = await mediaPicker.pick({ mediaTypes });
  if (!result.canceled && result.assets[0]) await upload(result.assets[0]);
}
