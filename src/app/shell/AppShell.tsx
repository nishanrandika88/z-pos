import { Outlet, NavLink, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
  Receipt,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { can } from "@/features/auth/rbac";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { Button } from "@/shared/ui/button";
import { syncAppData } from "@/shared/lib/app-sync";
import { cn } from "@/shared/lib/cn";
import { subscribeToDashboardChanges } from "@/shared/lib/dashboard-sync";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard:read" },
  { href: "/pos", label: "POS", icon: Receipt, permission: "pos:bill" },
  { href: "/catalog", label: "Catalog", icon: Boxes, permission: "catalog:manage" },
  { href: "/discounts", label: "Discounts", icon: Percent, permission: "discounts:manage" },
  { href: "/orders", label: "Orders", icon: ClipboardList, permission: "orders:read" },
  { href: "/expenses", label: "Expenses", icon: CircleDollarSign, permission: "expenses:read" },
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const syncedProfileRef = useRef<string | null>(null);
  const dashboardRefreshTimeoutRef = useRef<number | null>(null);
  const visibleItems = navItems.filter((item) => can(profile?.role, item.permission, profile?.permissions));
  const isPos = location.pathname === "/pos";
  const userDisplayName = profile?.displayName || profile?.fullName || "Admin";

  useEffect(() => {
    if (!profile?.id || syncedProfileRef.current === profile.id) return;
    syncedProfileRef.current = profile.id;
    void syncAppData(queryClient);
  }, [profile?.id, queryClient]);

  useEffect(() => {
    if (!profile?.id) return;

    const unsubscribe = subscribeToDashboardChanges(() => {
      if (dashboardRefreshTimeoutRef.current !== null) {
        window.clearTimeout(dashboardRefreshTimeoutRef.current);
      }
      dashboardRefreshTimeoutRef.current = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["dashboard"], refetchType: "active" });
      }, 500);
    });

    return () => {
      unsubscribe();
      if (dashboardRefreshTimeoutRef.current !== null) {
        window.clearTimeout(dashboardRefreshTimeoutRef.current);
      }
    };
  }, [profile?.id, queryClient]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Button
        className={cn(
          "fixed bottom-14 z-30 hidden h-12 w-12 rounded-full border border-brand-forest/15 bg-white text-brand-forest shadow-lg hover:bg-white lg:grid",
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
            <div className="flex min-w-0 items-center gap-2">
              <div className="hidden min-w-0 items-center gap-2 rounded-full border border-brand-forest/10 bg-white px-3 py-2 text-sm font-semibold text-brand-forest sm:flex">
                <UserCircle className="h-5 w-5 shrink-0" />
                <span className="max-w-48 truncate">{userDisplayName}</span>
                <span className="rounded-full bg-brand-cream px-2 py-0.5 text-[11px] font-bold text-brand-espresso">
                  {profile?.role ?? "ADMIN"}
                </span>
              </div>
              <Button
                className="h-11 w-11 border-brand-forest/10 bg-white text-brand-forest hover:bg-brand-cream lg:hidden"
                size="icon"
                variant="outline"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>
        {isMobileMenuOpen ? (
          <div className="fixed inset-0 z-50 bg-brand-forest/35 p-3 backdrop-blur-sm lg:hidden">
            <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-brand-forest/10 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <BrandLogo compact />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black uppercase text-brand-forest">Zestora POS</p>
                      <p className="truncate text-xs font-semibold text-brand-espresso/55">{userDisplayName}</p>
                    </div>
                  </div>
                </div>
                <Button
                  className="h-11 w-11 border-brand-forest/10 bg-white text-brand-forest hover:bg-brand-cream"
                  size="icon"
                  variant="outline"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav className="pos-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      className={({ isActive }) =>
                        cn(
                          "flex min-h-16 items-center gap-3 rounded-xl border p-3 text-sm font-bold transition",
                          isActive
                            ? "border-brand-orange bg-brand-orange text-white"
                            : "border-brand-forest/10 bg-brand-cream/40 text-brand-forest hover:bg-brand-cream",
                        )
                      }
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/80 text-brand-orange">
                        <item.icon className="h-5 w-5" />
                      </span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </nav>
              <div className="shrink-0 border-t border-brand-forest/10 p-4">
                <button
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-forest px-4 text-sm font-bold text-white"
                  onClick={() => void logout()}
                  type="button"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <main
          className={cn(
            isPos
              ? "min-h-dvh overflow-y-auto p-0 lg:h-dvh lg:overflow-hidden"
              : "min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-4 sm:px-4 lg:p-6",
          )}
        >
          <Outlet />
        </main>
        {!isPos ? (
          <footer className="shrink-0 border-t border-brand-forest/10 bg-white px-3 py-2 text-center text-[11px] font-medium text-brand-espresso/55 sm:px-4 lg:px-6">
            <span>Zestora POS</span>
            <span className="mx-2 text-brand-espresso/25">|</span>
            <span>Ready for retail billing</span>
          </footer>
        ) : null}
      </div>

    </div>
  );
}
