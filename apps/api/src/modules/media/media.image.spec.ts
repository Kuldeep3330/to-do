import { AppError } from '../../common/errors/app-error';
import { assertAllowedUpload, MAX_ORIGINAL_BYTES, sniffImage } from './media.image';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const webp = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);

function expectAppError(fn: () => unknown, code: string, status: number): void {
  try {
    fn();
    throw new Error('expected AppError');
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(code);
    expect((e as AppError).status).toBe(status);
  }
}

describe('media.image', () => {
  it('sniffs jpeg png webp and rejects gif', () => {
    expect(sniffImage(jpeg)).toBe('image/jpeg');
    expect(sniffImage(png)).toBe('image/png');
    expect(sniffImage(webp)).toBe('image/webp');
    expect(sniffImage(gif)).toBeNull();
  });

  it('accepts matching jpeg mime and extension', () => {
    expect(
      assertAllowedUpload({
        buffer: jpeg,
        mimetype: 'image/jpeg',
        originalname: 'cover.jpg',
        size: jpeg.length,
      }),
    ).toBe('image/jpeg');
  });

  it('rejects extension that does not match magic bytes', () => {
    expectAppError(
      () =>
        assertAllowedUpload({
          buffer: jpeg,
          mimetype: 'image/jpeg',
          originalname: 'cover.png',
          size: jpeg.length,
        }),
      'UNSUPPORTED_MEDIA',
      415,
    );
  });

  it('rejects gif even with an image filename', () => {
    expectAppError(
      () =>
        assertAllowedUpload({
          buffer: gif,
          mimetype: 'image/gif',
          originalname: 'x.gif',
          size: gif.length,
        }),
      'UNSUPPORTED_MEDIA',
      415,
    );
  });

  it('rejects files over 8 MB', () => {
    const buf = Buffer.alloc(MAX_ORIGINAL_BYTES + 1, 0xff);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    expectAppError(
      () =>
        assertAllowedUpload({
          buffer: buf,
          mimetype: 'image/jpeg',
          originalname: 'big.jpg',
          size: buf.length,
        }),
      'PAYLOAD_TOO_LARGE',
      413,
    );
  });

  it('rejects an empty file', () => {
    expectAppError(
      () =>
        assertAllowedUpload({
          buffer: Buffer.alloc(0),
          mimetype: 'image/jpeg',
          originalname: 'empty.jpg',
          size: 0,
        }),
      'VALIDATION_ERROR',
      400,
    );
  });
});
