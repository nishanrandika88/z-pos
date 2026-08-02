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
  | "audit:read"
  | "expenses:read"
  | "expenses:create"
  | "expenses:update"
  | "expenses:void"
  | "expenses:approve"
  | "expenses:receipts"
  | "expenses:reimburse"
  | "expenses:categories"
  | "expenses:reports"
  | "expenses:export"
  | "expenses:inventory"
  | "expenses:salaries";

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
    "expenses:read",
    "expenses:create",
    "expenses:update",
    "expenses:void",
    "expenses:approve",
    "expenses:receipts",
    "expenses:reimburse",
    "expenses:categories",
    "expenses:reports",
    "expenses:export",
    "expenses:inventory",
    "expenses:salaries",
  ],
  CASHIER: ["pos:bill", "orders:read"],
};

export function can(role: Role | undefined, permission: Permission, grants: readonly string[] = []) {
  if (!role) return false;
  return rolePermissions[role].includes(permission) || grants.includes(permission);
}
