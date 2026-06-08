import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, AlertTriangle, ChevronDown, Edit, Percent, Plus, Search, X } from "lucide-react";
import type { Discount } from "@/domain/catalog/types";
import {
  clearCachedActiveDiscounts,
  clearCachedActiveItems,
  clearCachedCatalogDiscounts,
  readCachedCatalogCategories,
  readCachedCatalogDiscounts,
  readCachedCatalogItems,
  writeCachedCatalogDiscounts,
} from "@/features/catalog/catalog-cache";
import { listCategories, listItems } from "@/features/catalog/catalog.repository";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import {
  archiveDiscount,
  createDiscount,
  listDiscounts,
  restoreDiscount,
  updateDiscount,
} from "@/features/discounts/discounts.repository";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { NoticeToast, type Notice, type NoticeTone } from "@/shared/ui/notice-toast";

const emptyDiscounts: Discount[] = [];
const emptyForm = {
  name: "",
  percentage: "",
  applicableType: "CATEGORY" as "ITEM" | "CATEGORY",
  applicableId: "",
  active: true,
};

type DiscountMode = "active" | "archived";

export function DiscountsPage() {
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const [showForm, setShowForm] = useState(false);
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<DiscountMode>("active");
  const [archiveTarget, setArchiveTarget] = useState<Discount | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: discounts = emptyDiscounts } = useQuery({
    queryKey: ["discounts"],
    queryFn: listDiscounts,
    initialData: readCachedCatalogDiscounts,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    initialData: readCachedCatalogCategories,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items"],
    queryFn: listItems,
    initialData: readCachedCatalogItems,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (discounts.length > 0) {
      writeCachedCatalogDiscounts(discounts);
    }
  }, [discounts]);

  useEffect(() => {
    if (mode === "active") return;
    resetForm();
  }, [mode]);

  const targetOptions = form.applicableType === "CATEGORY" ? categories.filter((category) => category.active) : items.filter((item) => item.active);
  const targetLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    categories.forEach((category) => lookup.set(category.id, category.name));
    items.forEach((item) => lookup.set(item.id, item.itemName));
    return lookup;
  }, [categories, items]);
  const visibleDiscounts = useMemo(
    () => discounts.filter((discount) => (mode === "active" ? discount.active : !discount.active)),
    [discounts, mode],
  );
  const filteredDiscounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return visibleDiscounts;

    return visibleDiscounts.filter((discount) => {
      const targetName = targetLookup.get(discount.applicableId) ?? "";
      return (
        discount.name.toLowerCase().includes(query) ||
        targetName.toLowerCase().includes(query) ||
        discount.applicableType.toLowerCase().includes(query)
      );
    });
  }, [search, targetLookup, visibleDiscounts]);
  const activeCount = discounts.filter((discount) => discount.active).length;
  const archivedCount = discounts.length - activeCount;

  const createMutation = useMutation({
    mutationFn: createDiscount,
    async onSuccess() {
      resetForm();
      notify("Discount rule saved.", "success");
      await refreshDiscountCaches();
    },
    onError(error) {
      notify(error.message, "error");
    },
  });
  const updateMutation = useMutation({
    mutationFn: updateDiscount,
    async onSuccess() {
      resetForm();
      notify("Discount rule updated.", "success");
      await refreshDiscountCaches();
    },
    onError(error) {
      notify(error.message, "error");
    },
  });
  const archiveMutation = useMutation({
    mutationFn: archiveDiscount,
    async onSuccess() {
      setArchiveTarget(null);
      setMode("archived");
      notify("Discount archived.", "warning");
      await refreshDiscountCaches();
    },
    onError(error) {
      notify(error.message, "error");
    },
  });
  const restoreMutation = useMutation({
    mutationFn: restoreDiscount,
    async onSuccess() {
      setMode("active");
      notify("Discount restored.", "success");
      await refreshDiscountCaches();
    },
    onError(error) {
      notify(error.message, "error");
    },
  });

  function notify(message: string, tone: NoticeTone = "info") {
    setNotice({ tone, message });
  }

  async function refreshDiscountCaches() {
    clearCachedActiveDiscounts();
    clearCachedCatalogDiscounts();
    clearCachedActiveItems();
    await queryClient.invalidateQueries({ queryKey: ["discounts"] });
    await queryClient.invalidateQueries({ queryKey: ["discounts", "active"] });
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingDiscountId(null);
    setShowForm(false);
  }

  function updateForm(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "applicableType" ? { applicableId: "" } : null),
    }));
  }

  function startEdit(discount: Discount) {
    setShowForm(true);
    setEditingDiscountId(discount.id);
    setForm({
      name: discount.name,
      percentage: String(discount.percentage),
      applicableType: discount.applicableType,
      applicableId: discount.applicableId,
      active: discount.active,
    });
  }

  function saveDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const percentage = Number(form.percentage);
    if (!profile?.branchId || !form.name.trim() || !form.applicableId || percentage <= 0 || percentage > 100) return;

    const payload = {
      name: form.name,
      percentage,
      applicableType: form.applicableType,
      applicableId: form.applicableId,
      active: true,
    };

    if (editingDiscountId) {
      updateMutation.mutate({ id: editingDiscountId, ...payload });
      return;
    }

    createMutation.mutate({ branchId: profile.branchId, ...payload });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Discounts</h1>
          <p className="text-sm text-muted-foreground">Automatic item and category discount rules.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="col-span-2 grid grid-cols-2 rounded-full border bg-white p-1 sm:col-span-1">
            <button
              className={`rounded-full px-3 py-2 text-sm font-semibold ${mode === "active" ? "bg-brand-forest text-white" : "text-brand-espresso/70"}`}
              onClick={() => setMode("active")}
              type="button"
            >
              Active
            </button>
            <button
              className={`rounded-full px-3 py-2 text-sm font-semibold ${mode === "archived" ? "bg-brand-forest text-white" : "text-brand-espresso/70"}`}
              onClick={() => setMode("archived")}
              type="button"
            >
              Archived
            </button>
          </div>
          <Button
            disabled={mode !== "active"}
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Discount
          </Button>
        </div>
      </div>

      {notice ? <NoticeToast notice={notice} onClose={() => setNotice(null)} /> : null}
      {archiveTarget ? (
        <ArchiveDiscountModal
          discount={archiveTarget}
          isPending={archiveMutation.isPending}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => archiveMutation.mutate(archiveTarget.id)}
        />
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <Summary label="Active rules" value={activeCount} />
        <Summary label="Archived rules" value={archivedCount} />
        <Summary label="Shown" value={filteredDiscounts.length} />
      </div>

      {showForm ? (
        <form className="grid gap-2.5 rounded-md border bg-card p-2.5 md:grid-cols-2 xl:grid-cols-6" onSubmit={saveDiscount}>
          <Input
            className="h-10 xl:col-span-2"
            value={form.name}
            onChange={(event) => updateForm("name", event.target.value)}
            placeholder="Rule name"
            autoFocus
          />
          <Input
            className="h-10 xl:col-span-1"
            type="number"
            min={0.01}
            max={100}
            step="0.01"
            value={form.percentage}
            onChange={(event) => updateForm("percentage", event.target.value)}
            placeholder="Percent"
          />
          <div className="relative xl:col-span-1">
            <select
              className="flex h-10 w-full appearance-none rounded-full border bg-white px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.applicableType}
              onChange={(event) => updateForm("applicableType", event.target.value)}
            >
              <option value="CATEGORY">Category</option>
              <option value="ITEM">Item</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-espresso/55" />
          </div>
          <div className="relative xl:col-span-2">
            <select
              className="flex h-10 w-full appearance-none rounded-full border bg-white px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.applicableId}
              onChange={(event) => updateForm("applicableId", event.target.value)}
            >
              <option value="">Select {form.applicableType === "CATEGORY" ? "category" : "item"}</option>
              {targetOptions.map((target) => (
                <option key={target.id} value={target.id}>
                  {"itemName" in target ? target.itemName : target.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-espresso/55" />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row sm:flex-wrap sm:items-center xl:col-span-6">
            <Button
              type="submit"
              disabled={
                !profile?.branchId ||
                !form.name.trim() ||
                !form.applicableId ||
                Number(form.percentage) <= 0 ||
                Number(form.percentage) > 100 ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {editingDiscountId ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingDiscountId ? "Save Rule" : "Create Rule"}
            </Button>
            {editingDiscountId ? (
              <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-10 pl-9"
          placeholder="Search discount name, target, or type"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardHeader className="p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{mode === "active" ? "Active rules" : "Archived rules"}</h2>
            <span className="text-xs font-medium text-muted-foreground">{filteredDiscounts.length}</span>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {filteredDiscounts.length === 0 ? (
            <div className="grid min-h-48 place-items-center rounded-md border border-dashed text-muted-foreground">
              <div className="text-center">
                <Percent className="mx-auto mb-2 h-8 w-8" />
                {mode === "active" ? "Create item or category discounts to apply during billing." : "No archived discount rules found."}
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-2 md:hidden">
                {filteredDiscounts.map((discount) => (
                  <DiscountCard
                    key={discount.id}
                    discount={discount}
                    mode={mode}
                    targetName={targetLookup.get(discount.applicableId)}
                    onEdit={() => startEdit(discount)}
                    onArchive={() => setArchiveTarget(discount)}
                    onRestore={() => restoreMutation.mutate(discount.id)}
                  />
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-1.5">Rule</th>
                      <th>Target</th>
                      <th>Percent</th>
                      {mode === "archived" ? <th>Status</th> : null}
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDiscounts.map((discount) => (
                      <tr key={discount.id} className="border-b last:border-0">
                        <td className="py-1.5 font-medium text-brand-forest">{discount.name}</td>
                        <td>
                          <span className="block truncate">{targetLookup.get(discount.applicableId) ?? "Unknown target"}</span>
                          <span className="text-xs text-brand-espresso/60">{discount.applicableType}</span>
                        </td>
                        <td className="font-semibold">{discount.percentage}%</td>
                        {mode === "archived" ? <td><Badge>Archived</Badge></td> : null}
                        <td className="flex justify-end gap-1 py-1">
                          {mode === "active" ? (
                            <>
                              <Button size="icon" variant="ghost" title="Edit discount" onClick={() => startEdit(discount)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" title="Archive discount" onClick={() => setArchiveTarget(discount)}>
                                <Archive className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <Button size="icon" variant="ghost" title="Restore discount" onClick={() => restoreMutation.mutate(discount.id)}>
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                          )}
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

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-brand-forest">{value}</p>
    </div>
  );
}

function ArchiveDiscountModal({
  discount,
  isPending,
  onCancel,
  onConfirm,
}: {
  discount: Discount;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="archive-discount-title">
      <div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-orange/15 text-brand-orange">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="archive-discount-title" className="text-lg font-bold text-brand-forest">Archive discount</h2>
            <p className="mt-1 text-sm text-brand-espresso/70">
              Archive "{discount.name}"? It will stop applying during billing and can be restored from the Archived view.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>Cancel</Button>
          <Button type="button" className="bg-brand-orange text-white hover:bg-brand-orange/90" onClick={onConfirm} disabled={isPending}>
            <Archive className="h-4 w-4" />
            {isPending ? "Archiving..." : "Archive"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DiscountCard({
  discount,
  mode,
  targetName,
  onEdit,
  onArchive,
  onRestore,
}: {
  discount: Discount;
  mode: DiscountMode;
  targetName?: string;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="rounded-xl border p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-forest">{discount.name}</p>
          <p className="mt-1 truncate text-xs text-brand-espresso/60">
            {discount.applicableType} - {targetName ?? "Unknown target"}
          </p>
        </div>
        {mode === "archived" ? <Badge>Archived</Badge> : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="rounded-full bg-brand-cream px-2.5 py-0.5 text-xs font-bold text-brand-forest">
          {discount.percentage}%
        </span>
        <div className="flex shrink-0 gap-1">
          {mode === "active" ? (
            <>
              <Button size="icon" variant="ghost" title="Edit discount" onClick={onEdit}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" title="Archive discount" onClick={onArchive}>
                <Archive className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button size="icon" variant="ghost" title="Restore discount" onClick={onRestore}>
              <ArchiveRestore className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
