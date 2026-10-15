export type PublicUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  roles: string[];
};

export function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  phone: string;
  roles?: { role: { code: string } }[];
}, roleCodes?: string[]): PublicUser {
  const roles =
    roleCodes ??
    (user.roles ?? []).map((r) => r.role.code);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    roles,
  };
}
