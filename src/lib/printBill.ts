/**
 * Print Bill Utility
 * Generates and prints a formatted bill receipt
 */

export interface BillItem {
  name: string;
  price: number;
  qty: number;
  note?: string;
}

export interface BillData {
  orderId?: number | string;
  orderType: "dine-in" | "take-away" | "delivery";
  tableNumber?: number;
  items: BillItem[];
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
  paymentMethod?: string;
  customerName?: string;
  customerPhone?: string;
  restaurantName?: string;
  timestamp?: Date;
}

const formatAmount = (amount: number) => (Number(amount) || 0).toFixed(2);

export const printBill = (billData: BillData) => {
  const {
    orderId = "N/A",
    orderType,
    tableNumber,
    items,
    subtotal,
    tax,
    serviceCharge,
    total,
    paymentMethod,
    customerName,
    customerPhone,
    restaurantName = "Logdine",
    timestamp = new Date(),
  } = billData;

  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  document.body.appendChild(iframe);

  const formattedTime = timestamp.toLocaleString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const knownItemsTotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * item.qty, 0);
  const zeroPriceQty = items.reduce((sum, item) => sum + ((Number(item.price) || 0) <= 0 ? item.qty : 0), 0);
  const fallbackUnitPrice = zeroPriceQty > 0 ? Math.max(0, subtotal - knownItemsTotal) / zeroPriceQty : 0;

  const itemsHTML = items
    .map((item) => {
      const unitPrice = (Number(item.price) || 0) > 0 ? Number(item.price) : fallbackUnitPrice;

      return `
        <tr>
          <td class="item-name">${item.name}</td>
          <td class="item-qty">x${item.qty}</td>
          <td class="item-amount">Rs ${formatAmount(unitPrice * item.qty)}</td>
        </tr>
        ${item.note ? `<tr><td colspan="3" class="note">Note: ${item.note}</td></tr>` : ""}
      `;
    })
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Bill</title>
      <style>
        @page {
          size: 72mm auto;
          margin: 0;
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          width: 72mm;
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: white;
          color: #000;
          font-family: "Courier New", monospace;
          font-size: 11px;
        }

        .receipt {
          width: 72mm;
          max-width: 72mm;
          margin: 0;
          padding: 8px 5px;
          overflow: hidden;
          background: white;
        }

        .header {
          text-align: center;
          margin-bottom: 10px;
          border-bottom: 1px dashed #333;
          padding-bottom: 8px;
        }

        .restaurant-name {
          margin-bottom: 5px;
          font-size: 16px;
          font-weight: 700;
          overflow-wrap: anywhere;
        }

        .order-info {
          margin-top: 6px;
          font-size: 11px;
          overflow-wrap: anywhere;
        }

        .section {
          margin: 10px 0;
        }

        .section-title {
          margin-bottom: 8px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .detail-line {
          margin-bottom: 5px;
          font-size: 11px;
          overflow-wrap: anywhere;
        }

        table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          margin-bottom: 10px;
          font-size: 11px;
        }

        .name-col {
          width: 34mm;
        }

        .qty-col {
          width: 10mm;
        }

        .amount-col {
          width: 18mm;
        }

        th {
          border-bottom: 1px solid #ddd;
          padding: 5px 0;
          text-align: left;
          font-weight: 700;
        }

        td {
          padding: 6px 0;
          vertical-align: top;
        }

        .item-name {
          padding-right: 2mm;
          text-align: left;
          overflow-wrap: anywhere;
        }

        .item-qty {
          text-align: center;
          white-space: nowrap;
        }

        .item-amount {
          text-align: right;
          white-space: nowrap;
        }

        .note {
          padding: 0 0 6px;
          text-align: left;
          font-size: 10px;
          font-style: italic;
          overflow-wrap: anywhere;
        }

        .totals {
          border-top: 1px dashed #333;
          border-bottom: 1px dashed #333;
          padding: 8px 0;
          margin: 10px 0;
        }

        .total-row,
        .total-amount {
          display: flex;
          justify-content: space-between;
          gap: 6px;
        }

        .total-row {
          margin: 5px 0;
          font-size: 11px;
        }

        .total-amount {
          margin-top: 10px;
          font-size: 14px;
          font-weight: 700;
        }

        .footer {
          margin-top: 12px;
          border-top: 1px dashed #ddd;
          padding-top: 8px;
          text-align: center;
          font-size: 10px;
        }

        .thank-you {
          font-size: 11px;
          font-weight: 700;
        }

        .powered-by {
          margin-top: 8px;
          font-weight: 700;
        }

        @media print {
          body {
            width: 72mm;
            margin: 0;
            padding: 0;
          }

          .receipt {
            width: 72mm;
            max-width: 72mm;
            margin: 0;
            padding: 8px 5px;
          }
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        <div class="header">
          <div class="restaurant-name">${restaurantName}</div>
          <div class="order-info">
            <div>Order #${orderId}</div>
            <div>${formattedTime}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Order Details</div>
          <div class="detail-line"><strong>Type:</strong> ${orderType === "dine-in" ? "Dine-in" : orderType === "take-away" ? "Take-away" : "Delivery"}</div>
          ${tableNumber ? `<div class="detail-line"><strong>Table:</strong> ${tableNumber}</div>` : ""}
          ${customerName ? `<div class="detail-line"><strong>Customer:</strong> ${customerName}</div>` : ""}
          ${customerPhone ? `<div class="detail-line"><strong>Phone:</strong> ${customerPhone}</div>` : ""}
        </div>

        <div class="section">
          <div class="section-title">Items</div>
          <table>
            <colgroup>
              <col class="name-col">
              <col class="qty-col">
              <col class="amount-col">
            </colgroup>
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>
        </div>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>Rs ${formatAmount(subtotal)}</span>
          </div>
          <div class="total-row">
            <span>Tax:</span>
            <span>Rs ${formatAmount(tax)}</span>
          </div>
          ${serviceCharge > 0 ? `<div class="total-row"><span>Service Charge:</span><span>Rs ${formatAmount(serviceCharge)}</span></div>` : ""}
          <div class="total-amount">
            <span>TOTAL:</span>
            <span>Rs ${formatAmount(total)}</span>
          </div>
        </div>

        ${paymentMethod ? `<div class="section"><div class="detail-line"><strong>Payment Method:</strong> ${paymentMethod.toUpperCase()}</div></div>` : ""}

        <div class="footer">
          <div class="thank-you">Thank You!</div>
          <div class="powered-by">Powered by LogDine Restro</div>
        </div>
      </div>
    </body>
    </html>
  `;

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (iframeDoc) {
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    };
  }
};
