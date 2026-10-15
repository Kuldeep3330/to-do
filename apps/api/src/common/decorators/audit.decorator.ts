import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export type AuditMeta = {
  action: string;
  entityType: string;
};

export const Audit = (action: string, entityType: string) =>
  SetMetadata(AUDIT_KEY, { action, entityType } as AuditMeta);
