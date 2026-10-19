// Demo data for local/staging. Run after `prisma:seed` (needs RBAC, cities, amenities).
// Idempotent: users are upserted by email, properties/listings by internalTitle/slug.
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient, PropertyType, ListingIntent, Furnishing, LeadStatus } from '@prisma/client';
import * as argon2 from 'argon2';

loadDotenv({ path: resolve(__dirname, '../../../.env') });
loadDotenv({ path: resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo@12345';

const USERS = [
  { email: 'admin@demo.ncrhomes.in', phone: '9000000001', name: 'Demo Admin', role: 'ADMIN' },
  { email: 'agent@demo.ncrhomes.in', phone: '9000000002', name: 'Demo Agent', role: 'SALES_AGENT' },
  { email: 'customer@demo.ncrhomes.in', phone: '9000000003', name: 'Demo Customer', role: 'CUSTOMER' },
];

interface Demo {
  title: string;
  city: string;
  locality: string;
  type: PropertyType;
  intent: ListingIntent;
  society: string;
  bedrooms?: number;
  bathrooms?: number;
  area: number;
  floor?: number;
  totalFloors?: number;
  furnishing?: Furnishing;
  price: number;
  maintenance?: number;
  deposit?: number;
  amenities: string[];
  description: string;
}

const DEMOS: Demo[] = [
  { title: '3 BHK Apartment in Dwarka', city: 'delhi', locality: 'dwarka', type: 'RESIDENTIAL', intent: 'BUY', society: 'Sunrise Heights', bedrooms: 3, bathrooms: 3, area: 1450, floor: 7, totalFloors: 14, furnishing: 'SEMI', price: 14500000, maintenance: 3500, amenities: ['lift', 'security', 'park', 'power_backup'], description: 'Spacious 3 BHK close to Dwarka metro with park-facing balcony.' },
  { title: '2 BHK Flat for Rent in Saket', city: 'delhi', locality: 'saket', type: 'RESIDENTIAL', intent: 'RENT', society: 'Saket Residency', bedrooms: 2, bathrooms: 2, area: 980, floor: 3, totalFloors: 6, furnishing: 'FURNISHED', price: 38000, deposit: 76000, amenities: ['security', 'visitor_parking', 'water_supply'], description: 'Fully furnished 2 BHK near Select Citywalk.' },
  { title: '1 BHK Studio in Rohini', city: 'delhi', locality: 'rohini', type: 'RESIDENTIAL', intent: 'RENT', society: 'Rohini Green', bedrooms: 1, bathrooms: 1, area: 520, floor: 2, totalFloors: 5, furnishing: 'SEMI', price: 16500, deposit: 33000, amenities: ['security', 'water_supply'], description: 'Compact studio ideal for working professionals.' },
  { title: '3 BHK in Sector 137 Noida', city: 'noida', locality: 'sector-137', type: 'RESIDENTIAL', intent: 'BUY', society: 'Expressway Greens', bedrooms: 3, bathrooms: 2, area: 1620, floor: 11, totalFloors: 22, furnishing: 'UNFURNISHED', price: 9800000, maintenance: 4200, amenities: ['lift', 'gym', 'clubhouse', 'park', 'power_backup'], description: 'Modern high-rise on the Noida Expressway with clubhouse.' },
  { title: '2 BHK for Rent in Sector 62', city: 'noida', locality: 'sector-62', type: 'RESIDENTIAL', intent: 'RENT', society: 'Tech Park Residency', bedrooms: 2, bathrooms: 2, area: 1100, floor: 5, totalFloors: 12, furnishing: 'SEMI', price: 24000, deposit: 48000, amenities: ['lift', 'security', 'visitor_parking'], description: 'Walking distance to Sector 62 IT offices.' },
  { title: 'Office Space in Sector 18', city: 'noida', locality: 'sector-18', type: 'COMMERCIAL', intent: 'RENT', society: 'Atta Business Tower', area: 1800, floor: 4, totalFloors: 9, furnishing: 'FURNISHED', price: 135000, deposit: 405000, amenities: ['lift', 'security', 'power_backup', 'visitor_parking'], description: 'Plug-and-play office in the heart of Noida.' },
  { title: '4 BHK Villa in Greater Noida', city: 'greater-noida', locality: 'knowledge-park', type: 'RESIDENTIAL', intent: 'BUY', society: 'Palm Villas', bedrooms: 4, bathrooms: 4, area: 3200, floor: 0, totalFloors: 3, furnishing: 'SEMI', price: 21000000, maintenance: 6000, amenities: ['security', 'park', 'clubhouse', 'power_backup'], description: 'Independent villa with private garden and parking.' },
  { title: 'Residential Plot in Jagat Farm', city: 'greater-noida', locality: 'jagat-farm', type: 'PLOT', intent: 'BUY', society: 'Jagat Enclave', area: 2400, price: 7200000, amenities: ['water_supply'], description: '200 sq yd corner plot in a gated layout.' },
  { title: '3 BHK in Indirapuram', city: 'ghaziabad', locality: 'indirapuram', type: 'RESIDENTIAL', intent: 'BUY', society: 'Shakti Khand Apartments', bedrooms: 3, bathrooms: 2, area: 1350, floor: 6, totalFloors: 10, furnishing: 'SEMI', price: 8900000, maintenance: 2800, amenities: ['lift', 'security', 'visitor_parking'], description: 'Well-connected 3 BHK near Indirapuram Habitat Centre.' },
  { title: '2 BHK for Rent in Vaishali', city: 'ghaziabad', locality: 'vaishali', type: 'RESIDENTIAL', intent: 'RENT', society: 'Vaishali Heights', bedrooms: 2, bathrooms: 1, area: 900, floor: 4, totalFloors: 8, furnishing: 'UNFURNISHED', price: 17500, deposit: 35000, amenities: ['lift', 'security'], description: 'Near Vaishali metro, family-friendly society.' },
  { title: '3 BHK on Golf Course Road', city: 'gurugram', locality: 'golf-course-road', type: 'RESIDENTIAL', intent: 'RENT', society: 'Crest Towers', bedrooms: 3, bathrooms: 3, area: 2100, floor: 15, totalFloors: 30, furnishing: 'FURNISHED', price: 120000, deposit: 360000, amenities: ['lift', 'gym', 'clubhouse', 'power_backup', 'security'], description: 'Luxury furnished apartment with skyline views.' },
  { title: '2 BHK in Sector 56 Gurugram', city: 'gurugram', locality: 'sector-56', type: 'RESIDENTIAL', intent: 'BUY', society: 'Rapid Metro Homes', bedrooms: 2, bathrooms: 2, area: 1150, floor: 8, totalFloors: 18, furnishing: 'SEMI', price: 11200000, maintenance: 3000, amenities: ['lift', 'gym', 'park', 'security'], description: 'Next to Rapid Metro with clubhouse access.' },
];

function slugify(s: string) {
  return s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);
}

async function seedUsers() {
  const hash = await argon2.hash(DEMO_PASSWORD);
  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash: hash, status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null, deletedAt: null },
      create: { email: u.email, phone: u.phone, name: u.name, passwordHash: hash, emailVerifiedAt: new Date() },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    ids[u.role] = user.id;
  }
  return ids;
}

