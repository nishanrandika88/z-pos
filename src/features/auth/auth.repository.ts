import { supabase } from "@/shared/lib/supabase";
import { relationName } from "@/shared/lib/supabase-relations";
import type { Role } from "@/features/auth/rbac";

const profileSelect = "id, full_name, display_name, email, role, active, branch_id, branches(name)";
const profileSelectWithoutDisplayName = "id, full_name, email, role, active, branch_id, branches(name)";

export interface UserProfile {
  id: string;
  fullName: string;
  displayName?: string;
  email: string;
  role: Role;
  active: boolean;
  branchId: string;
  branchName?: string;
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await recordProfileLogin();
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

  const profileQuery = supabase
    .from("profiles")
    .select(profileSelect)
    .eq("id", user.id)
    .single();
  let { data, error } = await profileQuery;

  if (isMissingDisplayNameError(error)) {
    const fallback = await supabase
      .from("profiles")
      .select(profileSelectWithoutDisplayName)
      .eq("id", user.id)
      .single();
    data = fallback.data ? { ...fallback.data, display_name: null } : null;
    error = fallback.error;
  }

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    displayName: data.display_name ?? undefined,
    email: data.email,
    role: data.role,
    active: data.active,
    branchId: data.branch_id,
    branchName: relationName(data.branches, "Main Branch"),
  };
}

function isMissingDisplayNameError(error: { message?: string } | null) {
  return Boolean(error?.message?.toLowerCase().includes("display_name"));
}

async function recordProfileLogin() {
  try {
    await supabase.rpc("record_profile_login");
  } catch {
    // Older deployments may not have this RPC yet. Login should still succeed.
  }
}
