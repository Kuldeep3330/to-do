export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
};

export type DataEnvelope<T> = { data: T };

export type PagedEnvelope<T> = {
  data: T[];
  meta: PaginationMeta;
};

export function one<T>(data: T): DataEnvelope<T> {
  return { data };
}

export function paged<T>(data: T[], meta: PaginationMeta): PagedEnvelope<T> {
  return { data, meta };
}

export function offsetOf(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
