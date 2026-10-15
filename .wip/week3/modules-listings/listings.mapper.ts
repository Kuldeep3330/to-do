import { coverUrl, galleryUrls, MediaRow, publicUrl } from '../media/media.urls';

type LocalityRow = { id: string; name: string; slug: string; city: { id: string; name: string; slug: string } };

type PropertyRow = {
  id: string;
  type: string;
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
  locality: LocalityRow;
};

type MediaPrismaRow = MediaRow & { id: string; contentType: string; width: number | null; height: number | null };

type ListingRow = {
  id: string;
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
  propertyId: string;
  createdAt: Date;
  updatedAt: Date;
  property: PropertyRow;
  media: MediaPrismaRow[];
};

function money(value: bigint | null): number | null {
  return value === null ? null : Number(value);
}

function moneyOut(value: bigint): number {
  return Number(value);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

export type PublicListingCard = {
  id: string;
  slug: string;
  intent: string;
  title: string;
  priceAmount: number | null;
  pricePeriod: string;
  negotiable: boolean;
  publishedAt: string | null;
  city: { name: string; slug: string };
  locality: { name: string; slug: string };
  property: {
    type: string;
    societyName: string | null;
    areaValue: number | null;
    areaUnit: string;
    bedrooms: number | null;
    bathrooms: number | null;
    balconies: number | null;
    furnishing: string | null;
    facing: string | null;
    floor: number | null;
    totalFloors: number | null;
  };
  coverImage: string | null;
  mediaCount: number;
};

function baseProperty(p: PropertyRow) {
  return {
    type: p.type,
    societyName: p.societyName,
    areaValue: num(p.areaValue),
    areaUnit: p.areaUnit,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    balconies: p.balconies,
    furnishing: p.furnishing,
    facing: p.facing,
    floor: p.floor,
    totalFloors: p.totalFloors,
  };
}

export function toPublicListingCard(row: ListingRow): PublicListingCard {
  return {
    id: row.id,
    slug: row.slug,
    intent: row.intent,
    title: row.title,
    priceAmount: money(row.priceAmount),
    pricePeriod: row.pricePeriod,
    negotiable: row.negotiable,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    city: { name: row.property.locality.city.name, slug: row.property.locality.city.slug },
    locality: { name: row.property.locality.name, slug: row.property.locality.slug },
    property: baseProperty(row.property),
    coverImage: coverUrl(row.media),
    mediaCount: row.media.filter((m) => m.variant === 'ORIGINAL').length,
  };
}

export type PublicListingDetail = PublicListingCard & {
  description: string;
  maintenanceAmount: number | null;
  depositAmount: number | null;
  availableFrom: string | null;
  images: string[];
  amenities: { code: string; name: string }[];
};

export function toPublicListingDetail(
  row: ListingRow,
  amenities: { code: string; name: string }[],
): PublicListingDetail {
  return {
    ...toPublicListingCard(row),
    description: row.description,
    maintenanceAmount: money(row.maintenanceAmount),
    depositAmount: money(row.depositAmount),
    availableFrom: row.availableFrom ? row.availableFrom.toISOString().slice(0, 10) : null,
    images: galleryUrls(row.media),
    amenities,
  };
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
  internalTitle: string;
  city: { id: string; name: string; slug: string };
  locality: { id: string; name: string; slug: string };
  media: {
    id: string;
    variant: string;
    sortOrder: number;
    url: string;
    contentType: string;
    width: number | null;
    height: number | null;
  }[];
  createdAt: string;
  updatedAt: string;
};

export function toAdminListing(row: ListingRow & { property: PropertyRow & { internalTitle: string } }): AdminListing {
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
    availableFrom: row.availableFrom ? row.availableFrom.toISOString().slice(0, 10) : null,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    internalTitle: row.property.internalTitle,
    city: {
      id: row.property.locality.city.id,
      name: row.property.locality.city.name,
      slug: row.property.locality.city.slug,
    },
    locality: { id: row.property.locality.id, name: row.property.locality.name, slug: row.property.locality.slug },
    media: row.media
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.variant.localeCompare(b.variant))
      .map((m) => ({
        id: m.id,
        variant: m.variant,
        sortOrder: m.sortOrder,
        url: publicUrl(m.storageKey),
        contentType: m.contentType,
        width: m.width,
        height: m.height,
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export { moneyOut };
