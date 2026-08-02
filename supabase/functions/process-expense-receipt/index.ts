/* Edge Functions are outside the app's generated database typing boundary. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NormalizedReceipt {
  supplierName: string | null;
  invoiceNumber: string | null;
  purchaseDate: string | null;
  currency: string | null;
  items: Array<{
    description: string;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    discount: number | null;
    tax: number | null;
    lineTotal: number | null;
    confidence: number | null;
  }>;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  additionalCharges: number | null;
  total: number | null;
  confidence: number | null;
  warnings: string[];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return response({ error: "OCR service is not configured" }, 500);

  const authorization = request.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return response({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const receiptId = typeof body.receiptId === "string" ? body.receiptId : "";
  if (!/^[0-9a-f-]{36}$/i.test(receiptId)) return response({ error: "A valid receipt ID is required" }, 400);

  const { data: allowed } = await userClient.rpc("has_expense_permission", { required_permission: "expenses:receipts" });
  if (!allowed) return response({ error: "Receipt processing is not permitted" }, 403);

  const { data: receipt, error: receiptError } = await userClient
    .from("expense_receipts")
    .select("id, branch_id, storage_path, original_file_name, mime_type, processing_status")
    .eq("id", receiptId)
    .single();
  if (receiptError || !receipt) return response({ error: "Receipt not found" }, 404);
  if (receipt.processing_status === "PROCESSING") return response({ status: "PROCESSING" });

  await serviceClient.from("expense_receipts").update({ processing_status: "PROCESSING", error_message: null }).eq("id", receipt.id);
  try {
    const provider = (Deno.env.get("EXPENSE_OCR_PROVIDER") ?? "manual").toLowerCase();
    if (provider !== "openai" || !Deno.env.get("OPENAI_API_KEY")) {
      await serviceClient.from("expense_receipts").update({
        processing_status: "FAILED",
        ocr_provider: "manual",
        error_message: "Automated OCR is not configured. Review and enter this bill manually.",
      }).eq("id", receipt.id);
      return response({ status: "FAILED", manualFallback: true });
    }

    const { data: file, error: downloadError } = await serviceClient.storage.from("expense-receipts").download(receipt.storage_path);
    if (downloadError || !file) throw new Error(downloadError?.message ?? "Receipt file could not be downloaded");
    const normalized = await extractWithOpenAI(file, receipt.mime_type, receipt.original_file_name);
    const duplicateOfId = await findBusinessDuplicate(serviceClient, receipt.branch_id, receipt.id, normalized);
    await serviceClient.from("expense_receipts").update({
      processing_status: "EXTRACTED",
      ocr_provider: "openai",
      extracted_data: normalized,
      confidence: normalized.confidence,
      duplicate_of_id: duplicateOfId,
      error_message: null,
    }).eq("id", receipt.id);
    return response({ status: "EXTRACTED", duplicateOfId, data: normalized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt extraction failed";
    await serviceClient.from("expense_receipts").update({ processing_status: "FAILED", error_message: message.slice(0, 1000) }).eq("id", receipt.id);
    return response({ status: "FAILED", error: message, manualFallback: true }, 200);
  }
});

async function extractWithOpenAI(file: Blob, mimeType: string, fileName: string): Promise<NormalizedReceipt> {
  const apiKey = Deno.env.get("OPENAI_API_KEY")!;
  const model = Deno.env.get("EXPENSE_OCR_MODEL") ?? "gpt-4.1-mini";
  const dataUrl = `data:${mimeType};base64,${toBase64(await file.arrayBuffer())}`;
  const documentContent = mimeType === "application/pdf"
    ? { type: "input_file", filename: fileName, file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl, detail: "high" };
  const payload = {
    model,
    input: [{
      role: "user",
      content: [
        documentContent,
        { type: "input_text", text: "Extract this shop receipt or invoice faithfully. Do not infer missing values. Use null for unreadable or absent fields. Preserve each purchased line separately. Dates must be YYYY-MM-DD. Numbers must not contain currency symbols. Add warnings for illegible, inconsistent, or arithmetically mismatched content." },
      ],
    }],
    text: { format: { type: "json_schema", name: "expense_receipt", strict: true, schema: receiptSchema } },
  };

  let lastError = "OCR provider failed";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (result.ok) {
      const json = await result.json();
      const outputText = json.output_text ?? json.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === "output_text")?.text;
      if (!outputText) throw new Error("OCR provider returned no structured output");
      return JSON.parse(outputText) as NormalizedReceipt;
    }
    lastError = `OCR provider returned ${result.status}: ${(await result.text()).slice(0, 500)}`;
    if (![429, 500, 502, 503, 504].includes(result.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw new Error(lastError);
}

async function findBusinessDuplicate(client: any, branchId: string, receiptId: string, receipt: NormalizedReceipt) {
  if (!receipt.supplierName || !receipt.total) return null;
  let query = client.from("expenses").select("id").eq("branch_id", branchId).neq("status", "VOID").ilike("payee_snapshot", receipt.supplierName).eq("grand_total", receipt.total);
  if (receipt.invoiceNumber) query = query.ilike("invoice_number", receipt.invoiceNumber);
  if (receipt.purchaseDate) query = query.gte("expense_date", `${receipt.purchaseDate}T00:00:00+05:30`).lte("expense_date", `${receipt.purchaseDate}T23:59:59.999+05:30`);
  const { data: match } = await query.limit(1).maybeSingle();
  if (!match) return null;
  const { data: duplicateReceipt } = await client.from("expense_receipts").select("id").eq("expense_id", match.id).neq("id", receiptId).limit(1).maybeSingle();
  return duplicateReceipt?.id ?? null;
}

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const receiptSchema = {
  type: "object",
  additionalProperties: false,
  required: ["supplierName", "invoiceNumber", "purchaseDate", "currency", "items", "subtotal", "discount", "tax", "additionalCharges", "total", "confidence", "warnings"],
  properties: {
    supplierName: nullableString,
    invoiceNumber: nullableString,
    purchaseDate: nullableString,
    currency: nullableString,
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quantity", "unit", "unitPrice", "discount", "tax", "lineTotal", "confidence"],
        properties: { description: { type: "string" }, quantity: nullableNumber, unit: nullableString, unitPrice: nullableNumber, discount: nullableNumber, tax: nullableNumber, lineTotal: nullableNumber, confidence: nullableNumber },
      },
    },
    subtotal: nullableNumber,
    discount: nullableNumber,
    tax: nullableNumber,
    additionalCharges: nullableNumber,
    total: nullableNumber,
    confidence: nullableNumber,
    warnings: { type: "array", items: { type: "string" } },
  },
};

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
