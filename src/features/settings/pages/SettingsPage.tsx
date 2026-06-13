import { type ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageUp, Printer, Save, Store } from "lucide-react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { receiptHtml } from "@/features/orders/receipt-print";
import type { OrderSummary } from "@/features/orders/types";
import {
  loadCompanySettings,
  readCachedCompanySettings,
  saveCompanySettings,
  uploadCompanyLogo,
  type ReceiptSettingsForm,
} from "@/features/settings/settings.repository";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { NoticeToast, type Notice } from "@/shared/ui/notice-toast";

const defaults = (branchId: string): ReceiptSettingsForm => ({
  branchId,
  companyName: "",
  address: "",
  phone: "",
  email: "",
  logoUrl: "/brand/logo.png",
  currency: "LKR",
  receiptFooter: "Thank you. Come again.",
  thankYouMessage: "Thank you. Come again.",
  taxRate: 0,
});

const sampleReceiptOrder: OrderSummary = {
  id: "preview",
  orderNumber: "INV-20260613-000001",
  status: "COMPLETED",
  cashierName: "Cashier Name",
  subtotal: 1200,
  automaticDiscountTotal: 0,
  manualDiscountTotal: 100,
  taxTotal: 0,
  grandTotal: 1100,
  createdAt: new Date("2026-06-13T10:30:00").toISOString(),
  completedAt: new Date("2026-06-13T10:30:00").toISOString(),
  items: [
    {
      id: "preview-line-1",
      itemCode: "ITEM-001",
      itemName: "Sample Item",
      quantity: 2,
      unitPrice: 600,
      discountTotal: 100,
      lineTotal: 1100,
    },
  ],
  payments: [
    {
      id: "preview-payment",
      method: "CASH",
      amount: 1100,
      amountTendered: 1500,
      balanceReturned: 400,
    },
  ],
};

export function SettingsPage() {
  const profile = useAuthStore((state) => state.profile);
  const branchId = profile?.branchId;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [form, setForm] = useState<ReceiptSettingsForm>(() => defaults(branchId ?? ""));
  const previewHtml = useMemo(() => receiptHtml(sampleReceiptOrder, form), [form]);

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ["company-settings", branchId],
    queryFn: () => loadCompanySettings(branchId ?? ""),
    initialData: () => {
      const cached = readCachedCompanySettings();
      return cached?.branchId === branchId ? cached : undefined;
    },
    staleTime: 15 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    enabled: Boolean(branchId),
  });
  const saveMutation = useMutation({
    mutationFn: saveCompanySettings,
    onSuccess(saved) {
      setForm(saved);
      setNotice({ tone: "success", message: "Receipt settings saved." });
    },
    onError(error) {
      setNotice({ tone: "error", message: error.message });
    },
  });
  const uploadLogoMutation = useMutation({
    mutationFn(file: File) {
      if (!branchId) throw new Error("Branch is not available.");
      return uploadCompanyLogo(branchId, file);
    },
    onSuccess(logoUrl) {
      updateForm("logoUrl", logoUrl);
      setNotice({ tone: "success", message: "Logo uploaded. Save settings to keep it on receipts." });
    },
    onError(error) {
      setNotice({ tone: "error", message: error.message });
    },
  });

  useEffect(() => {
    if (settings) {
      setForm(settings);
    } else if (branchId) {
      setForm(defaults(branchId));
    }
  }, [branchId, settings]);

  function updateForm(key: keyof ReceiptSettingsForm, value: string | boolean | number) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (!branchId || !form.companyName.trim()) {
      setNotice({ tone: "warning", message: "Shop name is required." });
      return;
    }

    saveMutation.mutate({ ...form, branchId });
  }

  function onLogoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setNotice(null);
    uploadLogoMutation.mutate(file);
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Company, receipt, and printer configuration.</p>
      </div>
      {notice ? <NoticeToast notice={notice} onClose={() => setNotice(null)} /> : null}

      <form className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,380px)]" onSubmit={onSave}>
        <Card>
          <CardHeader className="p-3">
            <h2 className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4" />Receipt Details</h2>
          </CardHeader>
          <CardContent className="grid gap-2.5 p-3 md:grid-cols-2">
            <Input
              className="h-10"
              value={form.companyName}
              onChange={(event) => updateForm("companyName", event.target.value)}
              placeholder="Shop name"
              required
            />
            <Input
              className="h-10"
              value={form.phone}
              onChange={(event) => updateForm("phone", event.target.value)}
              placeholder="Phone numbers"
            />
            <Input
              className="h-10 md:col-span-2"
              value={form.address}
              onChange={(event) => updateForm("address", event.target.value)}
              placeholder="Address"
            />
            <Input
              className="h-10"
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
              placeholder="Email"
              type="email"
            />
            <Input
              className="h-10"
              value={form.currency}
              onChange={(event) => updateForm("currency", event.target.value)}
              placeholder="Currency"
            />
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-brand-espresso/70">Tax rate (%)</span>
              <Input
                className="h-10"
                type="number"
                min={0}
                step="0.01"
                value={form.taxRate}
                onChange={(event) => updateForm("taxRate", Number(event.target.value) || 0)}
                placeholder="0"
              />
            </label>
            <div className="grid gap-2 md:col-span-2 md:grid-cols-[72px_1fr_auto] md:items-center">
              <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border bg-white">
                <img className="h-full w-full object-contain p-2" src={form.logoUrl || "/brand/logo.png"} alt="Receipt logo" />
              </div>
              <Input
                className="h-10"
                value={form.logoUrl}
                onChange={(event) => updateForm("logoUrl", event.target.value)}
                placeholder="Logo URL"
              />
              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border bg-white px-4 text-sm font-medium hover:bg-white">
                <ImageUp className="h-4 w-4" />
                {uploadLogoMutation.isPending ? "Uploading..." : "Upload"}
                <input className="sr-only" type="file" accept="image/*" onChange={onLogoSelected} disabled={!branchId || uploadLogoMutation.isPending} />
              </label>
            </div>
            <Input
              className="h-10 md:col-span-2"
              value={form.thankYouMessage}
              onChange={(event) => updateForm("thankYouMessage", event.target.value)}
              placeholder="Thank you message"
            />
            <Input
              className="h-10 md:col-span-2"
              value={form.receiptFooter}
              onChange={(event) => updateForm("receiptFooter", event.target.value)}
              placeholder="Bottom message"
            />
            <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row sm:items-center">
              <Button type="submit" disabled={!branchId || saveMutation.isPending || isLoading}>
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
              {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <h2 className="flex items-center gap-2 font-semibold"><Printer className="h-4 w-4" />Receipt Preview</h2>
          </CardHeader>
          <CardContent className="overflow-x-auto p-3">
            <iframe
              className="mx-auto h-[620px] w-[320px] max-w-full rounded-md border bg-white shadow-sm sm:w-[340px]"
              srcDoc={previewHtml}
              title="Receipt preview"
            />
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
