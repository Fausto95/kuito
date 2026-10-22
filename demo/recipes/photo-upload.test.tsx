// The photo upload recipe on the headless host, with the camera, the photo
// picker and the file system faked.
import { assert, press, render, screen, test, type FetchRequest } from 'kuito/tests';
import PhotoUpload, { UPLOAD_URL, withoutMetadata } from './photo-upload';

// SOI, an APP0 segment, an APP1 (EXIF) segment, then the scan.
const APP0 = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46];
const EXIF = [0xff, 0xe1, 0x00, 0x05, 0x45, 0x78, 0x69];
const SCAN = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9];
const JPEG = new Uint8Array([0xff, 0xd8, ...APP0, ...EXIF, ...SCAN]).buffer;

const asset = (uri: string, mimeType: string) => ({
  uri,
  width: 3,
  height: 4,
  type: 'image',
  mimeType,
  fileName: uri.split('/').pop(),
  fileSize: JPEG.byteLength,
});

function fakes(picked = asset('file:///cache/picked.jpg', 'image/jpeg')) {
  const written: string[] = [];
  const uploads: FetchRequest[] = [];
  const modules = {
    Camera: {
      takePicture: () => ({ uri: 'file:///cache/camera.jpg', width: 3, height: 4, bytes: JPEG }),
    },
    ImagePicker: { launchImageLibrary: () => [picked] },
    FileSystem: {
      sandboxed: (uri: string) => uri.replace('file://', ''),
      readBytes: () => JPEG,
      writeBytes: ({ uri }: { uri: string }) => void written.push(uri),
    },
  };
  const fetch = (request: FetchRequest) => {
    uploads.push(request);

    return { status: 200, body: '{}' };
  };

  return { written, uploads, options: { modules, fetch } };
}

test('withoutMetadata drops the EXIF segment and keeps the image', () => {
  assert.deepEqual([...new Uint8Array(withoutMetadata(JPEG))], [0xff, 0xd8, ...APP0, ...SCAN]);

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;

  assert.equal(withoutMetadata(png), png);
});

test('a photo taken is cleaned, then uploaded', async () => {
  const { written, uploads, options } = fakes();

  await render(<PhotoUpload />, options);
  await press(screen.getByText('Take photo'));

  assert.ok(screen.getByText('Photo taken'));

  assert.deepEqual(
    screen.getByRole('img', { name: 'Photo to send' }).props.src,
    'file:///cache/camera-clean.jpg',
  );

  assert.deepEqual(written, ['file:///cache/camera-clean.jpg']);

  await press(screen.getByText('Upload'));

  const [sent] = uploads;

  assert.equal(sent.url, UPLOAD_URL);
  assert.equal(sent.headers['content-type'], 'image/jpeg');
  assert.ok(screen.getByText('Uploaded'));
  assert.equal(screen.queryByRole('img', { name: 'Photo to send' }), null);
});

test('a JPEG from the library is cleaned, a PNG goes as it is', async () => {
  const jpeg = fakes();

  await render(<PhotoUpload />, jpeg.options);
  await press(screen.getByText('Choose from library'));
  assert.deepEqual(jpeg.written, ['file:///cache/picked-clean.jpg']);

  const png = fakes(asset('file:///cache/picked.png', 'image/png'));

  await render(<PhotoUpload />, png.options);
  await press(screen.getByText('Choose from library'));
  await press(screen.getByText('Upload'));

  assert.deepEqual(png.written, []);
  assert.equal(png.uploads[0].headers['content-type'], 'image/png');
});

test('a failed upload keeps the photo to send again', async () => {
  const { options } = fakes();

  await render(<PhotoUpload />, { ...options, fetch: () => ({ status: 500 }) });
  await press(screen.getByText('Take photo'));
  await press(screen.getByText('Upload'));

  assert.ok(screen.getByText('Error: The server answered 500'));
  assert.ok(screen.getByRole('img', { name: 'Photo to send' }));
});
