import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Edit, ImagePlus, Plus, Search, Trash2, X } from "lucide-react";
import type { Category, Item } from "@/domain/catalog/types";
import {
  createCategory,
  createItem,
  deactivateCategory,
  deactivateItem,
  listCategories,
  listItems,
  updateCategory,
  updateItem,
  uploadItemImage,
} from "@/features/catalog/catalog.repository";
import {
  clearCachedActiveItems,
  clearCachedCatalogData,
  readCachedCatalogCategories,
  readCachedCatalogItems,
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

export function CatalogPage() {
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemImage, setItemImage] = useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);
  const [editingItemImageUrl, setEditingItemImageUrl] = useState<string | null>(null);
  const [itemFormError, setItemFormError] = useState<string | null>(null);
  const [isUploadingItemImage, setIsUploadingItemImage] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);

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
    if (categories.length > 0) {
      writeCachedCatalogCategories(categories);
    }
  }, [categories]);

  useEffect(() => {
    if (items.length > 0) {
      writeCachedCatalogItems(items);
    }
  }, [items]);

  const createCategoryMutation = useMutation({
    mutationFn: createCategory,
    async onSuccess() {
      setCategoryName("");
      setShowCategoryForm(false);
      clearCachedActiveItems();
      clearCachedCatalogData();
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: updateCategory,
    async onSuccess() {
      setEditingCategory(null);
      clearCachedActiveItems();
      clearCachedCatalogData();
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const deactivateCategoryMutation = useMutation({
    mutationFn: deactivateCategory,
    async onSuccess() {
      clearCachedActiveItems();
      clearCachedCatalogData();
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const createItemMutation = useMutation({
    mutationFn: createItem,
    async onSuccess() {
      resetItemForm();
      setShowItemForm(false);
      clearCachedActiveItems();
      clearCachedCatalogData();
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: updateItem,
    async onSuccess() {
      resetItemForm();
      setEditingItemId(null);
      setShowItemForm(false);
      clearCachedActiveItems();
      clearCachedCatalogData();
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const deactivateItemMutation = useMutation({
    mutationFn: deactivateItem,
    async onSuccess() {
      clearCachedActiveItems();
      clearCachedCatalogData();
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  function resetItemForm() {
    setItemForm(emptyItemForm);
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
    const categoryId = itemForm.categoryId || categories[0]?.id;

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Catalog</h1>
          <p className="text-muted-foreground">Categories and sellable items.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCategoryForm((value) => !value)}>
            {showCategoryForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Category
          </Button>
          <Button
            onClick={() => {
              if (showItemForm) {
                resetItemForm();
                setEditingItemId(null);
              }
              setShowItemForm((value) => !value);
            }}
          >
            {showItemForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Item
          </Button>
        </div>
      </div>

      {showCategoryForm ? (
        <form className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row" onSubmit={onCreateCategory}>
          <Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" autoFocus />
          <Button type="submit" disabled={!profile?.branchId || !categoryName.trim() || createCategoryMutation.isPending}>
            <Plus className="h-4 w-4" />
            Create
          </Button>
          {createCategoryMutation.error ? <p className="self-center text-sm text-destructive">{createCategoryMutation.error.message}</p> : null}
        </form>
      ) : null}

      {editingCategory ? (
        <form className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row" onSubmit={onUpdateCategory}>
          <Input
            value={editingCategory.name}
            onChange={(event) => setEditingCategory((current) => (current ? { ...current, name: event.target.value } : current))}
            placeholder="Category name"
            autoFocus
          />
          <Button type="submit" disabled={!editingCategory.name.trim() || updateCategoryMutation.isPending}>Save</Button>
          <Button type="button" variant="ghost" onClick={() => setEditingCategory(null)}>Cancel</Button>
          {updateCategoryMutation.error ? <p className="self-center text-sm text-destructive">{updateCategoryMutation.error.message}</p> : null}
        </form>
      ) : null}

      {showItemForm ? (
        <form className="grid gap-3 rounded-md border bg-card p-3 md:grid-cols-2 xl:grid-cols-6" onSubmit={onSaveItem}>
          <Input
            className="xl:col-span-2"
            value={itemForm.itemName}
            onChange={(event) => updateItemForm("itemName", event.target.value)}
            placeholder="Item name"
            autoFocus
          />
          <div className="relative xl:col-span-2">
            <select
              className="flex h-11 w-full appearance-none rounded-full border bg-white px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="xl:col-span-2"
            value={itemForm.sellingPrice}
            onChange={(event) => updateItemForm("sellingPrice", event.target.value)}
            placeholder="Selling price"
            type="number"
            min={0}
            step="0.01"
          />
          <Input
            className="xl:col-span-3"
            value={itemForm.itemCode}
            onChange={(event) => updateItemForm("itemCode", event.target.value)}
            placeholder="Item code"
          />
          <Input
            className="xl:col-span-3"
            value={itemForm.barcode}
            onChange={(event) => updateItemForm("barcode", event.target.value)}
            placeholder="Barcode"
          />
          <Input
            className="md:col-span-2 xl:col-span-3"
            value={itemForm.description}
            onChange={(event) => updateItemForm("description", event.target.value)}
            placeholder="Description"
          />
          <Input
            className="md:col-span-2 xl:col-span-3"
            accept="image/*"
            type="file"
            onChange={(event) => onItemImageChange(event.target.files?.[0] ?? null)}
          />
          {itemImagePreview ? (
            <div className="flex items-center gap-3 md:col-span-2 xl:col-span-6">
              <img className="h-16 w-16 rounded-2xl object-cover" src={itemImagePreview} alt="Selected item" />
              <Button type="button" variant="outline" onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}>
                <ImagePlus className="h-4 w-4" />
                Replace
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-6 xl:flex-row xl:items-center">
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
            {categories.length === 0 ? <p className="text-sm text-muted-foreground">Create a category before adding items.</p> : null}
            {createItemMutation.error ? <p className="text-sm text-destructive">{createItemMutation.error.message}</p> : null}
            {updateItemMutation.error ? <p className="text-sm text-destructive">{updateItemMutation.error.message}</p> : null}
            {itemFormError ? <p className="text-sm text-destructive">{itemFormError}</p> : null}
          </div>
        </form>
      ) : null}

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search item code, barcode, or name" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader><h2 className="font-semibold">Categories</h2></CardHeader>
          <CardContent className="space-y-2">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between rounded-md border p-3">
                <span>{category.name}</span>
                <div className="flex items-center gap-1">
                  <Badge>{category.active ? "Active" : "Inactive"}</Badge>
                  <Button size="icon" variant="ghost" title="Edit category" onClick={() => setEditingCategory(category)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Deactivate category" onClick={() => deactivateCategoryMutation.mutate(category.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><h2 className="font-semibold">Items</h2></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2">Code</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{item.itemCode}</td>
                    <td>{item.itemName}</td>
                    <td>{item.categoryName}</td>
                    <td>{item.sellingPrice.toFixed(2)}</td>
                    <td><Badge>{item.active ? "Active" : "Inactive"}</Badge></td>
                    <td className="flex gap-1 py-1.5">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
