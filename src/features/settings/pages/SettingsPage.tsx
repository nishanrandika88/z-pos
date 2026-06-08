import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Printer, Save, Store } from "lucide-react";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import {
  loadCompanySettings,
  readCachedCompanySettings,
  saveCompanySettings,
  type ReceiptSettingsForm,
} from "@/features/settings/settings.repository";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

const defaults = (branchId: string): ReceiptSettingsForm => ({
  branchId,
  companyName: "",
  address: "",
  phone: "",
  email: "",
  taxNumber: "",
  currency: "LKR",
  receiptFooter: "Thank you. Come again.",
  thankYouMessage: "Thank you. Come again.",
  exchangePolicyMessage: "Items with proof of purchase may be exchanged within five days.",
  noCashRefundMessage: "No cash refund",
  showNoCashRefund: true,
  taxRate: 0,
});

export function SettingsPage() {
  const profile = useAuthStore((state) => state.profile);
  const branchId = profile?.branchId;
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<ReceiptSettingsForm>(() => defaults(branchId ?? ""));

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ["company-settings", branchId],
    queryFn: () => loadCompanySettings(branchId ?? ""),
    initialData: () => {
      const cached = readCachedCompanySettings();
      return cached?.branchId === branchId ? cached : undefined;
    },
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: Boolean(branchId),
  });
  const saveMutation = useMutation({
    mutationFn: saveCompanySettings,
    onSuccess(saved) {
      setForm(saved);
      setNotice("Receipt settings saved.");
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
    if (!branchId || !form.companyName.trim() || !form.address.trim() || !form.phone.trim() || !form.receiptFooter.trim() || !form.thankYouMessage.trim()) {
      setNotice("Shop name, address, phone, bottom message, and thank you message are required.");
      return;
    }

    saveMutation.mutate({ ...form, branchId });
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Company, receipt, and printer configuration.</p>
      </div>

      <form className="grid gap-3 xl:grid-cols-[1fr_340px]" onSubmit={onSave}>
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
              required
            />
            <Input
              className="h-10 md:col-span-2"
              value={form.address}
              onChange={(event) => updateForm("address", event.target.value)}
              placeholder="Address"
              required
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
              value={form.taxNumber}
              onChange={(event) => updateForm("taxNumber", event.target.value)}
              placeholder="Tax number"
            />
            <Input
              className="h-10"
              value={form.currency}
              onChange={(event) => updateForm("currency", event.target.value)}
              placeholder="Currency"
            />
            <Input
              className="h-10"
              type="number"
              min={0}
              step="0.01"
              value={form.taxRate}
              onChange={(event) => updateForm("taxRate", Number(event.target.value) || 0)}
              placeholder="Tax rate"
            />
            <Input
              className="h-10 md:col-span-2"
              value={form.exchangePolicyMessage}
              onChange={(event) => updateForm("exchangePolicyMessage", event.target.value)}
              placeholder="Exchange policy message"
            />
            <Input
              className="h-10 md:col-span-2"
              value={form.thankYouMessage}
              onChange={(event) => updateForm("thankYouMessage", event.target.value)}
              placeholder="Thank you message"
              required
            />
            <Input
              className="h-10 md:col-span-2"
              value={form.receiptFooter}
              onChange={(event) => updateForm("receiptFooter", event.target.value)}
              placeholder="Bottom message"
              required
            />
            <div className="grid gap-2 md:col-span-2 md:grid-cols-[1fr_auto]">
              <Input
                className="h-10"
                value={form.noCashRefundMessage}
                onChange={(event) => updateForm("noCashRefundMessage", event.target.value)}
                placeholder="No cash refund message"
              />
              <label className="flex h-10 items-center gap-2 rounded-full border bg-white px-3 text-sm font-medium">
                <input
                  className="h-4 w-4 accent-black"
                  type="checkbox"
                  checked={form.showNoCashRefund}
                  onChange={(event) => updateForm("showNoCashRefund", event.target.checked)}
                />
                Show
              </label>
            </div>
            <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row sm:items-center">
              <Button type="submit" disabled={!branchId || saveMutation.isPending || isLoading}>
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
              {notice ? <p className="text-sm text-brand-espresso/70">{notice}</p> : null}
              {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
              {saveMutation.error ? <p className="text-sm text-destructive">{saveMutation.error.message}</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <h2 className="flex items-center gap-2 font-semibold"><Printer className="h-4 w-4" />Receipt Preview</h2>
          </CardHeader>
          <CardContent className="p-3">
            <div className="mx-auto max-w-80 rounded-md border bg-white p-4 font-mono text-xs text-brand-espresso shadow-sm">
              <h3 className="text-center text-xl font-black leading-none text-black">{form.companyName || "Shop Name"}</h3>
              <p className="mt-2 text-center">{form.address || "Address"}</p>
              <p className="text-center">Tel: {form.phone || "Phone"}</p>
              <div className="my-3 border-t border-dashed border-black" />
              <div className="flex justify-between"><span>Receipt</span><span>INV-000001</span></div>
              <div className="my-3 border-t border-dashed border-black" />
              <div className="flex justify-between"><span>Net Amount</span><strong>1,200.00</strong></div>
              <div className="my-3 border-t border-dashed border-black" />
              <p className="text-center">{form.exchangePolicyMessage}</p>
              <div className="my-3 border-t border-dashed border-black" />
              <p className="text-center">{form.thankYouMessage}</p>
              {form.showNoCashRefund ? <p className="text-center text-brand-espresso/70">{form.noCashRefundMessage}</p> : null}
              <p className="mt-2 text-center text-brand-espresso/70">{form.receiptFooter}</p>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
