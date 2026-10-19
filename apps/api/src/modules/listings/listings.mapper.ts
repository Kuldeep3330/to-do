import { coverUrl, galleryUrls, MediaRow } from '../media/media.urls';

type LocalityCity = {
  id: string;
  name: string;
  slug: string;
  city: { id: string; name: string; slug: string };
};

type PropertyRow = {
  id: string;
  type: string;
  status: string;
  internalTitle: string;
  societyName: string | null;
  areaValue: unknown;
  areaUnit: string;
  bedrooms: number | null;
  bathrooms: number | null;
  balconies: number | null;
  floor: number | null;
  totalFloors: number | null;
  furnishing: string | null;
  facing: string | null;
  locality: LocalityCity;
};

export type ListingRow = {
  id: string;
  propertyId: string;
  slug: string;
  intent: string;
  status: string;
  title: string;
  description: string;
  priceAmount: bigint | null;
  pricePeriod: string;
  maintenanceAmount: bigint | null;
  depositAmount: bigint | null;
  negotiable: boolean;
  availableFrom: Date | null;
  publishedAt: Date | null;
  closedAt: Date | null;
  verifiedAt?: Date | null;
  lastConfirmedAt?: Date | null;
  verifiedBy?: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  property: PropertyRow;
  media?: Array<{ id: string } & Partial<MediaRow>>;
};

function money(value: bigint | null): number | null {
  return value === null ? null : Number(value);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Public label only: first name, never a full name. */
function firstName(name: string | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export type AdminListing = {
  id: string;
  propertyId: string;
  slug: string;
  intent: string;
  status: string;
  title: string;
  description: string;
  priceAmount: number | null;
  pricePeriod: string;
  maintenanceAmount: number | null;
  depositAmount: number | null;
  negotiable: boolean;
  availableFrom: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  lastConfirmedAt: string | null;
  originalCount: number;
  property: {
    id: string;
    type: string;
    status: string;
    internalTitle: string;
    areaValue: number | null;
    areaUnit: string;
    bedrooms: number | null;
    bathrooms: number | null;
  };
  city: { id: string; name: string; slug: string };
  locality: { id: string; name: string; slug: string };
  createdAt: string;
  updatedAt: string;
};

export function toAdminListing(row: ListingRow): AdminListing {
  return {
    id: row.id,
    propertyId: row.propertyId,
    slug: row.slug,
    intent: row.intent,
    status: row.status,
    title: row.title,
    description: row.description,
    priceAmount: money(row.priceAmount),
    pricePeriod: row.pricePeriod,
    maintenanceAmount: money(row.maintenanceAmount),
    depositAmount: money(row.depositAmount),
    negotiable: row.negotiable,
    availableFrom: dateOnly(row.availableFrom),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    verifiedAt: iso(row.verifiedAt),
    verifiedBy: row.verifiedBy?.name ?? null,
    lastConfirmedAt: iso(row.lastConfirmedAt),
    originalCount: row.media?.length ?? 0,
    property: {
      id: row.property.id,
      type: row.property.type,
      status: row.property.status,
      internalTitle: row.property.internalTitle,
      areaValue: num(row.property.areaValue),
      areaUnit: row.property.areaUnit,
      bedrooms: row.property.bedrooms,
      bathrooms: row.property.bathrooms,
    },
    city: {
      id: row.property.locality.city.id,
      name: row.property.locality.city.name,
      slug: row.property.locality.city.slug,
    },
    locality: {
      id: row.property.locality.id,
      name: row.property.locality.name,
      slug: row.property.locality.slug,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type PublicListingCard = {
  id: string;
  slug: string;
  intent: string;
  status: string;
  title: string;
  priceAmount: number | null;
  pricePeriod: string;
  bedrooms: number | null;
  areaValue: number | null;
  areaUnit: string;
  furnishing: string | null;
  city: { name: string; slug: string };
  locality: { name: string; slug: string };
  coverImageUrl: string | null;
  publishedAt: string | null;
  verifiedAt: string | null;
  lastConfirmedAt: string | null;
};

export function toPublicListingCard(row: ListingRow): PublicListingCard {
  return {
    id: row.id,
    slug: row.slug,
    intent: row.intent,
    status: 'PUBLISHED',
    title: row.title,
    priceAmount: money(row.priceAmount),
    pricePeriod: row.pricePeriod,
    bedrooms: row.property.bedrooms,
    areaValue: num(row.property.areaValue),
    areaUnit: row.property.areaUnit,
    furnishing: row.property.furnishing,
    city: { name: row.property.locality.city.name, slug: row.property.locality.city.slug },
    locality: { name: row.property.locality.name, slug: row.property.locality.slug },
    coverImageUrl: coverUrl((row.media ?? []) as MediaRow[]),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    verifiedAt: iso(row.verifiedAt),
    lastConfirmedAt: iso(row.lastConfirmedAt),
  };
}

export type PublicListingDetail = {
  id: string;
  slug: string;
  intent: string;
  status: string;
  title: string;
  description: string;
  priceAmount: number | null;
  pricePeriod: string;
  maintenanceAmount: number | null;
  depositAmount: number | null;
  negotiable: boolean;
  availableFrom: string | null;
  publishedAt: string | null;
  city: { name: string; slug: string };
  locality: { name: string; slug: string };
  propertyType: string;
  societyName: string | null;
  areaValue: number | null;
  areaUnit: string;
  bedrooms: number | null;
  bathrooms: number | null;
  balconies: number | null;
  floor: number | null;
  totalFloors: number | null;
  furnishing: string | null;
  facing: string | null;
  coverImageUrl: string | null;
  gallery: string[];
  verifiedAt: string | null;
  verifiedByFirstName: string | null;
  lastConfirmedAt: string | null;
};

export function toPublicListingDetail(row: ListingRow): PublicListingDetail {
  return {
    id: row.id,
    slug: row.slug,
    intent: row.intent,
    status: 'PUBLISHED',
    title: row.title,
    description: row.description,
    priceAmount: money(row.priceAmount),
    pricePeriod: row.pricePeriod,
    maintenanceAmount: money(row.maintenanceAmount),
    depositAmount: money(row.depositAmount),
    negotiable: row.negotiable,
    availableFrom: dateOnly(row.availableFrom),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    city: { name: row.property.locality.city.name, slug: row.property.locality.city.slug },
    locality: { name: row.property.locality.name, slug: row.property.locality.slug },
    propertyType: row.property.type,
    societyName: row.property.societyName,
    areaValue: num(row.property.areaValue),
    areaUnit: row.property.areaUnit,
    bedrooms: row.property.bedrooms,
    bathrooms: row.property.bathrooms,
    balconies: row.property.balconies,
    floor: row.property.floor,
    totalFloors: row.property.totalFloors,
    furnishing: row.property.furnishing,
    facing: row.property.facing,
    coverImageUrl: coverUrl((row.media ?? []) as MediaRow[]),
    gallery: galleryUrls((row.media ?? []) as MediaRow[]),
    verifiedAt: iso(row.verifiedAt),
    verifiedByFirstName: row.verifiedAt ? firstName(row.verifiedBy?.name) : null,
    lastConfirmedAt: iso(row.lastConfirmedAt),
  };
}
