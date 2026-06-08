import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, AlertTriangle, ChevronDown, Edit, GripVertical, ImagePlus, Plus, RefreshCw, Search, X } from "lucide-react";
import type { Category, Item } from "@/domain/catalog/types";
import {
  archiveCategory,
  archiveItem,
  createCategory,
  createItem,
  listCategories,
  listItems,
  reorderCategories,
  reorderItems,
  restoreCategory,
  restoreItem,
  updateCategory,
  updateItem,
  uploadItemImage,
} from "@/features/catalog/catalog.repository";
import {
  readCachedCatalogCategories,
  readCachedCatalogItems,
  writeCachedActiveItems,
  writeCachedCatalogCategories,
  writeCachedCatalogItems,
} from "@/features/catalog/catalog-cache";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { itemPlaceholderImage } from "@/shared/lib/assets";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { NoticeToast, type Notice, type NoticeTone } from "@/shared/ui/notice-toast";

const emptyItemForm = {
  itemCode: "",
  barcode: "",
  itemName: "",
  description: "",
  sellingPrice: "",
  categoryId: "",
};

const categoryQueryKey = ["categories"];
const itemQueryKey = ["items"];
type CatalogMode = "active" | "archived";
type ArchiveTarget = { type: "category"; category: Category } | { type: "item"; item: Item } | null;

