export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface StoragePort {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}
