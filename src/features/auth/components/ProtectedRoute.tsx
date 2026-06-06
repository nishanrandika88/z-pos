import type { PropsWithChildren } from "react";
import { Navigate } from "react-router";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { can, type Permission } from "@/features/auth/rbac";

interface ProtectedRouteProps extends PropsWithChildren {
  permission?: Permission;
}

export function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const { profile, isHydrated } = useAuthStore();

  if (!isHydrated) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading session...</div>;
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !can(profile.role, permission)) {
    return <Navigate to="/pos" replace />;
  }

  return <>{children}</>;
}
