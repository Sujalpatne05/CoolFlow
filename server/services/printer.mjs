import net from 'net';

/**
 * Printer Service - Handles KoT and Bill printing for multi-restaurant setup
 * Each restaurant has its own printer IPs configured
 */

export const printerService = {
  /**
   * Print Kitchen Order Ticket (KoT) to kitchen printer
   * @param {Object} order - Order object with details
   * @param {Object} restaurant - Restaurant config with printer IPs
   * @returns {Promise<Object>} - Print result
   */
  printKoT: async (order, restaurant) => {
    try {
      if (!process.env.PRINTER_ENABLED || process.env.PRINTER_ENABLED !== 'true') {
        console.log('Printer disabled - skipping KoT print');
        return { success: true, skipped: true };
      }

      if (!restaurant.kitchen_printer_ip || !restaurant.kitchen_printer_port) {
        throw new Error('Kitchen printer not configured for this restaurant');
      }

      const kotContent = generateKoTContent(order, restaurant);
      await sendToPrinter(
        restaurant.kitchen_printer_ip,
        restaurant.kitchen_printer_port,
        kotContent
      );

      console.log(`✅ KoT printed for restaurant ${restaurant.id}: ${restaurant.name}`);
      return { success: true, printer: 'kitchen', restaurant: restaurant.name };
    } catch (error) {
      console.error(`❌ KoT print failed for ${restaurant.name}:`, error.message);
      return { success: false, error: error.message, restaurant: restaurant.name };
    }
  },

  /**
   * Print Bill/Receipt to counter printer
   * @param {Object} order - Order object
   * @param {Object} payment - Payment details
   * @param {Object} restaurant - Restaurant config
   * @returns {Promise<Object>} - Print result
   */
  printBill: async (order, payment, restaurant) => {
    try {
      if (!process.env.PRINTER_ENABLED || process.env.PRINTER_ENABLED !== 'true') {
        console.log('Printer disabled - skipping Bill print');
        return { success: true, skipped: true };
      }

      if (!restaurant.counter_printer_ip || !restaurant.counter_printer_port) {
        throw new Error('Counter printer not configured for this restaurant');
      }

      const billContent = generateBillContent(order, payment, restaurant);
      await sendToPrinter(
        restaurant.counter_printer_ip,
        restaurant.counter_printer_port,
        billContent
      );

      console.log(`✅ Bill printed for restaurant ${restaurant.id}: ${restaurant.name}`);
      return { success: true, printer: 'counter', restaurant: restaurant.name };
    } catch (error) {
      console.error(`❌ Bill print failed for ${restaurant.name}:`, error.message);
      return { success: false, error: error.message, restaurant: restaurant.name };
    }
  }
};

/**
 * Generate KoT content with restaurant branding
 */
function generateKoTContent(order, restaurant) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN');
  const dateStr = now.toLocaleDateString('en-IN');

  const itemsList = Array.isArray(order.items)
    ? order.items.map(item => `  • ${item}`).join('\n')
    : `  • ${order.items}`;

  return `
╔════════════════════════════════════╗
║  ${restaurant.name.toUpperCase().padEnd(32)}║
║  ${(restaurant.location || '').padEnd(32)}║
╚════════════════════════════════════╝

KITCHEN ORDER TICKET (KoT)
════════════════════════════════════

Order #:         ORD-${order.id}
Date:            ${dateStr}
Time:            ${timeStr}
Table:           ${order.table_number || 'N/A'}
Seats:           ${order.table_capacity || 'N/A'}
Order Type:      ${order.orderType || 'DINE-IN'}

────────────────────────────────────
ITEMS ORDERED:
────────────────────────────────────
${itemsList}

${order.notes ? `────────────────────────────────────
SPECIAL NOTES:
────────────────────────────────────
${order.notes}
` : ''}
────────────────────────────────────
Printed: ${dateStr} ${timeStr}
Restaurant ID: ${restaurant.id}
════════════════════════════════════

`;
}

/**
 * Generate Bill/Receipt content
 */
function generateBillContent(order, payment, restaurant) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN');
  const dateStr = now.toLocaleDateString('en-IN');

  const itemsList = Array.isArray(order.items)
    ? order.items.map(item => `  • ${item}`).join('\n')
    : `  • ${order.items}`;

  const tax = Math.round(order.total * 0.1);
  const subtotal = order.total - tax;

  return `
╔════════════════════════════════════╗
║  ${restaurant.name.toUpperCase().padEnd(32)}║
║  CUSTOMER RECEIPT                  ║
╚════════════════════════════════════╝

Order #:         ORD-${order.id}
Date:            ${dateStr}
Time:            ${timeStr}
Table:           ${order.table_number || 'N/A'}

────────────────────────────────────
ITEMS:
────────────────────────────────────
${itemsList}

────────────────────────────────────
Subtotal:        Rs. ${subtotal}
Tax (10%):       Rs. ${tax}
────────────────────────────────────
TOTAL:           Rs. ${order.total}
────────────────────────────────────

Payment Method:  ${payment.paymentMethod || 'CASH'}
Status:          PAID
Paid Amount:     Rs. ${payment.amount || order.total}

────────────────────────────────────
Thank you for visiting!
${restaurant.name}
════════════════════════════════════

`;
}

/**
 * Send content to thermal printer via TCP
 */
function sendToPrinter(ip, port, content) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { host: ip, port: port },
      () => {
        socket.write(content);
        socket.end();
      }
    );

    socket.on('end', () => {
      resolve({ success: true });
    });

    socket.on('error', (error) => {
      reject(new Error(`Printer connection failed: ${error.message}`));
    });

    // Timeout after 5 seconds
    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error('Printer connection timeout'));
    });
  });
}