export function CatalogPage() {
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemImage, setItemImage] = useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);
  const [editingItemImageUrl, setEditingItemImageUrl] = useState<string | null>(null);
  const [itemFormError, setItemFormError] = useState<string | null>(null);
  const [isUploadingItemImage, setIsUploadingItemImage] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [catalogMode, setCatalogMode] = useState<CatalogMode>("active");
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget>(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);

  const categoriesQuery = useQuery({
    queryKey: categoryQueryKey,
    queryFn: listCategories,
    initialData: readCachedCatalogCategories,
    refetchOnWindowFocus: false,
  });
  const itemsQuery = useQuery({
    queryKey: itemQueryKey,
    queryFn: listItems,
    initialData: readCachedCatalogItems,
    refetchOnWindowFocus: false,
  });

  const categories = useMemo(() => sortCategories(categoriesQuery.data ?? []), [categoriesQuery.data]);
  const items = useMemo(() => sortItems(itemsQuery.data ?? []), [itemsQuery.data]);
  const activeCategories = useMemo(() => categories.filter((category) => category.active), [categories]);
  const activeItems = useMemo(() => items.filter((item) => item.active), [items]);
  const archivedItems = useMemo(() => items.filter((item) => !item.active), [items]);
  const archivedCategories = useMemo(() => categories.filter((category) => !category.active), [categories]);
  const archivedCategoryIdsWithItems = useMemo(
    () => new Set(items.filter((item) => !item.active).map((item) => item.categoryId)),
    [items],
  );
  const visibleCategories = useMemo(
    () =>
      catalogMode === "active"
        ? activeCategories
        : categories.filter((category) => !category.active || archivedCategoryIdsWithItems.has(category.id)),
    [activeCategories, archivedCategoryIdsWithItems, catalogMode, categories],
  );
  const selectedCategory = visibleCategories.find((category) => category.id === selectedCategoryId);
  const catalogSummary = useMemo(
    () => [
      { label: "Active categories", value: activeCategories.length },
      { label: "Active items", value: activeItems.length },
      { label: "Archived categories", value: archivedCategories.length },
      { label: "Archived items", value: archivedItems.length },
    ],
    [activeCategories.length, activeItems.length, archivedCategories.length, archivedItems.length],
  );

  function notify(message: string, tone: NoticeTone = "info") {
    setNotice({ tone, message });
  }

  useEffect(() => {
    if (visibleCategories.length === 0) {
      setSelectedCategoryId("");
      return;
    }
    if (!selectedCategoryId || !visibleCategories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(visibleCategories[0].id);
    }
  }, [selectedCategoryId, visibleCategories]);

  useEffect(() => {
    if (catalogMode !== "active" || !showItemForm || editingItemId || itemForm.categoryId || !selectedCategoryId) return;
    setItemForm((current) => ({ ...current, categoryId: selectedCategoryId }));
  }, [catalogMode, editingItemId, itemForm.categoryId, selectedCategoryId, showItemForm]);

  useEffect(() => {
    if (catalogMode === "active") return;
    setShowCategoryForm(false);
    setShowItemForm(false);
    setEditingCategory(null);
    setEditingItemId(null);
  }, [catalogMode]);

  useEffect(() => {
    if (categoriesQuery.data) writeCachedCatalogCategories(categories);
  }, [categories, categoriesQuery.data]);

  useEffect(() => {
    if (itemsQuery.data) {
      writeCachedCatalogItems(items);
      const activeItems = activeCatalogItems(items);
      writeCachedActiveItems(activeItems);
      queryClient.setQueryData<Item[]>(["items", "active"], activeItems);
    }
  }, [items, itemsQuery.data, queryClient]);

  const selectedCategoryItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = item.categoryId === selectedCategoryId;
      const matchesMode = catalogMode === "active" ? item.active : !item.active || selectedCategory?.active === false;
      const matchesSearch =
        !query ||
        item.itemCode.toLowerCase().includes(query) ||
        item.itemName.toLowerCase().includes(query) ||
        item.barcode?.toLowerCase().includes(query);

      return matchesCategory && matchesMode && matchesSearch;
    });
  }, [catalogMode, itemSearch, items, selectedCategory, selectedCategoryId]);

  const createCategoryMutation = useMutation({
    mutationFn: createCategory,
    onSuccess(category) {
      setCategoriesData((current) => sortCategories([...current, category]));
      setSelectedCategoryId(category.id);
      setCategoryName("");
      setShowCategoryForm(false);
      notify("Category saved locally and in database.", "success");
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: updateCategory,
    onSuccess(category) {
      setCategoriesData((current) => current.map((item) => (item.id === category.id ? { ...item, ...category } : item)));
      setItemsData((current) =>
        current.map((item) =>
          item.categoryId === category.id
            ? { ...item, categoryName: category.name, categoryActive: category.active, categoryDisplayOrder: category.displayOrder }
            : item,
        ),
      );
      setEditingCategory(null);
      notify("Category updated.", "success");
    },
  });

  const archiveCategoryMutation = useMutation({
    mutationFn: archiveCategory,
    onSuccess(_, categoryId) {
      setCategoriesData((current) => current.map((category) => (category.id === categoryId ? { ...category, active: false } : category)));
      setItemsData((current) => current.map((item) => (item.categoryId === categoryId ? { ...item, categoryActive: false } : item)));
      setCatalogMode("archived");
      setSelectedCategoryId(categoryId);
      notify("Category archived.", "warning");
    },
    onError(error) {
      notify(error.message, "error");
    },
  });

  const restoreCategoryMutation = useMutation({
    mutationFn: restoreCategory,
    onSuccess(_, categoryId) {
      setCategoriesData((current) => current.map((category) => (category.id === categoryId ? { ...category, active: true } : category)));
      setItemsData((current) => current.map((item) => (item.categoryId === categoryId ? { ...item, categoryActive: true } : item)));
      setCatalogMode("active");
      setSelectedCategoryId(categoryId);
      notify("Category restored.", "success");
    },
    onError(error) {
      notify(error.message, "error");
    },
  });

  const createItemMutation = useMutation({
    mutationFn: createItem,
    onSuccess(item) {
      setItemsData((current) => sortItems([...current, item]));
      resetItemForm();
      setShowItemForm(false);
      notify("Item saved locally and in database.", "success");
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: updateItem,
    onSuccess(item) {
      setItemsData((current) => current.map((existing) => (existing.id === item.id ? item : existing)));
      resetItemForm();
      setEditingItemId(null);
      setShowItemForm(false);
      setSelectedCategoryId(item.categoryId);
      notify("Item updated.", "success");
    },
  });

  const archiveItemMutation = useMutation({
    mutationFn: archiveItem,
    onSuccess(_, itemId) {
      setItemsData((current) => current.map((item) => (item.id === itemId ? { ...item, active: false, availability: false } : item)));
      setCatalogMode("archived");
      notify("Item archived.", "warning");
    },
    onError(error) {
      notify(error.message, "error");
    },
  });

  const restoreItemMutation = useMutation({
    mutationFn: restoreItem,
    onSuccess(_, itemId) {
      setItemsData((current) => current.map((item) => (item.id === itemId ? { ...item, active: true, availability: true } : item)));
      setCatalogMode("active");
      notify("Item restored.", "success");
    },
    onError(error) {
      notify(error.message, "error");
    },
  });

  const reorderCategoriesMutation = useMutation({ mutationFn: reorderCategories });
  const reorderItemsMutation = useMutation({ mutationFn: reorderItems });

  function setCategoriesData(updater: (current: Category[]) => Category[]) {
    queryClient.setQueryData<Category[]>(categoryQueryKey, (current = []) => {
      const next = sortCategories(updater(current));
      writeCachedCatalogCategories(next);
      return next;
    });
  }

  function setItemsData(updater: (current: Item[]) => Item[]) {
    queryClient.setQueryData<Item[]>(itemQueryKey, (current = []) => {
      const next = sortItems(updater(current));
      const activeItems = activeCatalogItems(next);
      writeCachedCatalogItems(next);
      writeCachedActiveItems(activeItems);
      queryClient.setQueryData<Item[]>(["items", "active"], activeItems);
      return next;
    });
  }

  async function refreshFromDatabase() {
    setNotice(null);
    const [categoryResult, itemResult] = await Promise.all([categoriesQuery.refetch(), itemsQuery.refetch()]);
    if (categoryResult.error || itemResult.error) {
      notify(categoryResult.error?.message ?? itemResult.error?.message ?? "Could not refresh catalog.", "error");
      return;
    }
    notify("Catalog refreshed from database.", "success");
  }

  function resetItemForm() {
    setItemForm({ ...emptyItemForm, categoryId: selectedCategoryId });
    setItemImage(null);
    if (itemImagePreview?.startsWith("blob:")) URL.revokeObjectURL(itemImagePreview);
    setItemImagePreview(null);
    setEditingItemImageUrl(null);
    setItemFormError(null);
  }

  function updateItemForm(key: keyof typeof itemForm, value: string) {
    setItemForm((current) => ({ ...current, [key]: value }));
  }

  function onItemImageChange(file: File | null) {
    if (itemImagePreview?.startsWith("blob:")) URL.revokeObjectURL(itemImagePreview);
    setItemImage(file);
    setItemImagePreview(file ? URL.createObjectURL(file) : editingItemImageUrl);
  }

  function startEditItem(item: Item) {
    setShowItemForm(true);
    setEditingItemId(item.id);
    setItemForm({
      itemCode: item.itemCode,
      barcode: item.barcode ?? "",
      itemName: item.itemName,
      description: item.description ?? "",
      sellingPrice: String(item.sellingPrice),
      categoryId: item.categoryId,
    });
    setItemImage(null);
    setItemImagePreview(item.image ?? null);
    setEditingItemImageUrl(item.image ?? null);
    setItemFormError(null);
  }

  function onCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile?.branchId || !categoryName.trim()) return;

    createCategoryMutation.mutate({
      branchId: profile.branchId,
      name: categoryName,
      active: true,
    });
  }

  function onUpdateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCategory?.name.trim()) return;
    updateCategoryMutation.mutate({
      id: editingCategory.id,
      name: editingCategory.name,
      active: editingCategory.active,
    });
  }

  async function onSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setItemFormError(null);

    const sellingPrice = Number(itemForm.sellingPrice);
    const categoryId = itemForm.categoryId || selectedCategoryId || categories[0]?.id;

    if (!profile?.branchId || !categoryId || !itemForm.itemCode.trim() || !itemForm.itemName.trim() || sellingPrice <= 0) {
      return;
    }

    try {
      setIsUploadingItemImage(Boolean(itemImage));
      const uploadedImageUrl = itemImage
        ? await uploadItemImage({
            branchId: profile.branchId,
            file: itemImage,
          })
        : undefined;

      if (editingItemId) {
        updateItemMutation.mutate({
          id: editingItemId,
          categoryId,
          itemCode: itemForm.itemCode,
          barcode: itemForm.barcode,
          itemName: itemForm.itemName,
          description: itemForm.description,
          imageUrl: uploadedImageUrl ?? editingItemImageUrl ?? undefined,
          sellingPrice,
          availability: true,
          active: true,
        });
      } else {
        createItemMutation.mutate({
          branchId: profile.branchId,
          categoryId,
          itemCode: itemForm.itemCode,
          barcode: itemForm.barcode,
          itemName: itemForm.itemName,
          description: itemForm.description,
          imageUrl: uploadedImageUrl,
          sellingPrice,
        });
      }
    } catch (error) {
      setItemFormError(error instanceof Error ? error.message : "Could not upload image.");
    } finally {
      setIsUploadingItemImage(false);
    }
  }

  function moveCategory(targetId: string) {
    if (catalogMode !== "active") return;
    if (!draggedCategoryId || draggedCategoryId === targetId) return;
    const next = moveById(activeCategories, draggedCategoryId, targetId).map((category, index) => ({ ...category, displayOrder: index + 1 }));
    setCategoriesData((current) => current.map((category) => next.find((entry) => entry.id === category.id) ?? category));
    setItemsData((current) =>
      current.map((item) => {
        const category = next.find((entry) => entry.id === item.categoryId);
        return category ? { ...item, categoryDisplayOrder: category.displayOrder } : item;
      }),
    );
    reorderCategoriesMutation.mutate({ orderedIds: next.map((category) => category.id) });
  }

  function moveSelectedItem(targetId: string) {
    if (catalogMode !== "active") return;
    if (!draggedItemId || draggedItemId === targetId) return;
    const itemsInCategory = items.filter((item) => item.categoryId === selectedCategoryId && item.active);
    const reordered = moveById(itemsInCategory, draggedItemId, targetId).map((item, index) => ({ ...item, displayOrder: index + 1 }));
    setItemsData((current) =>
      current.map((item) => reordered.find((entry) => entry.id === item.id) ?? item),
    );
    reorderItemsMutation.mutate({ orderedIds: reordered.map((item) => item.id) });
  }

  function confirmArchiveCategory(category: Category) {
    const itemCount = items.filter((item) => item.categoryId === category.id).length;
    if (itemCount > 0) {
      notify("Archive or move all items before archiving this category.", "warning");
      return;
    }

    setArchiveTarget({ type: "category", category });
  }

  function confirmArchiveItem(item: Item) {
    setArchiveTarget({ type: "item", item });
  }

  function archiveSelectedTarget() {
    if (!archiveTarget) return;

    if (archiveTarget.type === "category") {
      archiveCategoryMutation.mutate(archiveTarget.category.id);
    } else {
      archiveItemMutation.mutate(archiveTarget.item.id);
    }

    setArchiveTarget(null);
  }

  function restoreArchivedItem(item: Item) {
    if (item.categoryActive === false) {
      notify("Restore this item's category before restoring the item.", "warning");
      return;
    }

    restoreItemMutation.mutate(item.id);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Catalog</h1>
          <p className="text-sm text-muted-foreground">Categories and sellable items.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="col-span-2 grid grid-cols-2 rounded-full border bg-white p-1 sm:col-span-1">
            <button
              className={`rounded-full px-3 py-2 text-sm font-semibold ${catalogMode === "active" ? "bg-brand-forest text-white" : "text-brand-espresso/70"}`}
              onClick={() => setCatalogMode("active")}
              type="button"
            >
              Active
            </button>
            <button
              className={`rounded-full px-3 py-2 text-sm font-semibold ${catalogMode === "archived" ? "bg-brand-forest text-white" : "text-brand-espresso/70"}`}
              onClick={() => setCatalogMode("archived")}
              type="button"
            >
              Archived
            </button>
          </div>
          <Button variant="outline" onClick={refreshFromDatabase} disabled={categoriesQuery.isFetching || itemsQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 ${categoriesQuery.isFetching || itemsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" disabled={catalogMode !== "active"} onClick={() => setShowCategoryForm((value) => !value)}>
            {showCategoryForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Category
          </Button>
          <Button
            disabled={catalogMode !== "active"}
            onClick={() => {
              if (showItemForm) {
                resetItemForm();
                setEditingItemId(null);
              } else {
                setItemForm({ ...emptyItemForm, categoryId: selectedCategoryId });
              }
              setShowItemForm((value) => !value);
            }}
          >
            {showItemForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Item
          </Button>
        </div>
      </div>

      {notice ? <NoticeToast notice={notice} onClose={() => setNotice(null)} /> : null}
      {archiveTarget ? (
        <ArchiveConfirmModal
          target={archiveTarget}
          isPending={archiveCategoryMutation.isPending || archiveItemMutation.isPending}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={archiveSelectedTarget}
        />
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {catalogSummary.map((entry) => (
          <div key={entry.label} className="rounded-md border bg-white px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">{entry.label}</p>
            <p className="mt-1 text-xl font-bold text-brand-forest">{entry.value}</p>
          </div>
        ))}
      </div>

      {showCategoryForm ? (
        <form className="flex flex-col gap-2 rounded-md border bg-card p-2.5 sm:flex-row sm:items-start" onSubmit={onCreateCategory}>
          <Input className="h-10" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" autoFocus />
          <Button type="submit" disabled={!profile?.branchId || !categoryName.trim() || createCategoryMutation.isPending}>
            <Plus className="h-4 w-4" />
            Create
          </Button>
          {createCategoryMutation.error ? <p className="self-center text-sm text-destructive">{createCategoryMutation.error.message}</p> : null}
        </form>
      ) : null}

      {editingCategory ? (
        <form className="flex flex-col gap-2 rounded-md border bg-card p-2.5 sm:flex-row sm:items-start" onSubmit={onUpdateCategory}>
          <Input
            className="h-10"
            value={editingCategory.name}
            onChange={(event) => setEditingCategory((current) => (current ? { ...current, name: event.target.value } : current))}
            placeholder="Category name"
            autoFocus
          />
          <label className="flex h-10 items-center gap-2 rounded-full border bg-white px-3 text-sm font-medium">
            <input
              className="h-4 w-4 accent-black"
              type="checkbox"
              checked={editingCategory.active}
              onChange={(event) => setEditingCategory((current) => (current ? { ...current, active: event.target.checked } : current))}
            />
            Active
          </label>
          <Button type="submit" disabled={!editingCategory.name.trim() || updateCategoryMutation.isPending}>Save</Button>
          <Button type="button" variant="ghost" onClick={() => setEditingCategory(null)}>Cancel</Button>
          {updateCategoryMutation.error ? <p className="self-center text-sm text-destructive">{updateCategoryMutation.error.message}</p> : null}
        </form>
      ) : null}

      {showItemForm ? (
        <form className="grid gap-2.5 rounded-md border bg-card p-2.5 md:grid-cols-2 xl:grid-cols-6" onSubmit={onSaveItem}>
          <Input
            className="h-10 xl:col-span-2"
            value={itemForm.itemName}
            onChange={(event) => updateItemForm("itemName", event.target.value)}
            placeholder="Item name"
            autoFocus
          />
          <div className="relative xl:col-span-2">
            <select
              className="flex h-10 w-full appearance-none rounded-full border bg-white px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={itemForm.categoryId}
              onChange={(event) => updateItemForm("categoryId", event.target.value)}
            >
              <option value="">Select category</option>
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-espresso/55" />
          </div>
          <Input
            className="h-10 xl:col-span-2"
            value={itemForm.sellingPrice}
            onChange={(event) => updateItemForm("sellingPrice", event.target.value)}
            placeholder="Selling price"
            type="number"
            min={0}
            step="0.01"
          />
          <Input
            className="h-10 xl:col-span-3"
            value={itemForm.itemCode}
            onChange={(event) => updateItemForm("itemCode", event.target.value)}
            placeholder="Item code"
          />
          <Input
            className="h-10 xl:col-span-3"
            value={itemForm.barcode}
            onChange={(event) => updateItemForm("barcode", event.target.value)}
            placeholder="Barcode"
          />
          <Input
            className="h-10 md:col-span-2 xl:col-span-3"
            value={itemForm.description}
            onChange={(event) => updateItemForm("description", event.target.value)}
            placeholder="Description"
          />
          <Input
            className="h-10 md:col-span-2 xl:col-span-3"
            accept="image/*"
            type="file"
            onChange={(event) => onItemImageChange(event.target.files?.[0] ?? null)}
          />
          {itemImagePreview ? (
            <div className="flex items-center gap-3 md:col-span-2 xl:col-span-6">
              <img className="h-12 w-12 rounded-xl object-cover" src={itemImagePreview} alt="Selected item" />
              <Button type="button" variant="outline" onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}>
                <ImagePlus className="h-4 w-4" />
                Replace
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row sm:flex-wrap sm:items-center xl:col-span-6">
            <Button
              type="submit"
              disabled={
                !profile?.branchId ||
                activeCategories.length === 0 ||
                !itemForm.itemCode.trim() ||
                !itemForm.itemName.trim() ||
                Number(itemForm.sellingPrice) <= 0 ||
                createItemMutation.isPending ||
                updateItemMutation.isPending ||
                isUploadingItemImage
              }
            >
              {editingItemId ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {isUploadingItemImage ? "Uploading..." : editingItemId ? "Save Item" : "Create Item"}
            </Button>
            {editingItemId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  resetItemForm();
                  setEditingItemId(null);
                  setShowItemForm(false);
                }}
              >
                Cancel
              </Button>
            ) : null}
            {activeCategories.length === 0 ? <p className="text-sm text-muted-foreground">Refresh or create a category before adding items.</p> : null}
            {createItemMutation.error ? <p className="text-sm text-destructive">{createItemMutation.error.message}</p> : null}
            {updateItemMutation.error ? <p className="text-sm text-destructive">{updateItemMutation.error.message}</p> : null}
            {itemFormError ? <p className="text-sm text-destructive">{itemFormError}</p> : null}
          </div>
        </form>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[380px_1fr] 2xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader className="p-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Categories</h2>
              <span className="text-xs font-medium text-muted-foreground">{visibleCategories.length}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {visibleCategories.length === 0 ? (
              <div className="grid min-h-32 place-items-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
                {categoriesQuery.isFetching
                  ? "Loading categories..."
                  : catalogMode === "active"
                    ? "No active categories found."
                    : "No archived categories or items found."}
              </div>
            ) : (
              visibleCategories.map((category) => {
                const count = items.filter((item) => item.categoryId === category.id && (catalogMode === "active" ? item.active : !item.active)).length;
                return (
                  <div
                    key={category.id}
                    draggable={catalogMode === "active"}
                    onDragStart={() => setDraggedCategoryId(category.id)}
                    onDragEnd={() => setDraggedCategoryId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveCategory(category.id)}
                    className={[
                      "flex items-start justify-between gap-2 rounded-md border px-3 py-3 transition",
                      selectedCategoryId === category.id ? "border-brand-orange bg-brand-orange/10" : "bg-white",
                    ].join(" ")}
                  >
                    <button className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setSelectedCategoryId(category.id)}>
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                      <span className="min-w-0 break-words text-sm font-medium leading-5">{category.name}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full bg-brand-cream px-2 py-1 text-xs font-semibold text-brand-forest">{count}</span>
                      {catalogMode === "archived" ? <Badge>{category.active ? "Active group" : "Archived"}</Badge> : null}
                      {catalogMode === "active" ? (
                        <>
                          <Button size="icon" variant="ghost" title="Edit category" onClick={() => setEditingCategory(category)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Archive category" onClick={() => confirmArchiveCategory(category)}>
                            <Archive className="h-4 w-4" />
                          </Button>
                        </>
                      ) : !category.active ? (
                        <Button size="icon" variant="ghost" title="Restore category" onClick={() => restoreCategoryMutation.mutate(category.id)}>
                          <ArchiveRestore className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">{selectedCategory ? selectedCategory.name : "Items"}</h2>
                <p className="text-xs text-muted-foreground">{selectedCategoryItems.length} shown in selected category</p>
              </div>
              <div className="relative sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-10 pl-9"
                  placeholder="Search selected items"
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {selectedCategoryItems.length === 0 ? (
              <div className="grid min-h-48 place-items-center rounded-md border border-dashed px-4 text-center text-muted-foreground">
                {selectedCategory ? "No items found in this category." : catalogMode === "active" ? "Select or create a category." : "Select an archived category or item group."}
              </div>
            ) : (
              <>
                <div className="grid gap-2 md:hidden">
                  {selectedCategoryItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      draggedItemId={draggedItemId}
                      onDragStart={setDraggedItemId}
                      onDrop={moveSelectedItem}
                      onEdit={startEditItem}
                      onArchive={confirmArchiveItem}
                      onRestore={restoreArchivedItem}
                      mode={catalogMode}
                    />
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b">
                        <th className="w-8 py-1.5"></th>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Price</th>
                        {catalogMode === "archived" ? <th>Status</th> : null}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCategoryItems.map((item) => (
                        <tr
                          key={item.id}
                          draggable={catalogMode === "active"}
                          onDragStart={() => setDraggedItemId(item.id)}
                          onDragEnd={() => setDraggedItemId(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => moveSelectedItem(item.id)}
                          className={[
                            "border-b last:border-0",
                            draggedItemId === item.id ? "bg-brand-cream" : "",
                          ].join(" ")}
                        >
                          <td className="py-1.5"><GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" /></td>
                          <td className="py-1.5 font-medium">{item.itemCode}</td>
                          <td>{item.itemName}</td>
                          <td>{item.sellingPrice.toFixed(2)}</td>
                          {catalogMode === "archived" ? <td><Badge>{item.active ? "Active group" : "Archived"}</Badge></td> : null}
                          <td className="flex gap-1 py-1">
                            {catalogMode === "active" ? (
                              <>
                                <Button size="icon" variant="ghost" title="Edit item" onClick={() => startEditItem(item)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" title="Archive item" onClick={() => confirmArchiveItem(item)}>
                                  <Archive className="h-4 w-4" />
                                </Button>
                              </>
                            ) : !item.active ? (
                              <Button size="icon" variant="ghost" title="Restore item" onClick={() => restoreArchivedItem(item)}>
                                <ArchiveRestore className="h-4 w-4" />
                              </Button>
                            ) : null}
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
    </div>
  );
}

function ArchiveConfirmModal({
  target,
  isPending,
  onCancel,
  onConfirm,
}: {
  target: Exclude<ArchiveTarget, null>;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = target.type === "category" ? "Archive category" : "Archive item";
  const name = target.type === "category" ? target.category.name : target.item.itemName;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="archive-title">
      <div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-orange/15 text-brand-orange">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="archive-title" className="text-lg font-bold text-brand-forest">{title}</h2>
            <p className="mt-1 text-sm text-brand-espresso/70">
              Archive "{name}"? It will be removed from the active catalog and can be restored from the Archived view.
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

function ItemCard({
  item,
  draggedItemId,
  onDragStart,
  onDrop,
  onEdit,
  onArchive,
  onRestore,
  mode,
}: {
  item: Item;
  draggedItemId: string | null;
  onDragStart: (itemId: string | null) => void;
  onDrop: (itemId: string) => void;
  onEdit: (item: Item) => void;
  onArchive: (item: Item) => void;
  onRestore: (item: Item) => void;
  mode: CatalogMode;
}) {
  return (
    <div
      draggable={mode === "active"}
      onDragStart={() => onDragStart(item.id)}
      onDragEnd={() => onDragStart(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(item.id)}
      className={[
        "rounded-xl border p-2.5",
        draggedItemId === item.id ? "bg-brand-cream" : "bg-white",
      ].join(" ")}
    >
      <div className="flex gap-2.5">
        <GripVertical className="mt-3 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
        <img className="h-12 w-12 shrink-0 rounded-xl bg-brand-cream object-cover" src={item.image ?? itemPlaceholderImage} alt={item.itemName} loading="lazy" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-forest">{item.itemName}</p>
              <p className="mt-1 text-xs text-brand-espresso/60">{item.itemCode}</p>
            </div>
            {mode === "archived" ? <Badge>{item.active ? "Active group" : "Archived"}</Badge> : null}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="font-bold text-brand-forest">{item.sellingPrice.toFixed(2)}</p>
            <div className="flex shrink-0 gap-1">
              {mode === "active" ? (
                <>
                  <Button size="icon" variant="ghost" title="Edit item" onClick={() => onEdit(item)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Archive item" onClick={() => onArchive(item)}>
                    <Archive className="h-4 w-4" />
                  </Button>
                </>
              ) : !item.active ? (
                <Button size="icon" variant="ghost" title="Restore item" onClick={() => onRestore(item)}>
                  <ArchiveRestore className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function moveById<T extends { id: string }>(items: T[], draggedId: string, targetId: string) {
  const next = [...items];
  const draggedIndex = next.findIndex((item) => item.id === draggedId);
  const targetIndex = next.findIndex((item) => item.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return next;

  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}

function sortCategories(categories: Category[]) {
  return [...categories].sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
}

function sortItems(items: Item[]) {
  return [...items].sort(
    (left, right) =>
      (left.categoryDisplayOrder ?? 0) - (right.categoryDisplayOrder ?? 0) ||
      left.displayOrder - right.displayOrder ||
      left.itemName.localeCompare(right.itemName),
  );
}

function activeCatalogItems(items: Item[]) {
  return sortItems(items.filter((item) => item.active && item.availability && item.categoryActive !== false));
}
