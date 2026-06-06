import type { OrderSummary } from "@/features/orders/types";

const currency = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const dateTime = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" });

export function openReceiptWindow() {
  const popup = window.open("", "receipt-print", "width=420,height=720");

  if (popup) {
    popup.document.write(`
      <!doctype html>
      <html>
        <head><title>Preparing receipt</title></head>
        <body style="font-family: Arial, sans-serif; padding: 16px;">Preparing receipt...</body>
      </html>
    `);
    popup.document.close();
  }

  return popup;
}

export function printReceipt(order: OrderSummary, receiptWindow = openReceiptWindow()) {
  if (!receiptWindow) throw new Error("Allow popup windows to print receipts.");

  receiptWindow.document.open();
  receiptWindow.document.write(receiptHtml(order));
  receiptWindow.document.close();
  receiptWindow.focus();
  receiptWindow.print();
}

function receiptHtml(order: OrderSummary) {
  const payment = order.payments[0];
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.itemName)}<br><small>${escapeHtml(item.itemCode)} x ${item.quantity}</small></td>
          <td class="right">${currency.format(item.unitPrice)}</td>
          <td class="right">${currency.format(item.lineTotal)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(order.orderNumber)}</title>
        <style>
          body { font-family: "Plus Jakarta Sans", Arial, sans-serif; margin: 0; color: #3B2F2F; }
          .receipt { width: 80mm; padding: 12px; }
          h1 { color: #0F3B2E; font-size: 18px; margin: 0 0 4px; text-align: center; }
          p { margin: 3px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          td { border-top: 1px dashed #8BC34A; padding: 6px 0; vertical-align: top; font-size: 12px; }
          small { color: #3B2F2F; }
          .center { text-align: center; }
          .right { text-align: right; }
          .total { color: #0F3B2E; font-size: 16px; font-weight: 700; }
          @media print { .receipt { width: 80mm; } }
        </style>
      </head>
      <body>
        <div class="receipt">
          <h1>Zestora POS</h1>
          <p class="center">Thank you for your purchase</p>
          <p>Order: ${escapeHtml(order.orderNumber)}</p>
          <p>Date: ${escapeHtml(dateTime.format(new Date(order.createdAt)))}</p>
          <p>Cashier: ${escapeHtml(order.cashierName)}</p>
          <table>${rows}</table>
          ${receiptLine("Subtotal", order.subtotal)}
          ${receiptLine("Discount", -(order.automaticDiscountTotal + order.manualDiscountTotal))}
          ${receiptLine("Tax", order.taxTotal)}
          ${receiptLine("Grand Total", order.grandTotal, true)}
          <p>Payment: ${escapeHtml(payment?.method ?? "-")}</p>
          ${payment?.method === "CARD" ? `<p>Card: ${escapeHtml(payment.maskedCardNumber ?? "")}</p>` : ""}
          <p class="center">Come again</p>
        </div>
      </body>
    </html>
  `;
}

function receiptLine(label: string, value: number, total = false) {
  return `<p class="${total ? "total" : ""}">${escapeHtml(label)} <span style="float:right">${currency.format(value)}</span></p>`;
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
