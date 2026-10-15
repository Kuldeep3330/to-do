import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { env } from '../../config/env';
import { StoragePort } from './storage.port';

@Injectable()
export class S3StorageAdapter implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const cfg = env();
    this.bucket = cfg.S3_BUCKET;
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: cfg.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.S3_ACCESS_KEY,
        secretAccessKey: cfg.S3_SECRET_KEY,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
