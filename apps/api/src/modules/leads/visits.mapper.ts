type VisitRow = {
  id: string;
  leadId: string;
  listingId: string;
  preferredDate: Date | null;
  preferredSlot: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  listing: { id: string; slug: string; title: string; intent: string };
  lead?: {
    id: string;
    name: string;
    phone: string;
    assignee: { id: string; name: string } | null;
  };
};

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function base(row: VisitRow) {
  return {
    id: row.id,
    leadId: row.leadId,
    status: row.status,
    preferredDate: dateOnly(row.preferredDate),
    preferredSlot: row.preferredSlot,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    listing: {
      id: row.listing.id,
      slug: row.listing.slug,
      title: row.listing.title,
      intent: row.listing.intent,
    },
  };
}

export type CustomerVisit = ReturnType<typeof base>;

export function toCustomerVisit(row: VisitRow): CustomerVisit {
  return base(row);
}

export function toAdminVisit(row: VisitRow) {
  return {
    ...base(row),
    lead: row.lead
      ? {
          id: row.lead.id,
          name: row.lead.name,
          phone: row.lead.phone,
          assignee: row.lead.assignee ? { id: row.lead.assignee.id, name: row.lead.assignee.name } : null,
        }
      : null,
  };
}

export type AdminVisit = ReturnType<typeof toAdminVisit>;
