import { supabase } from "@/shared/lib/supabase";
import type { OrderPayment, OrderSummary } from "@/features/orders/types";
import { readCachedCompanySettings, writeCachedCompanySettings } from "@/features/settings/settings.repository";

const amount = new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOnly = new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "2-digit", year: "numeric" });
const timeOnly = new Intl.DateTimeFormat("en-LK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

interface ReceiptSettings {
  companyName: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  receiptFooter?: string;
  thankYouMessage?: string;
}

const defaultLogoUrl = "/brand/logo.png";

export function openReceiptWindow() {
  const popup = window.open("", "receipt-print", "width=420,height=720");

  if (popup) {
    popup.document.write(`
      <!doctype html>
      <html>
        <head><title>Preparing receipt</title></head>
        <body style="font-family: monospace; padding: 16px;">Preparing receipt...</body>
      </html>
    `);
    popup.document.close();
  }

  return popup;
}

export async function printReceipt(order: OrderSummary, receiptWindow = openReceiptWindow()) {
  if (!receiptWindow) throw new Error("Allow popup windows to print receipts.");

  const settings = await loadReceiptSettings();
  receiptWindow.document.open();
  receiptWindow.document.write(receiptHtml(order, settings));
  receiptWindow.document.close();
  receiptWindow.focus();
  receiptWindow.print();
}

async function loadReceiptSettings(): Promise<ReceiptSettings> {
  const fallback = {
    companyName: "Zestora",
    logoUrl: defaultLogoUrl,
    receiptFooter: "Powered by Zestora",
    thankYouMessage: "Thank you. Come again.",
  };
  const cached = readCachedCompanySettings();
  if (cached) return cached;

  try {
    let { data, error } = await supabase
      .from("company_settings")
      .select("branch_id, company_name, address, phone, email, logo_url, currency, receipt_footer, thank_you_message, tax_rate")
      .limit(1)
      .maybeSingle();

    if (isMissingReceiptSettingsError(error)) {
      const fallbackQuery = await supabase
        .from("company_settings")
        .select("branch_id, company_name, address, phone, email, currency, receipt_footer, tax_rate")
        .limit(1)
        .maybeSingle();
      data = fallbackQuery.data
        ? {
            ...fallbackQuery.data,
            thank_you_message: fallbackQuery.data.receipt_footer,
            logo_url: fallback.logoUrl,
          }
        : null;
      error = fallbackQuery.error;
    }

    if (error || !data) return fallback;

    const settings = {
      branchId: data.branch_id ?? "",
      companyName: data.company_name,
      address: data.address ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      logoUrl: data.logo_url ?? fallback.logoUrl,
      currency: data.currency ?? "LKR",
      receiptFooter: data.receipt_footer ?? fallback.receiptFooter,
      thankYouMessage: data.thank_you_message ?? data.receipt_footer ?? fallback.thankYouMessage,
      taxRate: Number(data.tax_rate ?? 0),
    };
    writeCachedCompanySettings(settings);
    return settings;
  } catch {
    return fallback;
  }
}

export function receiptHtml(order: OrderSummary, settings: ReceiptSettings) {
  const payment = order.payments[0];
  const createdAt = new Date(order.createdAt);
  const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalDiscount = order.automaticDiscountTotal + order.manualDiscountTotal;
  const itemRows = order.items.map((item, index) => itemRow(index + 1, item)).join("");
  const logoUrl = settings.logoUrl?.trim() || defaultLogoUrl;
  const headerLines = [
    addressBlock(settings.address),
    settings.phone ? `<div class="center">Tel: ${escapeHtml(settings.phone)}</div>` : "",
    settings.email ? `<div class="center">${escapeHtml(settings.email)}</div>` : "",
  ].filter(Boolean).join("");
  const footerSections = [
    settings.thankYouMessage ? `<div class="footer">${escapeHtml(settings.thankYouMessage)}</div>` : "",
    settings.receiptFooter ? `<div class="footer muted">${escapeHtml(settings.receiptFooter)}</div>` : "",
  ].filter(Boolean);
  const sections = [
    `
      <section>
        <img class="logo" src="${escapeHtml(logoUrl)}" alt="Receipt logo" />
        ${settings.companyName ? `<h1 class="shop-name">${escapeHtml(settings.companyName.toUpperCase())}</h1>` : ""}
        ${headerLines}
      </section>
    `,
    `
      <section class="meta-list">
        <div class="line"><span>Invoice No</span><span>${escapeHtml(order.orderNumber)}</span></div>
        <div class="line"><span>Cashier</span><span>${escapeHtml(order.cashierName)}</span></div>
        <div class="line"><span>Date</span><span>${escapeHtml(dateOnly.format(createdAt))}</span></div>
        <div class="line"><span>Time</span><span>${escapeHtml(timeOnly.format(createdAt))}</span></div>
      </section>
    `,
    `
      <section>
        <table class="items-table">
          <thead>
            <tr>
              <th class="col-no">#</th>
              <th>Item</th>
              <th class="col-price right">Price</th>
              <th class="col-disc right">Disc%</th>
              <th class="col-qty right">Qty</th>
              <th class="col-amt right">Amount</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </section>
    `,
    `
      <section>
        ${amountLine("Subtotal", order.subtotal)}
        ${totalDiscount > 0 ? amountLine("Discount", -totalDiscount) : ""}
        ${order.taxTotal > 0 ? amountLine("Tax", order.taxTotal) : ""}
        <div class="line total"><span>Net Amount</span><span>${formatAmount(order.grandTotal)}</span></div>
        ${paymentBlock(payment)}
      </section>
    `,
    `
      <section class="meta-list">
        <div class="line"><span>Total Products</span><span>${order.items.length}</span></div>
        <div class="line"><span>Total Qty</span><span>${formatQuantity(totalQty)}</span></div>
      </section>
    `,
    footerSections.length > 0 ? `<section>${footerSections.join("")}</section>` : "",
  ].filter((section) => section.trim());

  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(order.orderNumber)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #fff;
            color: #111;
            font-family: "Receipt Regular", "Merchant Copy", "OCR-B", "Letter Gothic Std", "Courier New", Consolas, monospace;
            font-size: 12px;
            line-height: 1.18;
          }
          .receipt {
            width: 80mm;
            max-width: 80mm;
            padding: 10px 12px;
          }
          .shop-name {
            margin: 0 0 4px;
            text-align: center;
            font-size: 23px;
            line-height: .95;
            font-weight: 900;
            letter-spacing: .2px;
          }
          .logo {
            display: block;
            width: 42px;
            height: 42px;
            object-fit: contain;
            margin: 0 auto 5px;
          }
          .center { text-align: center; }
          .address-line {
            text-align: center;
            overflow-wrap: anywhere;
          }
          .right { text-align: right; }
          .muted { color: #333; }
          .rule {
            margin: 8px 0;
            border-top: 1px dashed #111;
            height: 0;
          }
          .meta {
            display: grid;
            grid-template-columns: 1fr 1fr;
            column-gap: 12px;
            row-gap: 2px;
          }
          .meta-list {
            display: block;
          }
          .line {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin: 2px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          .items-table {
            font-size: 11px;
          }
          th {
            padding: 0 0 4px;
            text-align: left;
            font-weight: 700;
          }
          thead tr {
            border-bottom: 1px dashed #111;
          }
          td {
            padding: 3px 0;
            vertical-align: top;
          }
          .col-no { width: 18px; }
          .col-price { width: 54px; padding-right: 3px; }
          .col-disc { width: 38px; padding-left: 3px; }
          .col-qty { width: 40px; }
          .col-amt { width: 62px; }
          .product-name {
            overflow-wrap: anywhere;
            font-weight: 700;
          }
          .product-code {
            margin-top: 1px;
            color: #333;
          }
          .total {
            margin-top: 5px;
            font-size: 18px;
            font-weight: 900;
          }
          .payment-note {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 8px;
          }
          .footer {
            margin-top: 8px;
            text-align: center;
            font-size: 12px;
          }
          @media print {
            body { width: 80mm; }
            .receipt { width: 80mm; }
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          ${sections.join('<div class="rule"></div>')}
        </div>
      </body>
    </html>
  `;
}

function itemRow(index: number, item: OrderSummary["items"][number]) {
  return `
    <tr>
      <td class="col-no">${index}</td>
      <td>
        <div class="product-name">${escapeHtml(item.itemName)}</div>
        <div class="product-code">${escapeHtml(item.itemCode)}</div>
      </td>
      <td class="right">${formatAmount(item.unitPrice)}</td>
      <td class="right">${formatDiscountPercent(item)}</td>
      <td class="right">${formatQuantity(item.quantity)}</td>
      <td class="right">${formatAmount(item.lineTotal)}</td>
    </tr>
  `;
}

function amountLine(label: string, value: number) {
  return `<div class="line"><span>${escapeHtml(label)}</span><span>${formatAmount(value)}</span></div>`;
}

function paymentBlock(payment: OrderPayment | undefined) {
  if (!payment) return "";

  if (payment.method === "CARD") {
    const maskedCard = payment.maskedCardNumber || (payment.cardLast4 ? `XXXX XXXX XXXX ${payment.cardLast4}` : "");
    return `
      <div class="payment-note">
        <span>${escapeHtml(payment.cardType ?? "Card")} ${escapeHtml(maskedCard)}</span>
        <span>${formatAmount(payment.amount)}</span>
      </div>
      ${payment.bankName ? `<div>Bank : ${escapeHtml(payment.bankName)}</div>` : ""}
    `;
  }

  return `
    <div class="payment-note"><span>Cash</span><span>${formatAmount(payment.amount)}</span></div>
    ${
      (payment.amountTendered ?? 0) > payment.amount || (payment.balanceReturned ?? 0) > 0
        ? `
          <div class="payment-note"><span>Tendered</span><span>${formatAmount(payment.amountTendered ?? 0)}</span></div>
          <div class="payment-note"><span>Balance</span><span>${formatAmount(payment.balanceReturned ?? 0)}</span></div>
        `
        : ""
    }
  `;
}

function addressBlock(address: string | undefined) {
  const lines = splitAddress(address);
  if (lines.length === 0) return "";
  return lines.map((line) => `<div class="address-line">${escapeHtml(line)}</div>`).join("");
}

function splitAddress(address: string | undefined) {
  const normalized = address?.trim().replace(/\s+/g, " ");
  if (!normalized) return [];

  const commaParts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const midpoint = Math.ceil(commaParts.length / 2);
    return [
      commaParts.slice(0, midpoint).join(", "),
      commaParts.slice(midpoint).join(", "),
    ].filter(Boolean);
  }

  const words = normalized.split(" ");
  if (words.length <= 4 || normalized.length <= 32) return [normalized];

  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

function formatAmount(value: number) {
  return amount.format(value);
}

function formatQuantity(value: number) {
  return amount.format(value).replace(/\.00$/, "");
}

function formatDiscountPercent(item: OrderSummary["items"][number]) {
  const grossAmount = item.unitPrice * item.quantity;
  if (grossAmount <= 0 || item.discountTotal <= 0) return "-";
  return `${Math.round((item.discountTotal / grossAmount) * 100)}%`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return replacements[character];
  });
}

function isMissingReceiptSettingsError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("thank_you_message") ||
    message.includes("logo_url")
  );
}
