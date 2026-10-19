/** API response types. Mirrors apps/api mappers; keep in sync when contracts change. */

export type Meta = { page: number; pageSize: number; total: number };
export type Paged<T> = { data: T[]; meta: Meta };

export type Intent = 'BUY' | 'RENT';
export type PropertyType = 'RESIDENTIAL' | 'COMMERCIAL' | 'PLOT';
export type Furnishing = 'UNFURNISHED' | 'SEMI' | 'FURNISHED';
export type ListingStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'CLOSED';
export type PricePeriod = 'MONTHLY' | 'ONE_TIME';
export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'UNQUALIFIED'
  | 'VISIT_SCHEDULED'
  | 'WON'
  | 'LOST'
  | 'SPAM';

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  roles: string[];
};

export type NamedRef = { name: string; slug: string };

export type PublicListingCard = {
  id: string;
  slug: string;
  intent: Intent;
  status: 'PUBLISHED';
  title: string;
  priceAmount: number | null;
  pricePeriod: PricePeriod;
  bedrooms: number | null;
  areaValue: number | null;
  areaUnit: string;
  furnishing: Furnishing | null;
  city: NamedRef;
  locality: NamedRef;
  coverImageUrl: string | null;
  publishedAt: string | null;
  verifiedAt: string | null;
  lastConfirmedAt: string | null;
};

export type PublicListingDetail = Omit<PublicListingCard, 'bedrooms' | 'furnishing'> & {
  description: string;
  maintenanceAmount: number | null;
  depositAmount: number | null;
  negotiable: boolean;
  availableFrom: string | null;
  propertyType: PropertyType;
  societyName: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  balconies: number | null;
  floor: number | null;
  totalFloors: number | null;
  furnishing: Furnishing | null;
  facing: string | null;
  gallery: string[];
  /** Active amenities of the property, alphabetical. */
  amenities: Omit<Amenity, 'id'>[];
  verifiedByFirstName: string | null;
};

export type AdminListing = {
  id: string;
  propertyId: string;
  slug: string;
  intent: Intent;
  status: ListingStatus;
  title: string;
  description: string;
  priceAmount: number | null;
  pricePeriod: PricePeriod;
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
    type: PropertyType;
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

export type AdminProperty = {
  id: string;
  type: PropertyType;
  status: 'ACTIVE' | 'ARCHIVED';
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
  furnishing: Furnishing | null;
  facing: string | null;
  ageYears: number | null;
  parkingCount: number | null;
  internalTitle: string;
  amenityIds: string[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminMedia = {
  id: string;
  listingId: string;
  url: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sortOrder: number;
  variant: 'ORIGINAL' | 'CARD' | 'DETAIL';
  createdAt: string;
};

export type VisitStatus = 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
export type VisitSlot = 'ANY' | 'MORNING' | 'AFTERNOON' | 'EVENING';

export type CustomerVisit = {
  id: string;
  leadId: string;
  status: VisitStatus;
  /** Calendar date, YYYY-MM-DD. */
  preferredDate: string | null;
  preferredSlot: VisitSlot;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  listing: { id: string; slug: string; title: string; intent: Intent };
};

export type AdminVisit = CustomerVisit & {
  lead: { id: string; name: string; phone: string; assignee: { id: string; name: string } | null } | null;
};

export type CustomerLead = {
  id: string;
  status: LeadStatus;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  createdAt: string;
  listing: { id: string; slug: string; title: string; intent: Intent } | null;
};

export type AdminLead = {
  id: string;
  listingId: string | null;
  userId: string | null;
  assignedToUserId: string | null;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: LeadStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
  /** When the lead first left NEW (or a visit was confirmed); null while still waiting. */
  firstResponseAt: string | null;
  /** createdAt plus the response target. */
  respondBy: string;
  /** Still waiting and past `respondBy`. */
  overdue: boolean;
  /** Minutes from enquiry to first response, once answered. */
  responseMinutes: number | null;
  /** Deal value in INR (monthly rent for rentals); only set on won leads. */
  closedAmount: number | null;
  /** Day the deal closed, YYYY-MM-DD. */
  closedOn: string | null;
  listing: { id: string; slug: string; title: string; intent: Intent; status: ListingStatus } | null;
  assignee: { id: string; name: string; email: string } | null;
};

export type City = { id: string; name: string; slug: string };
export type Locality = { id: string; name: string; slug: string };
export type Amenity = { id: string; code: string; name: string };

export type AdminListingMedia = {
  id: string;
  url: string;
  thumbnailUrl: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sortOrder: number;
};

export type AdminListingDetail = AdminListing & { media: AdminListingMedia[] };

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED';
export type AdminUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  status: UserStatus;
  roles: string[];
  createdAt: string;
};
export type StaffMember = { id: string; name: string; email: string; roles: string[] };

export type DashboardCounts = {
  publishedListings: number | null;
  draftListings: number | null;
  leadsNew: number;
  leadsToday: number;
  leadsTotal: number;
  leadsOverdue: number;
  dealsWon: number;
  winRatePercent: number | null;
  wonRentMonthly: number;
  wonSaleValue: number;
  responseTargetMinutes: number;
  medianResponseMinutes: number | null;
  scopedToAssigned: boolean;
};
