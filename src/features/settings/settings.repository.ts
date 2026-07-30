import { supabase } from "@/shared/lib/supabase";
import { compressImage } from "@/shared/lib/image-compression";

const companySettingsCacheKey = "z-pos:settings:company:v1";
const maxCacheAgeMs = 24 * 60 * 60 * 1000;

export interface ReceiptSettingsForm {
  id?: string;
  branchId: string;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  currency: string;
  receiptFooter: string;
  thankYouMessage: string;
  taxRate: number;
}

interface SettingsRow {
  id: string;
  branch_id: string;
  company_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_number: string | null;
  logo_url?: string | null;
  currency: string;
  receipt_footer: string | null;
  thank_you_message?: string | null;
  tax_rate: number | string;
}

const selectWithReceiptMessages =
  "id, branch_id, company_name, address, phone, email, tax_number, logo_url, currency, receipt_footer, thank_you_message, tax_rate";
const selectWithoutReceiptMessages =
  "id, branch_id, company_name, address, phone, email, tax_number, currency, receipt_footer, tax_rate";

export async function loadCompanySettings(branchId: string): Promise<ReceiptSettingsForm | null> {
  const result = await supabase
    .from("company_settings")
    .select(selectWithReceiptMessages)
    .eq("branch_id", branchId)
    .maybeSingle();
  let data = result.data as SettingsRow | null;
  let error = result.error;

  if (isMissingReceiptSettingsError(error)) {
    const fallback = await supabase
      .from("company_settings")
      .select(selectWithoutReceiptMessages)
      .eq("branch_id", branchId)
      .maybeSingle();
    data = fallback.data ? withReceiptDefaults(fallback.data) : null;
    error = fallback.error;
  }

  if (error) throw error;
  const settings = data ? mapSettings(data) : null;
  if (settings) writeCachedCompanySettings(settings);
  return settings;
}

export async function saveCompanySettings(input: ReceiptSettingsForm): Promise<ReceiptSettingsForm> {
  const payload = {
    branch_id: input.branchId,
    company_name: input.companyName.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
    email: input.email.trim() || null,
    tax_number: null,
    logo_url: input.logoUrl.trim() || null,
    currency: input.currency.trim() || "LKR",
    receipt_footer: input.receiptFooter.trim(),
    thank_you_message: input.thankYouMessage.trim(),
    tax_rate: input.taxRate,
  };

  const result = await supabase
    .from("company_settings")
    .upsert(payload, { onConflict: "branch_id" })
    .select(selectWithReceiptMessages)
    .single();
  let data = result.data as SettingsRow | null;
  let error = result.error;

  if (isMissingReceiptSettingsError(error)) {
    const fallbackPayload = {
      branch_id: input.branchId,
      company_name: input.companyName.trim(),
      address: input.address.trim(),
      phone: input.phone.trim(),
      email: input.email.trim() || null,
      tax_number: null,
      currency: input.currency.trim() || "LKR",
      receipt_footer: input.receiptFooter.trim(),
      tax_rate: input.taxRate,
    };
    const fallback = await supabase
      .from("company_settings")
      .upsert(fallbackPayload, { onConflict: "branch_id" })
      .select(selectWithoutReceiptMessages)
      .single();
    data = fallback.data ? withReceiptDefaults(fallback.data) : null;
    error = fallback.error;
  }

  if (error) throw error;
  if (!data) throw new Error("Could not save settings.");
  const settings = mapSettings(data);
  writeCachedCompanySettings(settings);
  return settings;
}

export async function uploadCompanyLogo(branchId: string, file: File): Promise<string> {
  const image = await compressImage(file);
  const objectPath = `${branchId}/${Date.now()}-${image.fileName}`;

  const { error } = await supabase.storage
    .from("brand-assets")
    .upload(objectPath, image.blob, {
      contentType: image.contentType,
      upsert: true,
    });

  if (error) {
    if (error.message.toLowerCase().includes("bucket")) {
      throw new Error("Storage bucket 'brand-assets' was not found. Run the latest Supabase migration before uploading logos.");
    }
    throw error;
  }

  const { data } = supabase.storage.from("brand-assets").getPublicUrl(objectPath);
  return data.publicUrl;
}

export function readCachedCompanySettings(): ReceiptSettingsForm | undefined {
  try {
    const raw = localStorage.getItem(companySettingsCacheKey);
    if (!raw) return undefined;

    const payload = JSON.parse(raw) as { savedAt: number; data: ReceiptSettingsForm };
    if (!payload.data) return undefined;
    if (Date.now() - payload.savedAt > maxCacheAgeMs) return undefined;

    return payload.data;
  } catch {
    return undefined;
  }
}

export function writeCachedCompanySettings(settings: ReceiptSettingsForm) {
  try {
    localStorage.setItem(
      companySettingsCacheKey,
      JSON.stringify({
        savedAt: Date.now(),
        data: settings,
      }),
    );
  } catch {
    // Storage can be unavailable in private mode. Live queries still work.
  }
}

export function clearCachedCompanySettings() {
  try {
    localStorage.removeItem(companySettingsCacheKey);
  } catch {
    // Ignore cache cleanup failures.
  }
}

function mapSettings(row: SettingsRow): ReceiptSettingsForm {
  return {
    id: row.id,
    branchId: row.branch_id,
    companyName: row.company_name,
    address: row.address ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    logoUrl: row.logo_url ?? "/brand/logo.png",
    currency: row.currency,
    receiptFooter: row.receipt_footer ?? "Thank you. Come again.",
    thankYouMessage: row.thank_you_message ?? row.receipt_footer ?? "Thank you. Come again.",
    taxRate: Number(row.tax_rate),
  };
}

function withReceiptDefaults(row: Omit<SettingsRow, "thank_you_message" | "logo_url">): SettingsRow {
  return {
    ...row,
    thank_you_message: row.receipt_footer ?? "Thank you. Come again.",
    logo_url: "/brand/logo.png",
  };
}

function isMissingReceiptSettingsError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("thank_you_message") ||
    message.includes("logo_url")
  );
}
