import { supabase } from "@/shared/lib/supabase";
import { relationName } from "@/shared/lib/supabase-relations";
import type { Role } from "@/features/auth/rbac";

const profileSelect = "id, full_name, display_name, email, role, active, branch_id, last_login, locked_until, created_at, branches(name)";
const profileSelectWithoutDisplayName = "id, full_name, email, role, active, branch_id, last_login, locked_until, created_at, branches(name)";

export interface ManagedUser {
  id: string;
  fullName: string;
  displayName?: string;
  email: string;
  role: Role;
  active: boolean;
  branchId: string;
  branchName: string;
  lastLogin?: string;
  lockedUntil?: string;
  createdAt: string;
}

interface ProfileRow {
  id: string;
  full_name: string;
  display_name?: string | null;
  email: string;
  role: Role;
  active: boolean;
  branch_id: string;
  last_login: string | null;
  locked_until: string | null;
  created_at: string;
  branches: { name?: string } | { name?: string }[] | null;
}

export interface CreateProfileInput {
  id: string;
  branchId: string;
  fullName: string;
  displayName?: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface UpdateProfileInput {
  id: string;
  fullName: string;
  displayName?: string;
  email: string;
  role: Role;
  active: boolean;
}

function mapUser(row: ProfileRow): ManagedUser {
  return {
    id: row.id,
    fullName: row.full_name,
    displayName: row.display_name ?? undefined,
    email: row.email,
    role: row.role,
    active: row.active,
    branchId: row.branch_id,
    branchName: relationName(row.branches, "Main Branch"),
    lastLogin: row.last_login ?? undefined,
    lockedUntil: row.locked_until ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listUsers(): Promise<ManagedUser[]> {
  let { data, error } = await supabase
    .from("profiles")
    .select(profileSelect)
    .order("full_name");

  if (isMissingDisplayNameError(error)) {
    const fallback = await supabase
      .from("profiles")
      .select(profileSelectWithoutDisplayName)
      .order("full_name");
    data = fallback.data?.map((row) => ({ ...row, display_name: null })) ?? null;
    error = fallback.error;
  }

  if (error) throw error;
  if (!data) return [];
  return data.map(mapUser);
}

export async function createProfile(input: CreateProfileInput): Promise<ManagedUser> {
  let { data, error } = await supabase
    .from("profiles")
    .insert({
      id: input.id,
      branch_id: input.branchId,
      full_name: input.fullName.trim(),
      display_name: input.displayName?.trim() || null,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      active: input.active,
    })
    .select(profileSelect)
    .single();

  if (isMissingDisplayNameError(error)) {
    const fallback = await supabase
      .from("profiles")
      .insert({
        id: input.id,
        branch_id: input.branchId,
        full_name: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        role: input.role,
        active: input.active,
      })
      .select(profileSelectWithoutDisplayName)
      .single();
    data = fallback.data ? { ...fallback.data, display_name: null } : null;
    error = fallback.error;
  }

  if (error) throw error;
  if (!data) throw new Error("Could not create profile.");
  return mapUser(data);
}

export async function updateProfile(input: UpdateProfileInput): Promise<ManagedUser> {
  let { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      display_name: input.displayName?.trim() || null,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      active: input.active,
    })
    .eq("id", input.id)
    .select(profileSelect)
    .single();

  if (isMissingDisplayNameError(error)) {
    const fallback = await supabase
      .from("profiles")
      .update({
        full_name: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        role: input.role,
        active: input.active,
      })
      .eq("id", input.id)
      .select(profileSelectWithoutDisplayName)
      .single();
    data = fallback.data ? { ...fallback.data, display_name: null } : null;
    error = fallback.error;
  }

  if (error) throw error;
  if (!data) throw new Error("Could not update profile.");
  return mapUser(data);
}

function isMissingDisplayNameError(error: { message?: string } | null) {
  return Boolean(error?.message?.toLowerCase().includes("display_name"));
}
