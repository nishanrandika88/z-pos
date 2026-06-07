export type Role = "ADMIN" | "CASHIER";

export type Permission =
  | "dashboard:read"
  | "pos:bill"
  | "orders:read"
  | "orders:reprint"
  | "catalog:manage"
  | "discounts:manage"
  | "manual-discount:apply"
  | "reports:read"
  | "users:manage"
  | "settings:manage"
  | "printers:manage"
  | "audit:read";

const rolePermissions: Record<Role, Permission[]> = {
  ADMIN: [
    "dashboard:read",
    "pos:bill",
    "orders:read",
    "orders:reprint",
    "catalog:manage",
    "discounts:manage",
    "manual-discount:apply",
    "reports:read",
    "users:manage",
    "settings:manage",
    "printers:manage",
    "audit:read",
  ],
  CASHIER: ["pos:bill", "orders:read"],
};

export function can(role: Role | undefined, permission: Permission) {
  if (!role) return false;
  return rolePermissions[role].includes(permission);
}
