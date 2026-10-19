import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

loadDotenv({ path: resolve(__dirname, '../../../.env') });
loadDotenv({ path: resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const PERMISSIONS = [
  'listing.manage',
  'property.manage',
  'location.manage',
  'media.manage',
  'lead.create',
  'lead.read_own',
  'lead.read_assigned',
  'lead.read_all',
  'lead.update_assigned',
  'lead.update_all',
  'lead.assign',
  'visit.read_own',
  'visit.manage_staff',
  'user.manage',
  'role.manage',
  'audit.read',
  'dashboard.read',
  // Money: fee amounts are visible to admins only, never to sales agents.
  'finance.read',
  'finance.manage',
] as const;

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  CUSTOMER: ['lead.create', 'lead.read_own', 'visit.read_own'],
  SALES_AGENT: [
    'lead.create',
    'lead.read_assigned',
    'lead.update_assigned',
    'visit.manage_staff',
    'dashboard.read',
  ],
  ADMIN: [
    'listing.manage',
    'property.manage',
    'location.manage',
    'media.manage',
    'lead.create',
    'lead.read_own',
    'lead.read_assigned',
    'lead.read_all',
    'lead.update_assigned',
    'lead.update_all',
    'lead.assign',
    'visit.read_own',
    'visit.manage_staff',
    'user.manage',
    'audit.read',
    'dashboard.read',
    'finance.read',
    'finance.manage',
  ],
  SUPER_ADMIN: PERMISSIONS,
};

const CITIES: { name: string; slug: string; localities: { name: string; slug: string }[] }[] = [
  {
    name: 'Delhi',
    slug: 'delhi',
    localities: [
      { name: 'Dwarka', slug: 'dwarka' },
      { name: 'Rohini', slug: 'rohini' },
      { name: 'Saket', slug: 'saket' },
      { name: 'Dwarka Mor', slug: 'dwarka-mor' },
      { name: 'Karol Bagh', slug: 'karol-bagh' },
      { name: 'Vasant Kunj', slug: 'vasant-kunj' },
    ],
  },
  {
    name: 'Noida',
    slug: 'noida',
    localities: [
      { name: 'Sector 62', slug: 'sector-62' },
      { name: 'Sector 18', slug: 'sector-18' },
      { name: 'Sector 137', slug: 'sector-137' },
      { name: 'Sector 76', slug: 'sector-76' },
    ],
  },
  {
    name: 'Greater Noida',
    slug: 'greater-noida',
    localities: [
      { name: 'Knowledge Park', slug: 'knowledge-park' },
      { name: 'Gamma 1', slug: 'gamma-1' },
      { name: 'Jagat Farm', slug: 'jagat-farm' },
    ],
  },
  {
    name: 'Ghaziabad',
    slug: 'ghaziabad',
    localities: [
      { name: 'Indirapuram', slug: 'indirapuram' },
      { name: 'Vaishali', slug: 'vaishali' },
      { name: 'Crossing Republik', slug: 'crossing-republik' },
    ],
  },
  {
    name: 'Gurugram',
    slug: 'gurugram',
    localities: [
      { name: 'DLF Phase 1', slug: 'dlf-phase-1' },
      { name: 'Golf Course Road', slug: 'golf-course-road' },
      { name: 'Sohna Road', slug: 'sohna-road' },
      { name: 'Sector 56', slug: 'sector-56' },
    ],
  },
];

const AMENITIES: { code: string; name: string }[] = [
  { code: 'lift', name: 'Lift' },
  { code: 'security', name: 'Security' },
  { code: 'park', name: 'Park' },
  { code: 'power_backup', name: 'Power Backup' },
  { code: 'gym', name: 'Gym' },
  { code: 'clubhouse', name: 'Clubhouse' },
  { code: 'visitor_parking', name: 'Visitor Parking' },
  { code: 'water_supply', name: 'Water Supply' },
  { code: 'piped_gas', name: 'Piped Gas' },
  { code: 'wheelchair', name: 'Wheelchair Access' },
];

const SERVICES: { slug: string; title: string; summary: string; sortOrder: number }[] = [
  { slug: 'interior', title: 'Interior Design', summary: 'Home interiors for NCR apartments.', sortOrder: 1 },
  { slug: 'painting', title: 'Painting', summary: 'Interior and exterior painting.', sortOrder: 2 },
  { slug: 'cleaning', title: 'Home Cleaning', summary: 'Deep cleaning for move-in.', sortOrder: 3 },
  { slug: 'packers_movers', title: 'Packers and Movers', summary: 'Local NCR relocation.', sortOrder: 4 },
  { slug: 'home_loan', title: 'Home Loan', summary: 'Connect with lending partners.', sortOrder: 5 },
];

async function seedRbac() {
  const permRows = [];
  for (const code of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code },
    });
    permRows.push(row);
  }
  const permByCode = Object.fromEntries(permRows.map((p) => [p.code, p.id]));

  const roleDefs = [
    { code: 'CUSTOMER', name: 'Customer' },
    { code: 'SALES_AGENT', name: 'Sales Agent' },
    { code: 'ADMIN', name: 'Admin' },
    { code: 'SUPER_ADMIN', name: 'Super Admin' },
  ];
  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name },
      create: r,
    });
    const codes = ROLE_PERMISSIONS[r.code] ?? [];
    for (const c of codes) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permByCode[c] } },
        update: {},
        create: { roleId: role.id, permissionId: permByCode[c] },
      });
    }
  }
}

async function seedCatalog() {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  for (const city of CITIES) {
    const row = await prisma.city.upsert({
      where: { slug: city.slug },
      update: { name: city.name, isActive: true },
      create: { name: city.name, slug: city.slug },
    });
    for (const loc of city.localities) {
      await prisma.locality.upsert({
        where: { cityId_slug: { cityId: row.id, slug: loc.slug } },
        update: { name: loc.name, isActive: true },
        create: { cityId: row.id, name: loc.name, slug: loc.slug },
      });
    }
  }
  for (const a of AMENITIES) {
    await prisma.amenity.upsert({
      where: { code: a.code },
      update: { name: a.name, isActive: true },
      create: a,
    });
  }
  for (const s of SERVICES) {
    await prisma.serviceCatalogItem.upsert({
      where: { slug: s.slug },
      update: { title: s.title, summary: s.summary, sortOrder: s.sortOrder, isActive: true },
      create: s,
    });
  }
}

async function seedBootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const phone = process.env.BOOTSTRAP_ADMIN_PHONE;
  const name = process.env.BOOTSTRAP_ADMIN_NAME || 'Bootstrap Admin';
  if (!email || !password || !phone) {
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('.localhost')) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email (not *.localhost)');
  }
  if (process.env.NODE_ENV === 'production' && password.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD too short for production');
  }
  const superRole = await prisma.role.findUnique({ where: { code: 'SUPER_ADMIN' } });
  if (!superRole) {
    throw new Error('SUPER_ADMIN role missing');
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: existing.id, roleId: superRole.id } },
      update: {},
      create: { userId: existing.id, roleId: superRole.id },
    });
    return;
  }
  const passwordHash = await argon2.hash(password);
  await prisma.user.create({
    data: {
      email,
      phone,
      name,
      passwordHash,
      roles: { create: { roleId: superRole.id } },
    },
  });
}

async function main() {
  await seedRbac();
  await seedCatalog();
  await seedBootstrapAdmin();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
