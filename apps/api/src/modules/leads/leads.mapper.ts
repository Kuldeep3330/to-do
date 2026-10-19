import { ResponseInfo, responseInfo } from './leads.sla';

type ListingBits = {
  id: string;
  slug: string;
  title: string;
  intent: string;
  status: string;
};

type UserBits = {
  id: string;
  name: string;
  email: string;
};

export type LeadRow = {
  id: string;
  listingId: string | null;
  userId: string | null;
  assignedToUserId: string | null;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: string;
  source: string;
  firstResponseAt?: Date | null;
  closedAmount?: bigint | null;
  closedOn?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  listing?: ListingBits | null;
  assignee?: UserBits | null;
};

export type GuestLeadAck = { ok: true };

export type CustomerLead = {
  id: string;
  status: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  createdAt: string;
  listing: { id: string; slug: string; title: string; intent: string } | null;
};

export type AdminLeadDetail = ResponseInfo & {
  /** Deal value in INR (monthly rent for rentals); only set on won leads. */
  closedAmount: number | null;
  /** Day the deal closed, YYYY-MM-DD. */
  closedOn: string | null;
  id: string;
  listingId: string | null;
  userId: string | null;
  assignedToUserId: string | null;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  listing: { id: string; slug: string; title: string; intent: string; status: string } | null;
  assignee: { id: string; name: string; email: string } | null;
};

export function toCustomerLead(row: LeadRow): CustomerLead {
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    phone: row.phone,
    email: row.email,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    listing: row.listing
      ? {
          id: row.listing.id,
          slug: row.listing.slug,
          title: row.listing.title,
          intent: row.listing.intent,
        }
      : null,
  };
}

export function toAdminLead(row: LeadRow, now = new Date()): AdminLeadDetail {
  return {
    ...responseInfo(row, now),
    closedAmount: row.closedAmount == null ? null : Number(row.closedAmount),
    closedOn: row.closedOn ? row.closedOn.toISOString().slice(0, 10) : null,
    id: row.id,
    listingId: row.listingId,
    userId: row.userId,
    assignedToUserId: row.assignedToUserId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    message: row.message,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    listing: row.listing
      ? {
          id: row.listing.id,
          slug: row.listing.slug,
          title: row.listing.title,
          intent: row.listing.intent,
          status: row.listing.status,
        }
      : null,
    assignee: row.assignee
      ? { id: row.assignee.id, name: row.assignee.name, email: row.assignee.email }
      : null,
  };
}
