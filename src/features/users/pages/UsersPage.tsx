import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Edit, Plus, Search, X } from "lucide-react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import type { Role } from "@/features/auth/rbac";
import { createProfile, listUsers, type ManagedUser, updateProfile } from "@/features/users/users.repository";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

const dateTime = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" });
const emptyUsers: ManagedUser[] = [];
const emptyForm = {
  id: "",
  fullName: "",
  displayName: "",
  email: "",
  role: "CASHIER" as Role,
  active: true,
};

export function UsersPage() {
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const [showForm, setShowForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);

  const { data: users = emptyUsers, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
  });
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;

    return users.filter(
      (user) =>
        user.fullName.toLowerCase().includes(query) ||
        user.displayName?.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query),
    );
  }, [search, users]);

  const createMutation = useMutation({
    mutationFn: createProfile,
    async onSuccess() {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: updateProfile,
    async onSuccess() {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingUserId(null);
    setForm(emptyForm);
  }

  function updateForm(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEdit(user: ManagedUser) {
    setShowForm(true);
    setEditingUserId(user.id);
    setForm({
      id: user.id,
      fullName: user.fullName,
      displayName: user.displayName ?? "",
      email: user.email,
      role: user.role,
      active: user.active,
    });
  }

  function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) return;

    const payload = {
      fullName: form.fullName,
      displayName: form.displayName,
      email: form.email,
      role: form.role,
      active: form.active,
    };

    if (editingUserId) {
      updateMutation.mutate({ id: editingUserId, ...payload });
      return;
    }

    if (!profile?.branchId || !form.id.trim()) return;
    createMutation.mutate({ id: form.id, branchId: profile.branchId, ...payload });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Team profiles, display names, roles, and account status.</p>
        </div>
        <Button
          onClick={() => {
            if (showForm) resetForm();
            else setShowForm(true);
          }}
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          User
        </Button>
      </div>

      {showForm ? (
        <form className="grid gap-2.5 rounded-md border bg-card p-2.5 md:grid-cols-2 xl:grid-cols-6" onSubmit={saveUser}>
          {!editingUserId ? (
            <Input
              className="h-10 md:col-span-2 xl:col-span-2"
              value={form.id}
              onChange={(event) => updateForm("id", event.target.value)}
              placeholder="Auth user ID"
              autoFocus
            />
          ) : null}
          <Input
            className="h-10 xl:col-span-2"
            value={form.fullName}
            onChange={(event) => updateForm("fullName", event.target.value)}
            placeholder="Full name"
            autoFocus={Boolean(editingUserId)}
          />
          <Input
            className="h-10 xl:col-span-1"
            value={form.displayName}
            onChange={(event) => updateForm("displayName", event.target.value)}
            placeholder="Display name"
          />
          <Input
            className="h-10 xl:col-span-2"
            value={form.email}
            onChange={(event) => updateForm("email", event.target.value)}
            placeholder="Email"
            type="email"
          />
          <div className="relative xl:col-span-1">
            <select
              className="flex h-10 w-full appearance-none rounded-full border bg-white px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.role}
              onChange={(event) => updateForm("role", event.target.value)}
            >
              <option value="CASHIER">Cashier</option>
              <option value="ADMIN">Admin</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-espresso/55" />
          </div>
          <label className="flex h-10 items-center gap-2 rounded-full border bg-white px-3 text-sm font-medium xl:col-span-1">
            <input
              className="h-4 w-4 accent-black"
              type="checkbox"
              checked={form.active}
              onChange={(event) => updateForm("active", event.target.checked)}
            />
            Active
          </label>
          <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row sm:flex-wrap sm:items-center xl:col-span-5">
            <Button
              type="submit"
              disabled={
                !form.fullName.trim() ||
                !form.email.trim() ||
                (!editingUserId && !form.id.trim()) ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {editingUserId ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingUserId ? "Save User" : "Create Profile"}
            </Button>
            {editingUserId ? <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button> : null}
            {createMutation.error ? <p className="text-sm text-destructive">{createMutation.error.message}</p> : null}
            {updateMutation.error ? <p className="text-sm text-destructive">{updateMutation.error.message}</p> : null}
          </div>
        </form>
      ) : null}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-10 pl-9"
          placeholder="Search name, email, or role"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardHeader className="p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Team</h2>
            <span className="text-xs font-medium text-muted-foreground">{filteredUsers.length}</span>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? (
            <div className="grid min-h-48 place-items-center text-muted-foreground">Loading users...</div>
          ) : error ? (
            <div className="grid min-h-48 place-items-center rounded-md bg-destructive/10 p-4 text-sm text-destructive">
              {error.message}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="grid min-h-48 place-items-center rounded-md border border-dashed text-muted-foreground">
              No users found.
            </div>
          ) : (
            <>
              <div className="grid gap-2 md:hidden">
                {filteredUsers.map((user) => (
                  <UserCard key={user.id} user={user} onEdit={() => startEdit(user)} />
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-1.5">Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last Login</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="border-b last:border-0">
                        <td className="py-1.5">
                          <span className="block font-medium text-brand-forest">{user.displayName || user.fullName}</span>
                          <span className="text-xs text-brand-espresso/60">{user.fullName}</span>
                        </td>
                        <td>{user.email}</td>
                        <td><RoleBadge role={user.role} /></td>
                        <td><Badge>{user.active ? "Active" : "Inactive"}</Badge></td>
                        <td className="text-brand-espresso/70">{user.lastLogin ? dateTime.format(new Date(user.lastLogin)) : "-"}</td>
                        <td className="flex justify-end py-1">
                          <Button size="icon" variant="ghost" title="Edit user" onClick={() => startEdit(user)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserCard({ user, onEdit }: { user: ManagedUser; onEdit: () => void }) {
  return (
    <div className="rounded-xl border p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-forest">{user.displayName || user.fullName}</p>
          <p className="mt-1 truncate text-xs text-brand-espresso/60">{user.email}</p>
        </div>
        <Badge>{user.active ? "Active" : "Inactive"}</Badge>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <RoleBadge role={user.role} />
          <span className="truncate text-xs text-brand-espresso/60">{user.fullName}</span>
        </div>
        <Button size="icon" variant="ghost" title="Edit user" onClick={onEdit}>
          <Edit className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const className = role === "ADMIN" ? "bg-brand-orange/10 text-brand-orange" : "bg-brand-cream text-brand-forest";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>{role}</span>;
}
