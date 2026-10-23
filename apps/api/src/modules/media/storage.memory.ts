import { Injectable } from '@nestjs/common';
import { StoragePort } from './storage.port';

@Injectable()
export class InMemoryStorage implements StoragePort {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async ping(): Promise<void> {}
}
