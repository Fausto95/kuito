import ImagePicker, {
  type MediaAsset as PickedAsset,
  type MediaPickerRequest,
  type PickerMediaType,
} from '../../native/modules/image-picker/image-picker';

export type MediaType = PickerMediaType;

export type CaptureOptions = {
  /** What the picker offers: `'images'` (the default), `'videos'`, or both. */
  mediaTypes?: MediaType | MediaType[];
  /** JPEG quality of written images, 0 to 1. 1, the default, keeps the most detail. */
  quality?: number;
  /** Images wider than this are scaled down to fit, keeping their aspect ratio. In pixels. */
  maxWidth?: number;
  /** Images taller than this are scaled down to fit, keeping their aspect ratio. In pixels. */
  maxHeight?: number;
  /** iOS: crop the image, or trim the video, in the system editor before it resolves. */
  allowsEditing?: boolean;
};

export type PickOptions = CaptureOptions & {
  /** How many assets the user may pick: 1, the default, or 0 for no limit. */
  selectionLimit?: number;
};

export type MediaAsset = PickedAsset;

export type MediaPickerResult =
  | { canceled: true; assets: null }
  | { canceled: false; assets: MediaAsset[] };

const MEDIA_TYPES: readonly unknown[] = ['images', 'videos'] satisfies MediaType[];

function size(value: number | undefined, name: string) {
  if (value === undefined) return null;

  if (!(value > 0 && Number.isFinite(value)))
    throw new TypeError(`${name} must be a positive number of pixels, not ${value}`);

  return value;
}

/** Every option filled in, so both platforms decode one shape; invalid ones throw here. */
function request(options: PickOptions): MediaPickerRequest {
  const { quality = 1, selectionLimit = 1, allowsEditing = false } = options;
  const mediaTypes = [options.mediaTypes ?? 'images'].flat();
  const unknown = mediaTypes.find((type) => !MEDIA_TYPES.includes(type));

  if (mediaTypes.length === 0 || unknown !== undefined)
    throw new TypeError(
      `mediaTypes must name images, videos or both${unknown === undefined ? '' : `, not ${unknown}`}`,
    );

  if (!(quality >= 0 && quality <= 1))
    throw new TypeError(`quality must be between 0 and 1, not ${quality}`);

  if (!(Number.isInteger(selectionLimit) && selectionLimit >= 0))
    throw new TypeError(
      `selectionLimit must be 0 (no limit) or a positive integer, not ${selectionLimit}`,
    );

  if (allowsEditing && selectionLimit !== 1)
    throw new TypeError('allowsEditing edits one asset: drop it or set selectionLimit to 1');

  return {
    mediaTypes,
    selectionLimit,
    quality,
    maxWidth: size(options.maxWidth, 'maxWidth'),
    maxHeight: size(options.maxHeight, 'maxHeight'),
    allowsEditing,
  };
}

const result = (assets: MediaAsset[]): MediaPickerResult =>
  assets.length === 0 ? { canceled: true, assets: null } : { canceled: false, assets };

// The system's photo picker and camera (docs/image-picker.md). Picked and
// captured media land in the app's cache directory. Images are re-encoded off
// the main thread, as JPEG at `quality` (PNG when they have transparency),
// scaled down to fit `maxWidth` and `maxHeight`.

/**
 * Lets the user pick photos or videos: PHPickerViewController on iOS, the
 * Photo Picker on Android. Neither needs a photo library permission.
 */
export const pick = (options: PickOptions = {}): Promise<MediaPickerResult> =>
  attempt(() => ImagePicker.launchImageLibrary(request(options)).then(result));

/** Lets the user take a photo or a video with the system camera, asking for the camera permission first. */
export const capture = (options: CaptureOptions = {}): Promise<MediaPickerResult> =>
  attempt(() => ImagePicker.launchCamera(request(options)).then(result));

/** Rejects instead of throwing, as a function returning a promise should. */
function attempt<T>(work: () => Promise<T>): Promise<T> {
  try {
    return work();
  } catch (error) {
    return Promise.reject(error);
  }
}