async function seedListings() {
  const created: string[] = [];
  for (const d of DEMOS) {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: d.city } });
    const locality = await prisma.locality.findUniqueOrThrow({
      where: { cityId_slug: { cityId: city.id, slug: d.locality } },
    });
    const slug = `${slugify(d.title)}-demo`;
    const existing = await prisma.listing.findFirst({ where: { slug } });
    if (existing) {
      created.push(existing.id);
      continue;
    }
    const property = await prisma.property.create({
      data: {
        type: d.type,
        cityId: city.id,
        localityId: locality.id,
        societyName: d.society,
        addressText: `${d.society}, ${locality.name}, ${city.name}`,
        areaValue: d.area,
        bedrooms: d.bedrooms,
        bathrooms: d.bathrooms,
        floor: d.floor,
        totalFloors: d.totalFloors,
        furnishing: d.furnishing,
        internalTitle: `[demo] ${d.title}`,
      },
    });
    const amenities = await prisma.amenity.findMany({ where: { code: { in: d.amenities } } });
    await prisma.propertyAmenity.createMany({
      data: amenities.map((a) => ({ propertyId: property.id, amenityId: a.id })),
      skipDuplicates: true,
    });
    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        intent: d.intent,
        status: 'PUBLISHED',
        title: d.title,
        description: d.description,
        slug,
        priceAmount: BigInt(d.price),
        pricePeriod: d.intent === 'RENT' ? 'MONTHLY' : 'ONE_TIME',
        maintenanceAmount: d.maintenance ? BigInt(d.maintenance) : null,
        depositAmount: d.deposit ? BigInt(d.deposit) : null,
        negotiable: d.intent === 'BUY',
        availableFrom: new Date(),
        publishedAt: new Date(),
      },
    });
    created.push(listing.id);
  }
  return created;
}

// Mark most demo listings as visited and verified by the demo agent; leave a few unverified for contrast.
async function seedVerification(users: Record<string, string>) {
  const slugs = DEMOS.map((d) => `${slugify(d.title)}-demo`);
  for (const [i, slug] of slugs.entries()) {
    const verified = i % 4 !== 3;
    await prisma.listing.updateMany({
      where: { slug },
      data: {
        lastConfirmedAt: new Date(),
        verifiedAt: verified ? new Date(Date.now() - (i % 5) * 86_400_000) : null,
        verifiedByUserId: verified ? users.SALES_AGENT : null,
      },
    });
  }
}

