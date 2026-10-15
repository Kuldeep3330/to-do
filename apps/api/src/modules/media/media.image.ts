import sharp from 'sharp';
import { AppError } from '../../common/errors/app-error';

export const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;
export const MAX_DIMENSION_PX = 8000;
export const CARD_WIDTH = 600;
export const DETAIL_WIDTH = 1600;

export type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp';

const EXT_BY_MIME: Record<AllowedMime, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

export function sniffImage(buffer: Buffer): AllowedMime | null {
  if (buffer.length < 12) {
    return null;
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export function originalExtension(mime: AllowedMime): 'jpg' | 'png' | 'webp' {
  if (mime === 'image/jpeg') {
    return 'jpg';
  }
  if (mime === 'image/png') {
    return 'png';
  }
  return 'webp';
}

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i).toLowerCase() : '';
}

export function assertAllowedUpload(file: { buffer: Buffer; mimetype: string; originalname: string; size: number }): AllowedMime {
  if (!file?.buffer || file.buffer.length === 0 || file.size <= 0) {
    throw AppError.validation('File is required', [{ path: 'file', message: 'File is required' }]);
  }
  if (file.size > MAX_ORIGINAL_BYTES || file.buffer.length > MAX_ORIGINAL_BYTES) {
    throw AppError.payloadTooLarge('Image exceeds 8 MB');
  }
  const sniffed = sniffImage(file.buffer);
  if (!sniffed) {
    throw AppError.unsupportedMedia('Only JPEG, PNG, and WebP images are allowed');
  }
  const declared = file.mimetype.toLowerCase();
  if (declared && declared !== 'application/octet-stream' && declared !== sniffed) {
    throw AppError.unsupportedMedia('Only JPEG, PNG, and WebP images are allowed');
  }
  const ext = extensionOf(file.originalname || '');
  if (!EXT_BY_MIME[sniffed].includes(ext)) {
    throw AppError.unsupportedMedia('File extension must match the image type');
  }
  return sniffed;
}

export type ImageMeta = { width: number; height: number };

export async function readDimensions(buffer: Buffer): Promise<ImageMeta> {
  const meta = await sharp(buffer, { failOn: 'error' }).rotate().metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw AppError.validation('Invalid image', [{ path: 'file', message: 'Image dimensions are required' }]);
  }
  if (width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX) {
    throw AppError.validation('Image is too large', [
      { path: 'file', message: 'Each side must be 8000px or less' },
    ]);
  }
  return { width, height };
}

export async function encodeVariant(buffer: Buffer, width: number): Promise<{ buffer: Buffer; width: number; height: number }> {
  const out = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const meta = await sharp(out).metadata();
  return {
    buffer: out,
    width: meta.width ?? width,
    height: meta.height ?? 1,
  };
}
