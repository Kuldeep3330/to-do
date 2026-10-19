import { api, apiData } from '../client';
import type {
  AdminLead,
  AdminUser,
  StaffMember,
  AdminListing,
  AdminListingDetail,
  AdminMedia,
  AdminProperty,
  Amenity,
  City,
  DashboardCounts,
  AdminVisit,
  CustomerLead,
  CustomerVisit,
  VisitSlot,
  LeadStatus,
  Locality,
  Paged,
  PublicListingCard,
  PublicListingDetail,
  PublicUser,
} from '../types';

type Q = Record<string, string | number | boolean | null | undefined>;

/* ───────────── auth + me ───────────── */
export const authApi = {
  login: (body: { email: string; password: string }) =>
    apiData<{ user: PublicUser }>('/api/v1/auth/login', { method: 'POST', body, skipRefresh: true }),
  register: (body: { email: string; password: string; name: string; phone: string }) =>
    apiData<{ user: PublicUser }>('/api/v1/auth/register', { method: 'POST', body, skipRefresh: true }),
  logout: () => api<void>('/api/v1/auth/logout', { method: 'POST', skipRefresh: true }),
  forgotPassword: (body: { email: string }) =>
    api<unknown>('/api/v1/auth/forgot-password', { method: 'POST', body, skipRefresh: true }),
  resetPassword: (body: { token: string; password: string }) =>
    api<unknown>('/api/v1/auth/reset-password', { method: 'POST', body, skipRefresh: true }),
};

export const meApi = {
  get: () => apiData<PublicUser>('/api/v1/me', { noRedirect: true }),
  update: (body: { name?: string; phone?: string }) =>
    apiData<PublicUser>('/api/v1/me', { method: 'PATCH', body }),
  leads: (query?: Q) => api<Paged<CustomerLead>>('/api/v1/me/leads', { query }),
  visits: (query?: Q) => api<Paged<CustomerVisit>>('/api/v1/me/visits', { query }),
  requestVisit: (body: { listingId: string; preferredDate?: string; preferredSlot?: VisitSlot; notes?: string }) =>
    apiData<CustomerVisit>('/api/v1/me/visits', { method: 'POST', body }),
  cancelVisit: (id: string) => apiData<CustomerVisit>(`/api/v1/me/visits/${id}/cancel`, { method: 'POST' }),
};

/* ───────────── locations (Phase 2) ───────────── */
export const locationsApi = {
  cities: () => apiData<City[]>('/api/v1/cities'),
  localities: (citySlug: string) => apiData<Locality[]>(`/api/v1/cities/${citySlug}/localities`),
  amenities: () => apiData<Amenity[]>('/api/v1/admin/amenities'),
};

/* ───────────── admin properties ───────────── */
export type PropertyInput = Partial<Omit<AdminProperty, 'id' | 'status' | 'deletedAt' | 'createdAt' | 'updatedAt' | 'areaUnit'>>;

export const adminPropertiesApi = {
  list: (query?: Q) => api<Paged<AdminProperty>>('/api/v1/admin/properties', { query }),
  get: (id: string) => apiData<AdminProperty>(`/api/v1/admin/properties/${id}`),
  create: (body: PropertyInput) =>
    apiData<AdminProperty>('/api/v1/admin/properties', { method: 'POST', body }),
  update: (id: string, body: PropertyInput) =>
    apiData<AdminProperty>(`/api/v1/admin/properties/${id}`, { method: 'PATCH', body }),
  archive: (id: string) =>
    apiData<AdminProperty>(`/api/v1/admin/properties/${id}/archive`, { method: 'POST' }),
};

/* ───────────── admin listings ───────────── */
export type ListingInput = {
  propertyId?: string;
  intent?: 'BUY' | 'RENT';
  pricePeriod?: 'MONTHLY' | 'ONE_TIME';
  title?: string;
  description?: string;
  priceAmount?: number | null;
  maintenanceAmount?: number | null;
  depositAmount?: number | null;
  negotiable?: boolean;
  availableFrom?: string | null;
};

