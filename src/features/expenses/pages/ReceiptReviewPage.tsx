import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileSearch, Save, TriangleAlert } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import {
  createReceiptSignedUrl,
  getExpenseReceipt,
  processExpenseReceipt,
  reviewExpenseReceipt,
} from "@/features/expenses/expenses.repository";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";

export function ReceiptReviewPage() {
  const { receiptId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const receiptQuery = useQuery({
    queryKey: ["expense-receipt", receiptId],
    queryFn: () => getExpenseReceipt(receiptId),
    enabled: Boolean(receiptId),
    refetchInterval: (query) => query.state.data?.processingStatus === "PROCESSING" ? 2000 : false,
  });
  const [jsonText, setJsonText] = useState("");
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!receiptQuery.data || jsonText) return;
    setJsonText(JSON.stringify(receiptQuery.data.correctedData ?? receiptQuery.data.extractedData ?? emptyExtraction(), null, 2));
  }, [jsonText, receiptQuery.data]);

  const processMutation = useMutation({
    mutationFn: () => processExpenseReceipt(receiptId),
    onSuccess: async () => { setMessage("OCR processing started. Extracted values remain a draft until you review them."); await queryClient.invalidateQueries({ queryKey: ["expense-receipt", receiptId] }); },
  });
  const reviewMutation = useMutation({
    mutationFn: async () => {
      let corrected: unknown;
      try { corrected = JSON.parse(jsonText); } catch { throw new Error("Corrected data must be valid JSON."); }
      await reviewExpenseReceipt(receiptId, corrected);
    },
    onSuccess: async () => { setMessage("Receipt corrections saved and audited."); await queryClient.invalidateQueries({ queryKey: ["expense-receipt", receiptId] }); },
  });

  if (receiptQuery.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading receipt…</p>;
  if (receiptQuery.error || !receiptQuery.data) return <p className="p-6 text-sm text-destructive">{receiptQuery.error?.message ?? "Receipt not found."}</p>;
  const receipt = receiptQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="flex items-center gap-3"><Button variant="outline" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-semibold">Receipt review</h1><p className="text-sm text-muted-foreground">{receipt.fileName} · {label(receipt.processingStatus)}</p></div></div><Button variant="outline" onClick={() => void createReceiptSignedUrl(receipt.storagePath).then((url) => window.open(url, "_blank", "noopener,noreferrer"))}><ExternalLink className="h-4 w-4" />Open original</Button></div>

      {receipt.duplicateOfId ? <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Possible duplicate receipt</p><p>The same file hash already exists. Inspect the original and related expense before proceeding; saving corrections does not create another expense.</p></div></div> : null}
      {receipt.errorMessage ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">OCR could not finish: {receipt.errorMessage}. You can enter the receipt manually below.</p> : null}
      {message ? <p className="rounded-md border border-brand-forest/30 bg-brand-forest/5 p-3 text-sm text-brand-forest">{message}</p> : null}
      {processMutation.error || reviewMutation.error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{processMutation.error?.message ?? reviewMutation.error?.message}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card><CardHeader><h2 className="font-semibold">Processing</h2></CardHeader><CardContent className="space-y-4"><Info label="Status" value={label(receipt.processingStatus)} /><Info label="Provider" value={receipt.ocrProvider || "Manual / not processed"} /><Info label="File hash" value={receipt.fileHash} /><p className="text-sm text-muted-foreground">OCR output is untrusted draft data. Check supplier, invoice, date, every line, discounts, tax, and total against the original.</p><Button disabled={processMutation.isPending || receipt.processingStatus === "PROCESSING"} onClick={() => processMutation.mutate()}><FileSearch className="h-4 w-4" />{receipt.processingStatus === "PROCESSING" ? "Processing…" : "Extract with OCR"}</Button></CardContent></Card>
        <Card><CardHeader><h2 className="font-semibold">Corrected structured data</h2><p className="text-sm text-muted-foreground">Remove irrelevant lines and correct every OCR error. This review still does not post inventory or finalize an expense.</p></CardHeader><CardContent className="space-y-3"><textarea aria-label="Corrected receipt JSON" className="min-h-[480px] w-full rounded-md border bg-slate-950 p-3 font-mono text-xs text-slate-100" value={jsonText} onChange={(event) => setJsonText(event.target.value)} /><div className="flex flex-wrap gap-2"><Button disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate()}><Save className="h-4 w-4" />Save reviewed data</Button>{receipt.processingStatus === "REVIEWED" ? <Link className="inline-flex h-11 items-center rounded-full border bg-white px-4 text-sm font-medium" to={`/expenses/new?receiptId=${receipt.id}`}>Create expense from review</Link> : null}</div></CardContent></Card>
      </div>
    </div>
  );
}

function Info({ label: title, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p><p className="break-all text-sm">{value}</p></div>; }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function emptyExtraction() { return { supplierName: null, invoiceNumber: null, purchaseDate: null, currency: "LKR", items: [], subtotal: null, discount: null, tax: null, additionalCharges: null, total: null, warnings: ["Enter the bill manually or run OCR."] }; }
