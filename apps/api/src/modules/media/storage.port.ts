export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface StoragePort {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Resolves if the store is reachable and the bucket exists; rejects otherwise. Used by the admin health page. */
  ping(): Promise<void>;
}
