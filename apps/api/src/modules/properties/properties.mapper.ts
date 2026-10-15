export type AdminProperty = {
  id: string;
  type: string;
  status: string;
  cityId: string;
  localityId: string;
  societyName: string | null;
  addressText: string | null;
  lat: number | null;
  lng: number | null;
  areaValue: number | null;
  areaUnit: string;
  bedrooms: number | null;
  bathrooms: number | null;
  balconies: number | null;
  floor: number | null;
  totalFloors: number | null;
  furnishing: string | null;
  facing: string | null;
  ageYears: number | null;
  parkingCount: number | null;
  internalTitle: string;
  amenityIds: string[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PropertyRow = {
  id: string;
  type: string;
  status: string;
  cityId: string;
  localityId: string;
  societyName: string | null;
  addressText: string | null;
  lat: unknown;
  lng: unknown;
  areaValue: unknown;
  areaUnit: string;
  bedrooms: number | null;
  bathrooms: number | null;
  balconies: number | null;
  floor: number | null;
  totalFloors: number | null;
  furnishing: string | null;
  facing: string | null;
  ageYears: number | null;
  parkingCount: number | null;
  internalTitle: string;
  amenities: { amenityId: string }[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

export function toAdminProperty(row: PropertyRow): AdminProperty {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    cityId: row.cityId,
    localityId: row.localityId,
    societyName: row.societyName,
    addressText: row.addressText,
    lat: num(row.lat),
    lng: num(row.lng),
    areaValue: num(row.areaValue),
    areaUnit: row.areaUnit,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    balconies: row.balconies,
    floor: row.floor,
    totalFloors: row.totalFloors,
    furnishing: row.furnishing,
    facing: row.facing,
    ageYears: row.ageYears,
    parkingCount: row.parkingCount,
    internalTitle: row.internalTitle,
    amenityIds: row.amenities.map((a) => a.amenityId),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
