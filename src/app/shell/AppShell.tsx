import { Outlet, NavLink, useLocation } from "react-router";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
  Receipt,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { can } from "@/features/auth/rbac";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard:read" },
  { href: "/pos", label: "POS", icon: Receipt, permission: "pos:bill" },
  { href: "/catalog", label: "Catalog", icon: Boxes, permission: "catalog:manage" },
  { href: "/discounts", label: "Discounts", icon: Percent, permission: "discounts:manage" },
  { href: "/orders", label: "Orders", icon: ClipboardList, permission: "orders:read" },
  { href: "/reports", label: "Reports", icon: BarChart3, permission: "reports:read" },
  { href: "/users", label: "Users", icon: Users, permission: "users:manage" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "settings:manage" },
  { href: "/audit-logs", label: "Audit", icon: ShieldCheck, permission: "audit:read" },
] as const;

export function AppShell() {
  const { profile, logout } = useAuthStore();
  const location = useLocation();
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const visibleItems = navItems.filter((item) => can(profile?.role, item.permission));
  const isPos = location.pathname === "/pos";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Button
        className={cn(
          "fixed bottom-4 z-30 hidden h-12 w-12 rounded-full border border-brand-forest/15 bg-white text-brand-forest shadow-lg hover:bg-white lg:grid",
          isNavCollapsed ? "left-4" : "left-[108px]",
        )}
        size="icon"
        variant="ghost"
        title={isNavCollapsed ? "Show navigation" : "Hide navigation"}
        onClick={() => setIsNavCollapsed((current) => !current)}
      >
        {isNavCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </Button>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 hidden w-[95px] flex-col justify-between border-r border-brand-forest/10 bg-white px-3 py-5 lg:flex",
          isNavCollapsed && "lg:hidden",
        )}
      >
        <div>
          <div className="mb-6 flex justify-center">
            <BrandLogo compact />
          </div>
          <nav className="space-y-3">
            {visibleItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className="group flex min-h-[74px] flex-col items-center justify-center gap-2 rounded-3xl px-2 text-[11px] font-semibold text-brand-espresso/70 transition hover:bg-transparent"
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "grid h-12 w-12 place-items-center rounded-full border transition",
                        isActive
                          ? "border-brand-orange bg-brand-orange text-white"
                          : "border-brand-forest/15 bg-white text-brand-forest",
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        <div>
          <button
            className="flex w-full flex-col items-center justify-center gap-2 rounded-full px-2 py-1 text-[11px] font-semibold text-brand-espresso/70 transition hover:bg-transparent"
            onClick={() => void logout()}
            type="button"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full border border-brand-forest/15 bg-white">
              <LogOut className="h-5 w-5" />
            </span>
            Logout
          </button>
        </div>
      </aside>

      <div
        className={cn(
          "flex h-screen flex-col overflow-hidden bg-background transition-[margin]",
          !isNavCollapsed && "lg:ml-[95px]",
        )}
      >
        {!isPos ? (
        <header className="z-10 flex min-h-16 shrink-0 items-center justify-between border-b border-brand-forest/10 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-2xl font-extrabold text-brand-forest">Zestora</span>
            <span className="rounded-full bg-brand-orange px-3.5 py-1 text-sm font-black text-white">POS</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-brand-forest/10 bg-white px-3 py-2 text-sm font-semibold text-brand-forest">
            <UserCircle className="h-5 w-5 shrink-0" />
            <span className="max-w-48 truncate">{profile?.fullName ?? "Demo Admin"}</span>
            <span className="rounded-full bg-brand-cream px-2 py-0.5 text-[11px] font-bold text-brand-espresso">
              {profile?.role ?? "ADMIN"}
            </span>
          </div>
        </header>
        ) : null}
        <main className={cn(isPos ? "h-screen overflow-hidden p-0" : "min-h-0 flex-1 overflow-y-auto p-4 lg:p-6")}>
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-card lg:hidden">
        {visibleItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground",
                isActive && "text-primary",
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
