import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Edit, GripVertical, ImagePlus, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { Category, Item } from "@/domain/catalog/types";
import {
  createCategory,
  createItem,
  deactivateCategory,
  deactivateItem,
  listCategories,
  listItems,
  reorderCategories,
  reorderItems,
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
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

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
  const [notice, setNotice] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);

  const categoriesQuery = useQuery({
    queryKey: categoryQueryKey,
    queryFn: listCategories,
    initialData: readCachedCatalogCategories,
    enabled: false,
    refetchOnWindowFocus: false,
  });
  const itemsQuery = useQuery({
    queryKey: itemQueryKey,
    queryFn: listItems,
    initialData: readCachedCatalogItems,
    enabled: false,
    refetchOnWindowFocus: false,
  });

  const categories = useMemo(() => sortCategories(categoriesQuery.data ?? []), [categoriesQuery.data]);
  const items = useMemo(() => sortItems(itemsQuery.data ?? []), [itemsQuery.data]);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  useEffect(() => {
    if (categories.length === 0) {
      setSelectedCategoryId("");
      return;
    }
    if (!selectedCategoryId || !categories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (!showItemForm || editingItemId || itemForm.categoryId || !selectedCategoryId) return;
    setItemForm((current) => ({ ...current, categoryId: selectedCategoryId }));
  }, [editingItemId, itemForm.categoryId, selectedCategoryId, showItemForm]);

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
      const matchesSearch =
        !query ||
        item.itemCode.toLowerCase().includes(query) ||
        item.itemName.toLowerCase().includes(query) ||
        item.barcode?.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [itemSearch, items, selectedCategoryId]);

  const createCategoryMutation = useMutation({
    mutationFn: createCategory,
    onSuccess(category) {
      setCategoriesData((current) => sortCategories([...current, category]));
      setSelectedCategoryId(category.id);
      setCategoryName("");
      setShowCategoryForm(false);
      setNotice("Category saved locally and in database.");
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
      setNotice("Category updated.");
    },
  });

  const deactivateCategoryMutation = useMutation({
    mutationFn: deactivateCategory,
    onSuccess(_, categoryId) {
      setCategoriesData((current) => current.map((category) => (category.id === categoryId ? { ...category, active: false } : category)));
      setItemsData((current) => current.map((item) => (item.categoryId === categoryId ? { ...item, categoryActive: false } : item)));
      setNotice("Category deactivated.");
    },
  });

  const createItemMutation = useMutation({
    mutationFn: createItem,
    onSuccess(item) {
      setItemsData((current) => sortItems([...current, item]));
      resetItemForm();
      setShowItemForm(false);
      setNotice("Item saved locally and in database.");
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
      setNotice("Item updated.");
    },
  });

  const deactivateItemMutation = useMutation({
    mutationFn: deactivateItem,
    onSuccess(_, itemId) {
      setItemsData((current) => current.map((item) => (item.id === itemId ? { ...item, active: false, availability: false } : item)));
      setNotice("Item deactivated.");
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
      setNotice(categoryResult.error?.message ?? itemResult.error?.message ?? "Could not refresh catalog.");
      return;
    }
    setNotice("Catalog refreshed from database.");
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
    if (!draggedCategoryId || draggedCategoryId === targetId) return;
    const next = moveById(categories, draggedCategoryId, targetId).map((category, index) => ({ ...category, displayOrder: index + 1 }));
    setCategoriesData(() => next);
    setItemsData((current) =>
      current.map((item) => {
        const category = next.find((entry) => entry.id === item.categoryId);
        return category ? { ...item, categoryDisplayOrder: category.displayOrder } : item;
      }),
    );
    reorderCategoriesMutation.mutate({ orderedIds: next.map((category) => category.id) });
  }

  function moveSelectedItem(targetId: string) {
    if (!draggedItemId || draggedItemId === targetId) return;
    const itemsInCategory = items.filter((item) => item.categoryId === selectedCategoryId);
    const reordered = moveById(itemsInCategory, draggedItemId, targetId).map((item, index) => ({ ...item, displayOrder: index + 1 }));
    setItemsData((current) =>
      current.map((item) => reordered.find((entry) => entry.id === item.id) ?? item),
    );
    reorderItemsMutation.mutate({ orderedIds: reordered.map((item) => item.id) });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Catalog</h1>
          <p className="text-sm text-muted-foreground">Categories and sellable items.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" onClick={refreshFromDatabase} disabled={categoriesQuery.isFetching || itemsQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 ${categoriesQuery.isFetching || itemsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setShowCategoryForm((value) => !value)}>
            {showCategoryForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Category
          </Button>
          <Button
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

      {notice ? <p className="rounded-md border bg-white px-3 py-2 text-sm text-brand-espresso/70">{notice}</p> : null}

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
              {categories.map((category) => (
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
                categories.length === 0 ||
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
            {categories.length === 0 ? <p className="text-sm text-muted-foreground">Refresh or create a category before adding items.</p> : null}
            {createItemMutation.error ? <p className="text-sm text-destructive">{createItemMutation.error.message}</p> : null}
            {updateItemMutation.error ? <p className="text-sm text-destructive">{updateItemMutation.error.message}</p> : null}
            {itemFormError ? <p className="text-sm text-destructive">{itemFormError}</p> : null}
          </div>
        </form>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader className="p-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Categories</h2>
              <span className="text-xs font-medium text-muted-foreground">{categories.length}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 p-3">
            {categories.length === 0 ? (
              <div className="grid min-h-32 place-items-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
                No cached categories. Use Refresh to load from database.
              </div>
            ) : (
              categories.map((category) => {
                const count = items.filter((item) => item.categoryId === category.id).length;
                return (
                  <div
                    key={category.id}
                    draggable
                    onDragStart={() => setDraggedCategoryId(category.id)}
                    onDragEnd={() => setDraggedCategoryId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveCategory(category.id)}
                    className={[
                      "flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 transition",
                      selectedCategoryId === category.id ? "border-brand-orange bg-brand-orange/10" : "bg-white",
                    ].join(" ")}
                  >
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelectedCategoryId(category.id)}>
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                      <span className="min-w-0 truncate text-sm font-medium">{category.name}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full bg-brand-cream px-2 py-1 text-xs font-semibold text-brand-forest">{count}</span>
                      <Badge>{category.active ? "Active" : "Inactive"}</Badge>
                      <Button size="icon" variant="ghost" title="Edit category" onClick={() => setEditingCategory(category)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Deactivate category" onClick={() => deactivateCategoryMutation.mutate(category.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
                {selectedCategory ? "No items found in this category." : "Select or create a category."}
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
                      onDeactivate={(itemId) => deactivateItemMutation.mutate(itemId)}
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
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCategoryItems.map((item) => (
                        <tr
                          key={item.id}
                          draggable
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
                          <td><Badge>{item.active ? "Active" : "Inactive"}</Badge></td>
                          <td className="flex gap-1 py-1">
                            <Button size="icon" variant="ghost" title="Edit item" onClick={() => startEditItem(item)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Deactivate item" onClick={() => deactivateItemMutation.mutate(item.id)}>
                              <Trash2 className="h-4 w-4" />
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
    </div>
  );
}

function ItemCard({
  item,
  draggedItemId,
  onDragStart,
  onDrop,
  onEdit,
  onDeactivate,
}: {
  item: Item;
  draggedItemId: string | null;
  onDragStart: (itemId: string | null) => void;
  onDrop: (itemId: string) => void;
  onEdit: (item: Item) => void;
  onDeactivate: (itemId: string) => void;
}) {
  return (
    <div
      draggable
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
        {item.image ? (
          <img className="h-12 w-12 shrink-0 rounded-xl object-cover" src={item.image} alt={item.itemName} loading="lazy" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-forest">{item.itemName}</p>
              <p className="mt-1 text-xs text-brand-espresso/60">{item.itemCode}</p>
            </div>
            <Badge>{item.active ? "Active" : "Inactive"}</Badge>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="font-bold text-brand-forest">{item.sellingPrice.toFixed(2)}</p>
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" title="Edit item" onClick={() => onEdit(item)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" title="Deactivate item" onClick={() => onDeactivate(item.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
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
