import {
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  HeartPulse,
  Home,
  IndianRupee,
  Inbox,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Match only this exact path (the dashboard), not everything beneath it. */
  exact?: boolean;
};

export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  { label: 'Overview', items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true }] },
  {
    label: 'Inventory',
    items: [
      { href: '/admin/properties', label: 'Properties', icon: Home, adminOnly: true },
      { href: '/admin/listings', label: 'Listings', icon: ListChecks, adminOnly: true },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/admin/leads', label: 'Leads', icon: Inbox },
      { href: '/admin/visits', label: 'Visits', icon: CalendarCheck },
      { href: '/admin/reports', label: 'Reports', icon: BarChart3, adminOnly: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/admin/users', label: 'Staff', icon: Users, adminOnly: true },
      { href: '/admin/settings/fees', label: 'Fees', icon: IndianRupee, adminOnly: true },
    ],
  },
  {
    label: 'Oversight',
    items: [
      { href: '/admin/data-quality', label: 'Data quality', icon: ClipboardCheck, adminOnly: true },
      { href: '/admin/audit', label: 'Audit log', icon: ScrollText, adminOnly: true },
      { href: '/admin/system', label: 'System health', icon: HeartPulse, adminOnly: true },
    ],
  },
];

export function isNavActive(item: AdminNavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Breadcrumb trail for the topbar: Admin / Section. Detail pages draw their own trail under the title
 * (Staff > Asha), so the topbar stops at the section instead of repeating it.
 */
export function adminCrumbs(pathname: string): string[] {
  const items = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
  const match = items
    .filter((i) => isNavActive(i, pathname) && i.href !== '/admin')
    .sort((a, b) => b.href.length - a.href.length)[0];
  return ['Admin', match ? match.label : 'Dashboard'];
}
