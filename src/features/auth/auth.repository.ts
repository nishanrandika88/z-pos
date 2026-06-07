import { supabase } from "@/shared/lib/supabase";
import { relationName } from "@/shared/lib/supabase-relations";
import type { Role } from "@/features/auth/rbac";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  branchId: string;
  branchName?: string;
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export function onPasswordRecovery(callback: () => void) {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      callback();
    }
  });

  return () => data.subscription.unsubscribe();
}

export async function loadCurrentProfile(): Promise<UserProfile | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active, branch_id, branches(name)")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    role: data.role,
    active: data.active,
    branchId: data.branch_id,
    branchName: relationName(data.branches, "Main Branch"),
  };
}