async function seedLeads(listingIds: string[], users: Record<string, string>) {
  if ((await prisma.lead.count({ where: { email: { endsWith: '@example.com' } } })) > 0) return;
  const statuses: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'VISIT_SCHEDULED', 'NEW'];
  for (let i = 0; i < statuses.length; i++) {
    await prisma.lead.create({
      data: {
        listingId: listingIds[i % listingIds.length],
        userId: i === 0 ? users.CUSTOMER : null,
        assignedToUserId: i % 2 === 1 ? users.SALES_AGENT : null,
        name: `Sample Lead ${i + 1}`,
        phone: `98000000${10 + i}`,
        email: `lead${i + 1}@example.com`,
        message: 'I am interested in this property. Please call me.',
        status: statuses[i],
        firstResponseAt: statuses[i] === 'NEW' ? null : new Date(),
      },
    });
  }
}

// Leads assigned to the demo agent (their inbox) plus saved homes for the agent and customer.
async function seedAgentData(listingIds: string[], users: Record<string, string>) {
  const names = ['Rahul Verma', 'Priya Sharma', 'Amit Singh', 'Neha Gupta', 'Vikram Malhotra', 'Sunita Rao', 'Karan Mehta', 'Anjali Jain'];
  const statuses: LeadStatus[] = ['NEW', 'NEW', 'CONTACTED', 'CONTACTED', 'QUALIFIED', 'VISIT_SCHEDULED', 'WON', 'LOST'];
  for (let i = 0; i < names.length; i++) {
    const email = `agentlead${i + 1}@example.com`;
    if (await prisma.lead.findFirst({ where: { email } })) continue;
    const createdAt = new Date(Date.now() - i * 86_400_000);
    await prisma.lead.create({
      data: {
        listingId: listingIds[(i * 2) % listingIds.length],
        assignedToUserId: users.SALES_AGENT,
        name: names[i],
        phone: `97000000${10 + i}`,
        email,
        message: 'Is this still available? I would like to schedule a visit this weekend.',
        status: statuses[i],
        createdAt,
        // Lead 1 is fresh (waiting), lead 2 is a day old and overdue, the rest were answered at varying speeds.
        firstResponseAt: statuses[i] === 'NEW' ? null : new Date(createdAt.getTime() + (20 + 25 * i) * 60_000),
      },
    });
  }
  // The demo's won lead closed two days ago at a realistic value, so the dashboard has deal figures.
  await prisma.lead.updateMany({
    where: { email: 'agentlead7@example.com', status: 'WON', closedAmount: null },
    data: { closedAmount: BigInt(28000), closedOn: new Date(`${new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`) },
  });
  for (const uid of [users.SALES_AGENT, users.CUSTOMER]) {
    for (const listingId of listingIds.slice(0, 4)) {
      await prisma.savedListing.upsert({
        where: { userId_listingId: { userId: uid, listingId } },
        update: {},
        create: { userId: uid, listingId },
      });
    }
  }
}

// Visit requests: three on the agent's leads (one per active status) and two from the demo customer.
async function seedVisits(users: Record<string, string>) {
  const MARK = '[demo] ';
  if ((await prisma.visit.count({ where: { notes: { startsWith: MARK } } })) > 0) return;
  const day = (n: number) => new Date(`${new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`);

  const agentLeads = await prisma.lead.findMany({
    where: { email: { in: ['agentlead3@example.com', 'agentlead5@example.com', 'agentlead6@example.com'] } },
    orderBy: { email: 'asc' },
  });
  const plan = [
    { status: 'REQUESTED', slot: 'MORNING', date: 2 },
    { status: 'CONFIRMED', slot: 'EVENING', date: 3 },
    { status: 'COMPLETED', slot: 'AFTERNOON', date: -1 },
  ] as const;
  for (const [i, lead] of agentLeads.entries()) {
    if (!lead.listingId) continue;
    await prisma.visit.create({
      data: {
        leadId: lead.id,
        listingId: lead.listingId,
        preferredDate: day(plan[i].date),
        preferredSlot: plan[i].slot,
        status: plan[i].status,
        notes: `${MARK}Please call before arriving.`,
      },
    });
  }

  const customerLead = await prisma.lead.findFirst({ where: { userId: users.CUSTOMER }, orderBy: { createdAt: 'asc' } });
  if (customerLead?.listingId) {
    await prisma.visit.create({
      data: {
        leadId: customerLead.id,
        listingId: customerLead.listingId,
        preferredDate: day(4),
        preferredSlot: 'ANY',
        status: 'REQUESTED',
        notes: `${MARK}Bringing family.`,
      },
    });
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production');
  const users = await seedUsers();
  const listings = await seedListings();
  await seedVerification(users);
  await seedLeads(listings, users);
  await seedAgentData(listings, users);
  await seedVisits(users);
  console.log(`Demo users: ${USERS.length}, listings: ${listings.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
