import { Outlet, NavLink, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
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
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { can } from "@/features/auth/rbac";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { Button } from "@/shared/ui/button";
import { syncAppData } from "@/shared/lib/app-sync";
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
  const queryClient = useQueryClient();
  const { profile, logout } = useAuthStore();
  const location = useLocation();
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const syncedProfileRef = useRef<string | null>(null);
  const visibleItems = navItems.filter((item) => can(profile?.role, item.permission));
  const isPos = location.pathname === "/pos";
  const userDisplayName = profile?.displayName || profile?.fullName || "Admin";

  useEffect(() => {
    if (!profile?.id || syncedProfileRef.current === profile.id) return;
    syncedProfileRef.current = profile.id;
    void syncAppData(queryClient);
  }, [profile?.id, queryClient]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
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
          "fixed inset-y-0 left-0 z-20 hidden w-[95px] flex-col overflow-hidden border-r border-brand-forest/10 bg-white px-3 py-5 lg:flex",
          isNavCollapsed && "lg:hidden",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-5 flex shrink-0 justify-center">
            <BrandLogo compact />
          </div>
          <nav className="pos-scrollbar -mr-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-3">
            {visibleItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                title={item.label}
                className="group flex min-h-14 flex-col items-center justify-center rounded-3xl px-2 text-[11px] font-semibold text-brand-espresso/70 transition hover:bg-transparent"
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
                    <span className="sr-only">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
            <button
              className="flex min-h-14 w-full flex-col items-center justify-center rounded-full px-2 py-1 text-[11px] font-semibold text-brand-espresso/70 transition hover:bg-transparent"
              onClick={() => void logout()}
              title="Logout"
              type="button"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full border border-brand-forest/15 bg-white">
                <LogOut className="h-5 w-5" />
              </span>
              <span className="sr-only">Logout</span>
            </button>
          </nav>
        </div>
      </aside>

      <div
        className={cn(
          "flex min-h-dvh flex-col bg-background transition-[margin]",
          !isNavCollapsed && "lg:ml-[95px]",
        )}
      >
        <header
          className={cn(
            "sticky top-0 z-10 shrink-0 border-b border-brand-forest/10 bg-white px-3 py-2 sm:px-4 lg:px-6",
            isPos && "lg:hidden",
          )}
        >
          <div className="flex min-h-12 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
              <span className="truncate text-2xl font-extrabold uppercase text-brand-forest">ZESTORA</span>
              <span className="rounded-full bg-brand-orange px-3 py-1 text-sm font-black text-white">POS</span>
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-brand-forest/10 bg-white px-3 py-2 text-sm font-semibold text-brand-forest">
              <UserCircle className="h-5 w-5 shrink-0" />
              <span className="max-w-[7rem] truncate sm:max-w-48">{userDisplayName}</span>
              <span className="rounded-full bg-brand-cream px-2 py-0.5 text-[11px] font-bold text-brand-espresso">
                {profile?.role ?? "ADMIN"}
              </span>
            </div>
          </div>
          <div className="pos-scrollbar -mx-3 mt-2 flex gap-1 overflow-x-auto px-3 pb-1 lg:hidden">
            {visibleItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                title={item.label}
                className={({ isActive }) =>
                  cn(
                    "flex h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition",
                    isActive
                      ? "border-brand-orange bg-brand-orange text-white"
                      : "border-brand-forest/10 bg-white text-brand-espresso/70",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
            <button
              className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-brand-forest/10 bg-white px-3 text-xs font-semibold text-brand-espresso/70"
              onClick={() => void logout()}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </header>
        <main
          className={cn(
            isPos
              ? "min-h-dvh overflow-y-auto p-0 lg:h-dvh lg:overflow-hidden"
              : "min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-4 sm:px-4 lg:p-6",
          )}
        >
          <Outlet />
        </main>
      </div>

    </div>
  );
}
