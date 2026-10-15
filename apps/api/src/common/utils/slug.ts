export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

export function withSuffix(base: string, suffix: string): string {
  const trimmed = base.slice(0, 180 - suffix.length - 1).replace(/-+$/g, '');
  const out = `${trimmed}-${suffix}`;
  return out.slice(0, 180);
}