export const adminListingsApi = {
  list: (query?: Q) => api<Paged<AdminListing>>('/api/v1/admin/listings', { query }),
  get: (id: string) => apiData<AdminListingDetail>(`/api/v1/admin/listings/${id}`),
  create: (body: ListingInput) =>
    apiData<AdminListing>('/api/v1/admin/listings', { method: 'POST', body }),
  update: (id: string, body: ListingInput) =>
    apiData<AdminListing>(`/api/v1/admin/listings/${id}`, { method: 'PATCH', body }),
  publish: (id: string) =>
    apiData<AdminListing>(`/api/v1/admin/listings/${id}/publish`, { method: 'POST' }),
  pause: (id: string) => apiData<AdminListing>(`/api/v1/admin/listings/${id}/pause`, { method: 'POST' }),
  verify: (id: string) => apiData<AdminListing>(`/api/v1/admin/listings/${id}/verify`, { method: 'POST' }),
  confirm: (id: string) => apiData<AdminListing>(`/api/v1/admin/listings/${id}/confirm`, { method: 'POST' }),
  close: (id: string) => apiData<AdminListing>(`/api/v1/admin/listings/${id}/close`, { method: 'POST' }),
};

export const adminMediaApi = {
  upload: (listingId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiData<AdminMedia>(`/api/v1/admin/listings/${listingId}/media`, { method: 'POST', form });
  },
  update: (id: string, body: { sortOrder: number }) =>
    apiData<AdminMedia>(`/api/v1/admin/media/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/api/v1/admin/media/${id}`, { method: 'DELETE' }),
};

/* ───────────── admin leads ───────────── */
export const adminLeadsApi = {
  list: (query?: Q) => api<Paged<AdminLead>>('/api/v1/admin/leads', { query }),
  get: (id: string) => apiData<AdminLead>(`/api/v1/admin/leads/${id}`),
  update: (
    id: string,
    body: { status?: LeadStatus; assignedToUserId?: string | null; closedAmount?: number; closedOn?: string },
  ) =>
    apiData<AdminLead>(`/api/v1/admin/leads/${id}`, { method: 'PATCH', body }),
};

export type VisitCommand = 'confirm' | 'complete' | 'no-show' | 'cancel';

export const adminVisitsApi = {
  list: (query?: Q) => api<Paged<AdminVisit>>('/api/v1/admin/visits', { query }),
  act: (id: string, command: VisitCommand, body?: { preferredDate?: string; preferredSlot?: VisitSlot }) =>
    apiData<AdminVisit>(`/api/v1/admin/visits/${id}/${command}`, { method: 'POST', body: body ?? {} }),
};

/* ───────────── public (client-side use only; RSC uses serverApi) ───────────── */
export const publicApi = {
  listings: (query?: Q) => api<Paged<PublicListingCard>>('/api/v1/listings', { query }),
  listing: (slug: string) => apiData<PublicListingDetail>(`/api/v1/listings/${slug}`),
  createLead: (body: {
    listingSlug: string;
    name: string;
    phone: string;
    email?: string;
    message?: string;
  }) => api<{ data: { ok: true } }>('/api/v1/leads', { method: 'POST', body }),
};

/* ───────────── admin staff / users ───────────── */
export const adminStaffApi = {
  /** Active staff who can be assigned leads (needs lead.assign). */
  assignable: () => apiData<StaffMember[]>('/api/v1/admin/staff'),
};

export const adminUsersApi = {
  list: (query?: Q) => api<Paged<AdminUser>>('/api/v1/admin/users', { query }),
  createStaff: (body: { email: string; name: string; phone: string; password: string; role: 'SALES_AGENT' | 'ADMIN' }) =>
    apiData<AdminUser>('/api/v1/admin/users', { method: 'POST', body }),
  setStatus: (id: string, status: 'ACTIVE' | 'DISABLED') =>
    apiData<AdminUser>(`/api/v1/admin/users/${id}`, { method: 'PATCH', body: { status } }),
};

/* ───────────── saved listings + dashboard ───────────── */
export const savedApi = {
  list: () => apiData<PublicListingCard[]>('/api/v1/me/saved-listings'),
  ids: () => apiData<string[]>('/api/v1/me/saved-listings/ids', { noRedirect: true }),
  save: (listingId: string) =>
    apiData<{ listingId: string; saved: true }>('/api/v1/me/saved-listings', { method: 'POST', body: { listingId } }),
  unsave: (listingId: string) => api<void>(`/api/v1/me/saved-listings/${listingId}`, { method: 'DELETE' }),
};

export const dashboardApi = {
  get: () => apiData<DashboardCounts>('/api/v1/admin/dashboard'),
};
