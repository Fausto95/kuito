import { defineModule, fn } from '../../../src/native/define-module';
// The camera asks for its permission first.
import '../permissions/permissions';

export type PickerMediaType = 'images' | 'videos';

/** What src/native/media-picker.ts sends: every option filled in, validated. */
export type MediaPickerRequest = {
  mediaTypes: PickerMediaType[];
  /** 0: no limit. */
  selectionLimit: number;
  quality: number;
  maxWidth: number | null;
  maxHeight: number | null;
  allowsEditing: boolean;
};

export type MediaAssetType = 'image' | 'video';

export type MediaAsset = {
  /** A `file://` URI in the app's cache directory, for `<Image source>` and `fileSystem`. */
  uri: string;
  /** In pixels, as displayed: orientation is already applied. */
  width: number;
  height: number;
  type: MediaAssetType;
  mimeType: string;
  /** The name the user's library knows it by, when it has one. */
  fileName: string;
  /** In bytes, of the file at `uri`. */
  fileSize: number;
  /** Videos only: the length in milliseconds. */
  duration?: number;
};

// The system's photo picker and camera (docs/image-picker.md). Each resolves
// with the picked assets, or none when the user closes the picker.
export default defineModule('ImagePicker', {
  launchImageLibrary: fn.main.callback<(request: MediaPickerRequest) => Promise<MediaAsset[]>>(),
  launchCamera: fn.main.callback<(request: MediaPickerRequest) => Promise<MediaAsset[]>>(),
  ios: {
    class: 'KuitoImagePickerModule',
    infoPlist: {
      NSCameraUsageDescription: 'Take photos and videos to use in this app.',
      NSMicrophoneUsageDescription: 'Record sound with the videos you take.',
    },
  },
  android: {
    class: 'dev.kuito.runtime.modules.imagepicker.KuitoImagePickerModule',
    providers: [
      {
        name: 'dev.kuito.runtime.modules.imagepicker.KuitoImagePickerFileProvider',
        authorities: '${applicationId}.kuito.imagepicker',
        exported: 'false',
        grantUriPermissions: 'true',
        resources: { 'android.support.FILE_PROVIDER_PATHS': '@xml/kuito_image_picker_paths' },
      },
    ],
  },
});
