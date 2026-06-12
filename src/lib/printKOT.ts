export interface KOTItem {
  name: string;
  qty: number;
  notes?: string;
}

export interface KOTData {
  kotId?: number | string;
  orderNumber?: string;
  orderType: "dine-in" | "take-away" | "delivery";
  tableNumber?: number;
  items: KOTItem[];
  customerName?: string;
  customerPhone?: string;
  restaurantName?: string;
  timestamp?: Date;
}

export const printKOT = (kotData: KOTData) => {
  const {
    kotId = "NEW",
    orderNumber,
    orderType,
    tableNumber,
    items,
    customerName,
    customerPhone,
    restaurantName = "Logdine",
    timestamp = new Date(),
  } = kotData;

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
      (item, index) => `
        <tr>
          <td class="index">${index + 1}</td>
          <td class="item">
            <div class="item-name">${item.name}</div>
            ${item.notes ? `<div class="note">Note: ${item.notes}</div>` : ""}
          </td>
          <td class="qty">x${item.qty}</td>
        </tr>
      `,
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>KOT ${orderNumber || kotId}</title>
      <style>
        @page {
          size: 80mm auto;
          margin: 0;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #fff;
          color: #000;
          font-family: "Courier New", monospace;
          font-size: 12px;
        }

        .kot {
          width: 80mm;
          padding: 10px 8px;
        }

        .center {
          text-align: center;
        }

        .restaurant {
          font-size: 15px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .title {
          margin-top: 4px;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .line {
          border-top: 1px dashed #000;
          margin: 8px 0;
        }

        .meta {
          display: grid;
          gap: 4px;
          font-size: 12px;
        }

        .meta-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }

        .strong {
          font-weight: 700;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        th {
          border-bottom: 1px solid #000;
          padding: 5px 0;
          text-align: left;
          font-size: 12px;
        }

        td {
          border-bottom: 1px dashed #bbb;
          padding: 7px 0;
          vertical-align: top;
        }

        .index {
          width: 9mm;
          font-weight: 700;
        }

        .item {
          width: auto;
        }

        .item-name {
          font-weight: 700;
          word-break: break-word;
        }

        .qty {
          width: 14mm;
          text-align: right;
          font-size: 15px;
          font-weight: 800;
        }

        .note {
          margin-top: 3px;
          font-size: 11px;
          font-weight: 700;
        }

        .footer {
          margin-top: 10px;
          text-align: center;
          font-size: 11px;
        }

        @media print {
          body {
            width: 80mm;
          }

          .kot {
            width: 80mm;
          }
        }
      </style>
    </head>
    <body>
      <div class="kot">
        <div class="center">
          <div class="restaurant">${restaurantName}</div>
          <div class="title">KOT</div>
        </div>

        <div class="line"></div>

        <div class="meta">
          <div class="meta-row"><span>Order No</span><span class="strong">${orderNumber || `ORD-${kotId}`}</span></div>
          <div class="meta-row"><span>Type</span><span class="strong">${orderType === "dine-in" ? "Dine In" : orderType === "take-away" ? "Take Away" : "Delivery"}</span></div>
          ${tableNumber ? `<div class="meta-row"><span>Table</span><span class="strong">${tableNumber}</span></div>` : ""}
          <div class="meta-row"><span>Time</span><span class="strong">${formattedTime}</span></div>
          ${customerName ? `<div class="meta-row"><span>Customer</span><span class="strong">${customerName}</span></div>` : ""}
          ${customerPhone ? `<div class="meta-row"><span>Phone</span><span class="strong">${customerPhone}</span></div>` : ""}
        </div>

        <div class="line"></div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th style="text-align:right;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="line"></div>
        <div class="footer">Kitchen Copy</div>
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
