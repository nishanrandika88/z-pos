export interface Category {
  id: string;
  name: string;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  itemCode: string;
  barcode?: string;
  itemName: string;
  description?: string;
  image?: string;
  sellingPrice: number;
  categoryId: string;
  categoryName: string;
  categoryActive?: boolean;
  categoryDisplayOrder?: number;
  availability: boolean;
  active: boolean;
  displayOrder: number;
}

export interface Discount {
  id: string;
  name: string;
  percentage: number;
  applicableType: "ITEM" | "CATEGORY";
  applicableId: string;
  active: boolean;
}
