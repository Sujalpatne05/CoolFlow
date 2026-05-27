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

  // Create a hidden iframe for printing
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

  const itemsHTML = items
    .map(
      (item) =>
        `
    <tr>
      <td style="text-align: left; padding: 8px 0;">${item.name}</td>
      <td style="text-align: center; padding: 8px 0;">x${item.qty}</td>
      <td style="text-align: right; padding: 8px 0;">₹${(item.price * item.qty).toFixed(2)}</td>
    </tr>
    ${item.note ? `<tr><td colspan="3" style="text-align: left; padding: 4px 0 8px 0; font-size: 10px; color: #666; font-style: italic;">Note: ${item.note}</td></tr>` : ''}
  `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Bill Receipt - Order #${orderId}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Courier New', monospace;
          background: white;
          padding: 0;
        }
        .receipt {
          max-width: 400px;
          margin: 0 auto;
          border: 2px solid #333;
          padding: 20px;
          background: white;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          border-bottom: 2px solid #333;
          padding-bottom: 10px;
        }
        .restaurant-name {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .order-info {
          font-size: 12px;
          color: #666;
          margin-top: 10px;
        }
        .section {
          margin: 15px 0;
        }
        .section-title {
          font-weight: bold;
          font-size: 12px;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        table {
          width: 100%;
          font-size: 12px;
          margin-bottom: 10px;
        }
        th {
          text-align: left;
          border-bottom: 1px solid #ddd;
          padding: 8px 0;
          font-weight: bold;
        }
        td {
          padding: 6px 0;
        }
        .totals {
          border-top: 2px solid #333;
          border-bottom: 2px solid #333;
          padding: 10px 0;
          margin: 15px 0;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          margin: 5px 0;
          font-size: 12px;
        }
        .total-amount {
          font-size: 16px;
          font-weight: bold;
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
        }
        .footer {
          text-align: center;
          margin-top: 20px;
          font-size: 11px;
          color: #666;
          border-top: 1px solid #ddd;
          padding-top: 10px;
        }
        .thank-you {
          text-align: center;
          font-weight: bold;
          margin-top: 10px;
          font-size: 12px;
        }
        @media print {
          body {
            padding: 0;
            margin: 0;
          }
          .receipt {
            border: none;
            max-width: 100%;
            margin: 0;
            padding: 0;
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
          <div style="font-size: 12px; margin-bottom: 5px;">
            <strong>Type:</strong> ${orderType === "dine-in" ? "Dine-in" : orderType === "take-away" ? "Take-away" : "Delivery"}
          </div>
          ${tableNumber ? `<div style="font-size: 12px; margin-bottom: 5px;"><strong>Table:</strong> ${tableNumber}</div>` : ""}
          ${customerName ? `<div style="font-size: 12px; margin-bottom: 5px;"><strong>Customer:</strong> ${customerName}</div>` : ""}
          ${customerPhone ? `<div style="font-size: 12px; margin-bottom: 5px;"><strong>Phone:</strong> ${customerPhone}</div>` : ""}
        </div>

        <div class="section">
          <div class="section-title">Items</div>
          <table>
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
            <span>₹${subtotal.toFixed(2)}</span>
          </div>
          <div class="total-row">
            <span>Tax:</span>
            <span>₹${tax.toFixed(2)}</span>
          </div>
          ${serviceCharge > 0 ? `<div class="total-row"><span>Service Charge:</span><span>₹${serviceCharge.toFixed(2)}</span></div>` : ""}
          <div class="total-amount">
            <span>TOTAL:</span>
            <span>₹${total.toFixed(2)}</span>
          </div>
        </div>

        ${paymentMethod ? `<div class="section"><div style="font-size: 12px;"><strong>Payment Method:</strong> ${paymentMethod.toUpperCase()}</div></div>` : ""}

        <div class="footer">
          <div class="thank-you">Thank You!</div>
          <div style="margin-top: 10px;">Please visit again</div>
        </div>
      </div>
    </body>
    </html>
  `;

  // Write to iframe
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (iframeDoc) {
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Print after content is loaded
    iframe.onload = () => {
      iframe.contentWindow?.print();
      // Remove iframe after printing
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    };
  }
};
