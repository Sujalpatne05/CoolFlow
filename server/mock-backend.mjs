import { createServer } from "node:http";
import { URL } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requirePermission, extractUser } from "./middleware/permissions.mjs";
import { printerService } from "./services/printer.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = Number(process.env.PORT || 5000);

let nextMenuId = 7;
let nextOrderId = 1003;
let nextReservationId = 2003;
let nextDeliveryId = 3003;
let nextTransactionId = 4001;
let nextTableId = 5007;

const profile = { id: 1, name: "Demo Admin", role: "admin" };

const menu = [
  { id: 1, name: "Butter Chicken", category: "Main Course", price: 350, available: true, image_url: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=400&q=80" },
  { id: 2, name: "Paneer Tikka", category: "Starters", price: 280, available: true, image_url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80" },
  { id: 3, name: "Garlic Naan", category: "Breads", price: 60, available: true, image_url: "https://images.unsplash.com/photo-1585238341710-4b4e6cefc068?auto=format&fit=crop&w=400&q=80" },
  { id: 4, name: "Jeera Rice", category: "Rice", price: 180, available: true, image_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80" },
  { id: 5, name: "Masala Chai", category: "Beverages", price: 80, available: true, image_url: "https://images.unsplash.com/photo-1597318972826-c0e0c1e8e8c0?auto=format&fit=crop&w=400&q=80" },
  { id: 6, name: "Gulab Jamun", category: "Desserts", price: 120, available: true, image_url: "https://images.unsplash.com/photo-1585518419759-8f0c4e4b7e8c?auto=format&fit=crop&w=400&q=80" },
];

const orders = [
  { id: 1001, user_id: 1, table_number: 2, items: ["Paneer Tikka x1", "Garlic Naan x2"], total: 400, status: "pending", orderType: "dine-in", paymentStatus: "unpaid", paymentMethod: null, created_at: new Date().toISOString() },
  { id: 1002, user_id: 1, table_number: 5, items: ["Butter Chicken x1", "Jeera Rice x1"], total: 530, status: "preparing", orderType: "dine-in", paymentStatus: "unpaid", paymentMethod: null, created_at: new Date().toISOString() },
];

const reservations = [
  {
    id: 2001,
    customer_name: "Aarav Sharma",
    customer_phone: "9876543210",
    reservation_date: "2026-03-07",
    reservation_time: "19:00",
    guests: 4,
    table_number: "T3",
    status: "confirmed",
  },
  {
    id: 2002,
    customer_name: "Maya Nair",
    customer_phone: "9988776655",
    reservation_date: "2026-03-07",
    reservation_time: "20:30",
    guests: 2,
    table_number: "T8",
    status: "pending",
  },
];

const deliveries = [
  {
    id: 3001,
    order_number: "ORD-301",
    customer_name: "Ria Verma",
    phone: "9123456780",
    address: "Sector 45, Noida",
    partner: "in-house",
    amount: 840,
    driver: "Aman",
    status: "assigned",
  },
  {
    id: 3002,
    order_number: "ORD-302",
    customer_name: "Kunal Jain",
    phone: "9012345678",
    address: "Andheri West, Mumbai",
    partner: "swiggy",
    amount: 460,
    driver: "Swiggy Rider",
    status: "in_transit",
  },
];

// API Keys for delivery partners
const deliveryApiKeys = {
  swiggy: "",
  zomato: "",
};

const tables = [
  { id: 5001, table_number: 1, capacity: 2, section: "Main Hall", status: "available", current_order: null, reserved_by: null, estimated_time: null },
  { id: 5002, table_number: 2, capacity: 4, section: "Main Hall", status: "occupied", current_order: "ORD-001", reserved_by: null, estimated_time: "30 min" },
  { id: 5003, table_number: 3, capacity: 4, section: "Main Hall", status: "reserved", current_order: null, reserved_by: "John Doe", estimated_time: "18:00" },
  { id: 5004, table_number: 4, capacity: 6, section: "Outdoor", status: "available", current_order: null, reserved_by: null, estimated_time: null },
  { id: 5005, table_number: 5, capacity: 8, section: "Private Room", status: "occupied", current_order: "ORD-002", reserved_by: null, estimated_time: "45 min" },
  { id: 5006, table_number: 6, capacity: 2, section: "Main Hall", status: "maintenance", current_order: null, reserved_by: null, estimated_time: null },
];

const posTransactions = [];

// Store uploaded images as base64
const uploadedImages = new Map();
let nextImageId = 1;

const crmCustomers = [
  { id: 1, name: "Rahul Sharma", email: "rahul@email.com", phone: "+91 98765 43210", visits: 32, total_spent: 24500, vip: true, last_visit: new Date().toISOString() },
  { id: 2, name: "Priya Singh", email: "priya@email.com", phone: "+91 87654 32109", visits: 18, total_spent: 12800, vip: false, last_visit: new Date(Date.now() - 86400000).toISOString() },
];

const inventory = [
  { id: 1, name: "Chicken", quantity: 25, stock: 25, unit: "kg", min_stock: 10, max_stock: 50, category: "Meat", updated_at: new Date().toISOString() },
  { id: 2, name: "Paneer", quantity: 8, stock: 8, unit: "kg", min_stock: 5, max_stock: 30, category: "Dairy", updated_at: new Date().toISOString() },
  { id: 3, name: "Basmati Rice", quantity: 45, stock: 45, unit: "kg", min_stock: 20, max_stock: 100, category: "Grains", updated_at: new Date().toISOString() },
];

const supportTickets = [
  { id: 1, subject: "Payment gateway issue", restaurant: "Demo Restaurant", status: "open", created_at: new Date().toISOString() },
  { id: 2, subject: "Menu not syncing", restaurant: "Demo Restaurant", status: "in-progress", created_at: new Date(Date.now() - 86400000).toISOString() },
];

const systemSettings = [
  { id: 1, setting_key: "Notifications", description: "Configure email and push notifications", enabled: true },
  { id: 2, setting_key: "Two-Factor Authentication", description: "Extra layer of account security", enabled: false },
  { id: 3, setting_key: "Auto Backups", description: "Daily backups for restaurant data", enabled: true },
];

const subscriptions = [];

const restaurants = [
  { 
    id: 1, 
    name: "Demo Restaurant", 
    owner: "Platform Team", 
    city: "Delhi", 
    status: "Active", 
    plan: "Standard", 
    logo: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23FF6B35' width='100' height='100'/%3E%3Ctext x='50' y='50' font-size='40' fill='white' text-anchor='middle' dy='.3em'%3E🍽️%3C/text%3E%3C/svg%3E", 
    created_at: new Date().toISOString(),
    kitchen_printer_ip: "192.168.1.100",
    kitchen_printer_port: 9100,
    counter_printer_ip: "192.168.1.101",
    counter_printer_port: 9100,
    tax_rate: 5.00,
    service_charge: 0.00
  },
];

// Load users from JSON file
let users = [];
const usersFilePath = join(__dirname, "data", "users.json");
const restaurantsFilePath = join(__dirname, "data", "restaurants.json");

try {
  if (existsSync(usersFilePath)) {
    const usersData = readFileSync(usersFilePath, "utf-8");
    users = JSON.parse(usersData);
    console.log(`[INIT] Loaded ${users.length} users from users.json`);
  } else {
    console.log("[INIT] users.json not found, using default users");
    users = [
      { id: 1, name: "Super Admin", email: "superadmin@logdine.local", password: "super123", role: "superadmin", restaurant_id: null, restaurant_name: null, is_active: true },
      { id: 2, name: "Admin User", email: "admin@example.com", password: "admin123", role: "admin", restaurant_id: 1, restaurant_name: "Demo Restaurant", is_active: true },
      { id: 3, name: "Manager User", email: "manager@example.com", password: "manager123", role: "manager", restaurant_id: 1, restaurant_name: "Demo Restaurant", is_active: true },
      { id: 4, name: "Staff User", email: "staff@example.com", password: "staff123", role: "staff", restaurant_id: 1, restaurant_name: "Demo Restaurant", is_active: true },
    ];
  }
} catch (err) {
  console.error("[INIT] Error loading users.json:", err.message);
  users = [
    { id: 1, name: "Super Admin", email: "superadmin@logdine.local", password: "super123", role: "superadmin", restaurant_id: null, restaurant_name: null, is_active: true },
    { id: 2, name: "Admin User", email: "admin@example.com", password: "admin123", role: "admin", restaurant_id: 1, restaurant_name: "Demo Restaurant", is_active: true },
  ];
}

let nextUserId = 3;

const payrollStaff = [
  { id: 1, name: "Amit Kumar", role: "Waiter", present: true, leaves: 2, salary: 15000 },
  { id: 2, name: "Priya Singh", role: "Chef", present: false, leaves: 1, salary: 22000 },
  { id: 3, name: "Rahul Verma", role: "Manager", present: true, leaves: 0, salary: 30000 },
];

const tasks = [
  { id: 1, title: "Check inventory", assigned_to: "Amit Kumar", status: "Pending" },
  { id: 2, title: "Clean kitchen", assigned_to: "Priya Singh", status: "In Progress" },
  { id: 3, title: "Update menu", assigned_to: "Rahul Verma", status: "Completed" },
];

const send = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(payload));
};

const notFound = (res) => send(res, 404, { error: "Not found" });

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });

// Save users to JSON file
function saveUsers() {
  try {
    writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    console.log("[PERSIST] ✅ Users saved to users.json");
  } catch (err) {
    console.error("[PERSIST] ❌ Error saving users.json:", err.message);
  }
}

// Initialize subscriptions for existing restaurants on server start
function initializeSubscriptions() {
  subscriptions.length = 0; // Clear existing subscriptions
  
  restaurants.forEach(restaurant => {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    // Calculate exactly 1 year from today
    const nextYear = year + 1;
    const oneYearFromNowStr = `${nextYear}-${month}-${day}`;
    
    console.log(`[INIT] Restaurant: ${restaurant.name}, Today: ${todayStr}, OneYearFromNow: ${oneYearFromNowStr}`);
    
    subscriptions.push({
      id: subscriptions.length + 1,
      restaurant_id: restaurant.id,
      restaurant_name: restaurant.name,
      name: restaurant.name,
      owner: restaurant.owner,
      plan: restaurant.plan,
      status: "Active",
      expiry_date: oneYearFromNowStr,
      expiry: oneYearFromNowStr,
      created_at: todayStr,
      subscription_date: todayStr,
      start_date: todayStr,
      mrr: restaurant.plan === "Premium" ? "₹5,000" : "₹2,500",
      overdue_days: 0,
    });
  });
}

// Initialize subscriptions on startup
initializeSubscriptions();

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    send(res, 400, { error: "Invalid request" });
    return;
  }

  if (req.method === "OPTIONS") {
    send(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (req.method === "GET" && path === "/health") {
      send(res, 200, { ok: true, service: "mock-backend" });
      return;
    }

    if (req.method === "GET" && path === "/debug/users") {
      send(res, 200, { 
        users: users.map(u => ({ 
          id: u.id, 
          name: u.name, 
          email: u.email, 
          role: u.role, 
          restaurant_id: u.restaurant_id,
          restaurant_name: u.restaurant_name 
        })) 
      });
      return;
    }

    if (req.method === "POST" && path === "/auth/login") {
      const body = await parseBody(req);
      const email = String(body.email || body.username || "").toLowerCase().trim();
      const password = String(body.password || "").trim();
      const role = body.role ? String(body.role).toLowerCase() : null;

      console.log(`[LOGIN] Attempting login with email: ${email}, password: ${password}, role: ${role}`);
      console.log(`[LOGIN] Available users:`, users.map(u => ({ email: u.email, password: u.password, role: u.role })));

      // Check users array for matching credentials
      // If role is specified, match it; otherwise accept any role
      let user;
      if (role) {
        user = users.find(u => u.email.toLowerCase() === email && u.password === password && u.role === role);
      } else {
        user = users.find(u => u.email.toLowerCase() === email && u.password === password);
      }
      
      if (user) {
        console.log(`[LOGIN] ✅ Login successful for user: ${user.email}`);
        const restaurantId = user.restaurant_id || 0;
        const token = `token_${user.role}_${restaurantId}_${Date.now()}`;
        send(res, 200, {
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            restaurantId: user.restaurant_id,
            restaurantName: user.restaurant_name,
            mustChangePassword: false,
          },
        });
        return;
      }

      console.log(`[LOGIN] ❌ Login failed - invalid credentials`);
      send(res, 401, { error: "Invalid credentials" });
      return;
    }

    if (req.method === "GET" && path === "/profile") {
      // Extract user email from token or session
      // For now, we'll return the restaurant based on the Authorization header
      // In a real app, this would decode the JWT token
      const authHeader = req.headers.authorization || "";
      
      // Find the user's restaurant - for demo, we'll check all users and return their restaurant
      // Get the first admin user's restaurant (this is a simplified approach)
      let userRestaurant = null;
      let restaurantId = 1;
      
      // Try to find a restaurant that matches the logged-in user
      // For now, return the most recently created restaurant (highest ID)
      if (restaurants.length > 0) {
        const maxRestaurant = restaurants.reduce((max, r) => r.id > max.id ? r : max);
        userRestaurant = maxRestaurant;
        restaurantId = maxRestaurant.id;
      } else {
        userRestaurant = restaurants.find(r => r.id === 1);
      }
      
      send(res, 200, {
        ...profile,
        restaurantId: restaurantId,
        restaurantName: userRestaurant?.name || "Demo Restaurant",
        restaurantLogo: userRestaurant?.logo || null,
      });
      return;
    }

    if (req.method === "GET" && path === "/menu") {
      send(res, 200, menu);
      return;
    }

    if (req.method === "POST" && path === "/menu/image") {
      // Handle JSON with base64 image data
      const body = await parseBody(req);
      
      if (body.image && typeof body.image === "string") {
        // Store the base64 image and return it
        const imageId = nextImageId++;
        uploadedImages.set(imageId, body.image);
        send(res, 200, { url: body.image });
      } else {
        // Fallback to placeholder images
        const placeholderImages = [
          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80",
          "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80",
          "https://images.unsplash.com/photo-1585238341710-4b4e6cefc068?auto=format&fit=crop&w=400&q=80",
        ];
        const randomImage = placeholderImages[Math.floor(Math.random() * placeholderImages.length)];
        send(res, 200, { url: randomImage });
      }
      return;
    }

    if (req.method === "POST" && path === "/menu") {
      const body = await parseBody(req);
      if (!body.name || Number(body.price) <= 0) {
        send(res, 400, { error: "Invalid menu payload" });
        return;
      }
      const item = {
        id: nextMenuId++,
        name: String(body.name).trim(),
        category: String(body.category || "Beverages"),
        price: Number(body.price),
        available: body.available !== false,
        image_url: String(body.image_url || ""),
      };
      menu.push(item);
      send(res, 201, item);
      return;
    }

    if (req.method === "PUT" && path.startsWith("/menu/")) {
      const id = Number(path.split("/").pop());
      const item = menu.find((m) => m.id === id);
      if (!item) {
        notFound(res);
        return;
      }
      const body = await parseBody(req);
      if (body.name !== undefined) item.name = String(body.name).trim();
      if (body.category !== undefined) item.category = String(body.category);
      if (body.price !== undefined) item.price = Number(body.price);
      if (body.available !== undefined) item.available = Boolean(body.available);
      if (body.image_url !== undefined) item.image_url = String(body.image_url || "");
      send(res, 200, item);
      return;
    }

    if (req.method === "DELETE" && path.startsWith("/menu/")) {
      const id = Number(path.split("/").pop());
      const idx = menu.findIndex((m) => m.id === id);
      if (idx < 0) {
        notFound(res);
        return;
      }
      menu.splice(idx, 1);
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && path === "/orders") {
      // Check permission
      const permCheck = requirePermission("orders", "GET")(req);
      if (!permCheck.allowed) {
        send(res, 403, { error: permCheck.reason });
        return;
      }

      // Filter orders by restaurant_id if not superadmin
      const user = extractUser(req);
      let filteredOrders = orders;
      if (user && user.role !== "superadmin" && user.restaurant_id) {
        // For now, return all orders (in production, filter by restaurant_id)
        // This is a mock backend, so we don't have restaurant_id on orders yet
      }

      // Add table section to each order
      const ordersWithSection = filteredOrders.map(order => {
        const table = tables.find(t => t.table_number === order.table_number);
        return {
          ...order,
          tableSection: table ? table.section : 'Main Hall',
        };
      });

      send(res, 200, ordersWithSection);
      return;
    }

    // Get order by table number
    if (req.method === "GET" && path.startsWith("/orders/table/")) {
      const tableNum = Number(path.split("/").pop());
      const order = orders.find(o => o.table_number === tableNum && o.status !== "completed" && o.status !== "served");
      if (order) {
        send(res, 200, order);
      } else {
        send(res, 404, { error: "No active order for this table" });
      }
      return;
    }

    if (req.method === "POST" && path === "/orders") {
      const body = await parseBody(req);
      if (!Array.isArray(body.items) || body.items.length === 0 || Number(body.total) <= 0) {
        send(res, 400, { error: "Invalid order payload" });
        return;
      }
      const order = {
        id: nextOrderId++,
        user_id: Number(body.userId || 1),
        table_number: body.table_number ? Number(body.table_number) : null,
        items: body.items.map((item) => String(item)),
        total: Number(body.total),
        status: "pending",
        orderType: String(body.orderType || "dine-in"),
        paymentStatus: (String(body.orderType || "dine-in") === "delivery" || String(body.orderType) === "take-away") ? "paid" : "unpaid",
        paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
        notes: body.notes ? String(body.notes) : "",
        created_at: new Date().toISOString(),
      };
      orders.unshift(order);
      
      // Print KoT if printer is enabled and order is dine-in
      if ((order.orderType === "dine-in" || !order.orderType) && process.env.PRINTER_ENABLED === 'true') {
        try {
          const restaurant = restaurants.find(r => r.id === 1); // For mock, use first restaurant
          if (restaurant) {
            const printResult = await printerService.printKoT(
              {
                id: order.id,
                table_number: order.table_number,
                table_capacity: 4,
                items: order.items,
                notes: order.notes,
                orderType: order.orderType
              },
              restaurant
            );
            console.log('[MOCK] KoT Print Result:', printResult);
          }
        } catch (printError) {
          console.error('[MOCK] KoT printing error (non-blocking):', printError.message);
        }
      }
      
      send(res, 201, order);
      return;
    }

    // Update existing order (add items)
    if (req.method === "PUT" && path.startsWith("/orders/")) {
      const orderId = Number(path.split("/").pop());
      const order = orders.find(o => o.id === orderId);
      if (!order) {
        send(res, 404, { error: "Order not found" });
        return;
      }
      const body = await parseBody(req);
      if (body.items) {
        order.items = body.items.map((item) => String(item));
      }
      if (body.total !== undefined) {
        order.total = Number(body.total);
      }
      if (body.status) {
        order.status = String(body.status);
      }
      if (body.paymentStatus) {
        order.paymentStatus = String(body.paymentStatus);
        
        // Print Bill when payment is marked as paid
        if (body.paymentStatus === "paid" && process.env.PRINTER_ENABLED === 'true') {
          try {
            const restaurant = restaurants.find(r => r.id === 1); // For mock, use first restaurant
            if (restaurant) {
              const printResult = await printerService.printBill(
                {
                  id: order.id,
                  table_number: order.table_number,
                  items: order.items,
                  total: order.total
                },
                {
                  paymentMethod: body.paymentMethod || order.paymentMethod,
                  amount: body.total || order.total
                },
                restaurant
              );
              console.log('[MOCK] Bill Print Result:', printResult);
            }
          } catch (printError) {
            console.error('[MOCK] Bill printing error (non-blocking):', printError.message);
          }
        }
      }
      if (body.paymentMethod) {
        order.paymentMethod = String(body.paymentMethod);
      }
      send(res, 200, order);
      return;
    }

    if (req.method === "GET" && path === "/reservations") {
      send(res, 200, reservations);
      return;
    }

    if (req.method === "POST" && path === "/reservations") {
      const body = await parseBody(req);
      if (!body.customer_name || !body.customer_phone || !body.reservation_date || !body.reservation_time) {
        send(res, 400, { error: "Invalid reservation payload" });
        return;
      }
      const reservation = {
        id: nextReservationId++,
        customer_name: String(body.customer_name).trim(),
        customer_phone: String(body.customer_phone).trim(),
        reservation_date: String(body.reservation_date),
        reservation_time: String(body.reservation_time),
        guests: Number(body.guests || 1),
        table_number: String(body.table_number || "T1"),
        status: String(body.status || "pending"),
      };
      reservations.unshift(reservation);
      send(res, 201, reservation);
      return;
    }

    if (req.method === "PATCH" && path.startsWith("/reservations/") && path.endsWith("/status")) {
      const id = Number(path.split("/")[2]);
      const body = await parseBody(req);
      const reservation = reservations.find((item) => item.id === id);
      if (!reservation) {
        notFound(res);
        return;
      }
      reservation.status = String(body.status || reservation.status);
      send(res, 200, reservation);
      return;
    }

    if (req.method === "PUT" && path.match(/^\/reservations\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const reservation = reservations.find(r => r.id === id);
      if (!reservation) { notFound(res); return; }
      if (body.customer_name) reservation.customer_name = String(body.customer_name).trim();
      if (body.customer_phone) reservation.customer_phone = String(body.customer_phone).trim();
      if (body.reservation_date) reservation.reservation_date = String(body.reservation_date);
      if (body.reservation_time) reservation.reservation_time = String(body.reservation_time);
      if (body.guests !== undefined) reservation.guests = Number(body.guests);
      if (body.table_number) reservation.table_number = String(body.table_number);
      if (body.status) reservation.status = String(body.status);
      send(res, 200, reservation);
      return;
    }

    if (req.method === "DELETE" && path.match(/^\/reservations\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const idx = reservations.findIndex(r => r.id === id);
      if (idx === -1) { notFound(res); return; }
      reservations.splice(idx, 1);
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && path === "/deliveries") {
      send(res, 200, deliveries);
      return;
    }

    if (req.method === "GET" && path === "/tables") {
      send(res, 200, tables);
      return;
    }

    if (req.method === "POST" && path === "/tables") {
      const body = await parseBody(req);
      if (!body.table_number || !body.capacity || !body.section) {
        send(res, 400, { error: "Invalid table payload" });
        return;
      }
      const table = {
        id: nextTableId++,
        table_number: Number(body.table_number),
        capacity: Number(body.capacity),
        section: String(body.section),
        status: "available",
        current_order: null,
        reserved_by: null,
        estimated_time: null,
      };
      tables.push(table);
      send(res, 201, table);
      return;
    }

    if (req.method === "PATCH" && path.startsWith("/tables/") && path.endsWith("/status")) {
      const id = Number(path.split("/")[2]);
      const body = await parseBody(req);
      const table = tables.find((item) => item.id === id);
      if (!table) {
        notFound(res);
        return;
      }
      table.status = String(body.status || table.status);
      send(res, 200, table);
      return;
    }

    if (req.method === "PUT" && path.startsWith("/tables/")) {
      const id = Number(path.split("/")[2]);
      const body = await parseBody(req);
      const table = tables.find((item) => item.id === id);
      if (!table) {
        notFound(res);
        return;
      }
      if (body.status) table.status = String(body.status);
      if (body.current_order !== undefined) table.current_order = body.current_order;
      if (body.reserved_by !== undefined) table.reserved_by = body.reserved_by;
      if (body.estimated_time !== undefined) table.estimated_time = body.estimated_time;
      send(res, 200, table);
      return;
    }

    if (req.method === "DELETE" && path.startsWith("/tables/")) {
      const id = Number(path.split("/")[2]);
      const idx = tables.findIndex((item) => item.id === id);
      if (idx < 0) {
        notFound(res);
        return;
      }
      tables.splice(idx, 1);
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "POST" && path === "/deliveries") {
      const body = await parseBody(req);
      if (!body.order_number || !body.customer_name || !body.address) {
        send(res, 400, { error: "Invalid delivery payload" });
        return;
      }
      const delivery = {
        id: nextDeliveryId++,
        order_number: String(body.order_number).trim().toUpperCase(),
        customer_name: String(body.customer_name).trim(),
        phone: String(body.phone || ""),
        address: String(body.address).trim(),
        partner: String(body.partner || "in-house"),
        amount: Number(body.amount || 0),
        driver: String(body.driver || "Unassigned"),
        status: String(body.status || "pending"),
      };
      deliveries.unshift(delivery);
      send(res, 201, delivery);
      return;
    }

    if (req.method === "PATCH" && path.startsWith("/deliveries/") && path.endsWith("/status")) {
      const id = Number(path.split("/")[2]);
      const body = await parseBody(req);
      const delivery = deliveries.find((item) => item.id === id);
      if (!delivery) {
        notFound(res);
        return;
      }
      delivery.status = String(body.status || delivery.status);
      send(res, 200, delivery);
      return;
    }

    if (req.method === "PUT" && path.startsWith("/deliveries/")) {
      const id = Number(path.split("/")[2]);
      const body = await parseBody(req);
      const delivery = deliveries.find((item) => item.id === id);
      if (!delivery) {
        notFound(res);
        return;
      }
      if (body.order_number) delivery.order_number = String(body.order_number).trim().toUpperCase();
      if (body.customer_name) delivery.customer_name = String(body.customer_name).trim();
      if (body.phone) delivery.phone = String(body.phone);
      if (body.address) delivery.address = String(body.address).trim();
      if (body.partner) delivery.partner = String(body.partner);
      if (body.amount !== undefined) delivery.amount = Number(body.amount);
      if (body.driver) delivery.driver = String(body.driver);
      if (body.status) delivery.status = String(body.status);
      send(res, 200, delivery);
      return;
    }

    if (req.method === "DELETE" && path.startsWith("/deliveries/")) {
      const id = Number(path.split("/")[2]);
      const idx = deliveries.findIndex((item) => item.id === id);
      if (idx < 0) {
        notFound(res);
        return;
      }
      deliveries.splice(idx, 1);
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && path === "/delivery-api-keys") {
      send(res, 200, deliveryApiKeys);
      return;
    }

    if (req.method === "PUT" && path === "/delivery-api-keys") {
      const body = await parseBody(req);
      if (body.swiggy !== undefined) deliveryApiKeys.swiggy = String(body.swiggy).trim();
      if (body.zomato !== undefined) deliveryApiKeys.zomato = String(body.zomato).trim();
      send(res, 200, deliveryApiKeys);
      return;
    }

    if (req.method === "GET" && path === "/crm/customers") {
      send(res, 200, crmCustomers);
      return;
    }

    if (req.method === "POST" && path === "/crm/customers") {
      const body = await parseBody(req);
      if (!body.name || !body.email || !body.phone) {
        send(res, 400, { error: "Invalid customer payload" });
        return;
      }
      const customer = {
        id: Math.max(...crmCustomers.map(c => c.id), 0) + 1,
        name: String(body.name).trim(),
        email: String(body.email).trim(),
        phone: String(body.phone).trim(),
        visits: Number(body.visits || 1),
        total_spent: Number(body.totalSpent || body.total_spent || 0),
        vip: Boolean(body.vip),
        last_visit: new Date().toISOString(),
      };
      crmCustomers.push(customer);
      send(res, 201, customer);
      return;
    }

    if (req.method === "PATCH" && path.match(/^\/crm\/customers\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const idx = crmCustomers.findIndex(c => c.id === id);
      if (idx === -1) { notFound(res); return; }
      if (body.name !== undefined) crmCustomers[idx].name = String(body.name).trim();
      if (body.email !== undefined) crmCustomers[idx].email = String(body.email).trim();
      if (body.phone !== undefined) crmCustomers[idx].phone = String(body.phone).trim();
      if (body.visits !== undefined) crmCustomers[idx].visits = Number(body.visits);
      if (body.totalSpent !== undefined) crmCustomers[idx].total_spent = Number(body.totalSpent);
      if (body.total_spent !== undefined) crmCustomers[idx].total_spent = Number(body.total_spent);
      if (body.vip !== undefined) crmCustomers[idx].vip = Boolean(body.vip);
      send(res, 200, crmCustomers[idx]);
      return;
    }

    if (req.method === "DELETE" && path.match(/^\/crm\/customers\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const idx = crmCustomers.findIndex(c => c.id === id);
      if (idx === -1) { notFound(res); return; }
      crmCustomers.splice(idx, 1);
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && path === "/inventory") {
      // Normalize inventory items to include both 'stock' and 'quantity' for compatibility
      const normalizedInventory = inventory.map(item => ({
        ...item,
        stock: item.stock || item.quantity || 0,
        updated_at: item.updated_at || new Date().toISOString()
      }));
      send(res, 200, normalizedInventory);
      return;
    }

    if (req.method === "POST" && path === "/inventory") {
      const body = await parseBody(req);
      const quantity = Number(body.quantity || body.stock || 0);
      if (!body.name || quantity < 0) {
        send(res, 400, { error: "Invalid inventory payload" });
        return;
      }
      const item = {
        id: Math.max(...inventory.map(i => i.id), 0) + 1,
        name: String(body.name).trim(),
        quantity: quantity,
        stock: quantity,
        unit: String(body.unit || "kg"),
        min_stock: Number(body.min_stock || 0),
        max_stock: Number(body.max_stock || 0),
        category: String(body.category || "General"),
        updated_at: new Date().toISOString(),
      };
      inventory.push(item);
      send(res, 201, item);
      return;
    }

    if (req.method === "PATCH" && /^\/inventory\/\d+$/.test(path)) {
      const id = Number(path.split("/")[2]);
      const body = await parseBody(req);
      const item = inventory.find(i => i.id === id);
      if (!item) {
        send(res, 404, { error: "Inventory item not found" });
        return;
      }
      if (body.quantity !== undefined) {
        item.quantity = Number(body.quantity);
        item.stock = Number(body.quantity);
      }
      if (body.stock !== undefined) {
        item.quantity = Number(body.stock);
        item.stock = Number(body.stock);
      }
      if (body.name !== undefined) item.name = String(body.name);
      if (body.unit !== undefined) item.unit = String(body.unit);
      if (body.min_stock !== undefined) item.min_stock = Number(body.min_stock);
      if (body.max_stock !== undefined) item.max_stock = Number(body.max_stock);
      if (body.category !== undefined) item.category = String(body.category);
      item.updated_at = new Date().toISOString();
      send(res, 200, item);
      return;
    }

    if (req.method === "DELETE" && /^\/inventory\/\d+$/.test(path)) {
      const id = Number(path.split("/")[2]);
      const idx = inventory.findIndex(i => i.id === id);
      if (idx === -1) { notFound(res); return; }
      inventory.splice(idx, 1);
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && path === "/superadmin/support") {
      send(res, 200, supportTickets);
      return;
    }

    if (req.method === "POST" && path === "/superadmin/support") {
      const body = await parseBody(req);
      if (!body.subject) {
        send(res, 400, { error: "Invalid ticket payload" });
        return;
      }
      const ticket = {
        id: Math.max(...supportTickets.map(t => t.id), 0) + 1,
        subject: String(body.subject).trim(),
        restaurant: String(body.restaurant || ""),
        status: String(body.status || "open"),
        created_at: new Date().toISOString(),
      };
      supportTickets.push(ticket);
      send(res, 201, ticket);
      return;
    }

    // PATCH /superadmin/support/:id - Update support ticket
    if (req.method === "PATCH" && path.match(/^\/superadmin\/support\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const index = supportTickets.findIndex(t => t.id === id);
      
      if (index === -1) {
        send(res, 404, { error: "Ticket not found" });
        return;
      }
      
      if (body.subject) supportTickets[index].subject = String(body.subject).trim();
      if (body.restaurant) supportTickets[index].restaurant = String(body.restaurant).trim();
      if (body.status) supportTickets[index].status = String(body.status);
      
      console.log(`[SUPPORT] ✅ Updated ticket ${id}`);
      send(res, 200, supportTickets[index]);
      return;
    }

    // DELETE /superadmin/support/:id - Delete support ticket
    if (req.method === "DELETE" && path.match(/^\/superadmin\/support\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const index = supportTickets.findIndex(t => t.id === id);
      
      if (index === -1) {
        send(res, 404, { error: "Ticket not found" });
        return;
      }
      
      supportTickets.splice(index, 1);
      console.log(`[SUPPORT] ✅ Deleted ticket ${id}`);
      send(res, 200, { success: true, message: "Ticket deleted" });
      return;
    }

    if (req.method === "GET" && path === "/superadmin/settings") {
      send(res, 200, systemSettings);
      return;
    }

    // PATCH /superadmin/settings/:id - Toggle system setting
    if (req.method === "PATCH" && path.match(/^\/superadmin\/settings\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const index = systemSettings.findIndex(s => s.id === id);
      
      if (index === -1) {
        send(res, 404, { error: "Setting not found" });
        return;
      }
      
      if (body.enabled !== undefined) {
        systemSettings[index].enabled = Boolean(body.enabled);
      }
      
      console.log(`[SETTINGS] ✅ Updated setting ${id}: enabled=${systemSettings[index].enabled}`);
      send(res, 200, systemSettings[index]);
      return;
    }

    if (req.method === "GET" && path === "/superadmin/restaurants") {
      send(res, 200, restaurants);
      return;
    }

    if (req.method === "POST" && path === "/superadmin/restaurants") {
      // Check if user is superadmin
      const user = extractUser(req);
      if (!user || user.role !== "superadmin") {
        console.log("[RESTAURANT] ❌ Unauthorized - User is not superadmin");
        send(res, 403, { error: "Only superadmin can create restaurants" });
        return;
      }
      
      const body = await parseBody(req);
      console.log("[RESTAURANT] POST request received. Body:", JSON.stringify(body, null, 2));
      
      if (!body.name || !body.owner) {
        console.log("[RESTAURANT] ❌ Validation failed - Missing name or owner");
        console.log("[RESTAURANT] Received body:", { name: body.name, owner: body.owner });
        send(res, 400, { error: "Invalid restaurant payload - name and owner are required" });
        return;
      }
      const restaurant = {
        id: Math.max(...restaurants.map(r => r.id), 0) + 1,
        name: String(body.name).trim(),
        owner: String(body.owner).trim(),
        city: String(body.city || ""),
        status: String(body.status || "Active"),
        plan: String(body.plan || "Standard"),
        logo: body.logo || null,
        created_at: new Date().toISOString(),
      };
      restaurants.push(restaurant);
      
      // Don't create admin here - let frontend handle it via /superadmin/users endpoint
      // This allows the frontend to create multiple admins if needed
      
      console.log(`[RESTAURANT] ✅ Created restaurant: ${restaurant.name} (ID: ${restaurant.id})`);
      
      // Also create a subscription for the new restaurant
      const subscriptionStartDate = body.subscriptionStartDate || new Date().toISOString().split('T')[0];
      let subscriptionExpiryDate = body.subscriptionExpiryDate;
      
      console.log(`[SUBSCRIPTION] Received from form - Start: ${body.subscriptionStartDate}, Expiry: ${body.subscriptionExpiryDate}`);
      
      // If no expiry date provided, calculate 1 year from start date
      if (!subscriptionExpiryDate) {
        // Parse the start date string (YYYY-MM-DD) safely
        const [year, month, day] = subscriptionStartDate.split('-').map(Number);
        // Create expiry date by adding 1 year to the date components
        const expiryYear = year + 1;
        const expiryMonth = String(month).padStart(2, '0');
        const expiryDay = String(day).padStart(2, '0');
        subscriptionExpiryDate = `${expiryYear}-${expiryMonth}-${expiryDay}`;
      }
      
      console.log(`[SUBSCRIPTION] Final - Start Date: ${subscriptionStartDate}, Expiry Date: ${subscriptionExpiryDate}`);
      
      const subscription = {
        id: Math.max(...subscriptions.map(s => s.id), 0) + 1,
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        name: restaurant.name,
        owner: restaurant.owner,
        plan: restaurant.plan,
        status: "Active",
        expiry_date: subscriptionExpiryDate,
        expiry: subscriptionExpiryDate,
        created_at: subscriptionStartDate,
        subscription_date: subscriptionStartDate,
        start_date: subscriptionStartDate,
        mrr: restaurant.plan === "Premium" ? "₹5,000" : "₹2,500",
        overdue_days: 0,
      };
      subscriptions.push(subscription);
      
      console.log(`[SUBSCRIPTION] ✅ Created subscription for ${restaurant.name}: Start: ${subscriptionStartDate}, Expiry: ${subscriptionExpiryDate}`);
      
      send(res, 201, {
        ...restaurant,
        admin_created: false,
      });
      return;
    }

    if (req.method === "PUT" && path.startsWith("/superadmin/restaurants/")) {
      const parts = path.split("/");
      const id = parseInt(parts[parts.length - 1]);
      
      if (isNaN(id)) {
        send(res, 400, { error: "Invalid restaurant ID" });
        return;
      }
      
      const body = await parseBody(req);
      const restaurant = restaurants.find(r => r.id === id);
      
      if (!restaurant) {
        send(res, 404, { error: "Restaurant not found" });
        return;
      }
      
      if (body.name) restaurant.name = String(body.name).trim();
      if (body.owner) restaurant.owner = String(body.owner).trim();
      if (body.city !== undefined) restaurant.city = String(body.city || "");
      if (body.status) restaurant.status = String(body.status);
      if (body.plan) restaurant.plan = String(body.plan);
      if (body.logo !== undefined) restaurant.logo = body.logo || null;
      
      send(res, 200, restaurant);
      return;
    }

    if (req.method === "DELETE" && path.startsWith("/superadmin/restaurants/")) {
      const parts = path.split("/");
      const id = parseInt(parts[parts.length - 1]);
      
      if (isNaN(id)) {
        send(res, 400, { error: "Invalid restaurant ID" });
        return;
      }
      
      const index = restaurants.findIndex(r => r.id === id);
      if (index === -1) {
        send(res, 404, { error: "Restaurant not found" });
        return;
      }
      
      restaurants.splice(index, 1);
      send(res, 200, { success: true, message: "Restaurant deleted" });
      return;
    }

    if (req.method === "GET" && path === "/superadmin/subscriptions") {
      send(res, 200, subscriptions);
      return;
    }

    if (req.method === "PATCH" && path.startsWith("/superadmin/subscriptions/")) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const subscription = subscriptions.find(s => s.id === id);
      
      if (!subscription) {
        send(res, 404, { error: "Subscription not found" });
        return;
      }
      
      if (body.status) subscription.status = String(body.status);
      if (body.expiry) {
        subscription.expiry = String(body.expiry);
        subscription.expiry_date = String(body.expiry);
      }
      if (body.expiry_date) {
        subscription.expiry_date = String(body.expiry_date);
        subscription.expiry = String(body.expiry_date);
      }
      
      console.log(`[SUBSCRIPTION] ✅ Updated subscription ${id}: Status: ${subscription.status}, Expiry: ${subscription.expiry}`);
      send(res, 200, subscription);
      return;
    }

    if (req.method === "GET" && path === "/superadmin/users") {
      send(res, 200, users.map(u => ({ id: u.id, name: u.name, email: u.email, password: u.password, role: u.role, restaurant_name: u.restaurant_name, is_active: u.is_active, must_change_password: u.must_change_password })));
      return;
    }

    if (req.method === "POST" && path === "/superadmin/users") {
      const body = await parseBody(req);
      
      // Better validation with specific error messages
      if (!body.email || String(body.email).trim().length === 0) {
        send(res, 400, { error: "Email is required" });
        return;
      }
      if (!body.name || String(body.name).trim().length === 0) {
        send(res, 400, { error: "Name is required" });
        return;
      }
      if (!body.role || String(body.role).trim().length === 0) {
        send(res, 400, { error: "Role is required" });
        return;
      }

      const email = String(body.email || "").toLowerCase().trim();
      const password = String(body.temporaryPassword || `temp${Date.now()}`).trim();
      const name = String(body.name).trim();
      const role = String(body.role).toLowerCase();
      const restaurantId = body.restaurantId ? Number(body.restaurantId) : null;
      const restaurantName = String(body.restaurantName || "").trim();

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        send(res, 400, { error: "Invalid email format" });
        return;
      }

      // Check if user already exists
      if (users.find(u => u.email.toLowerCase() === email)) {
        send(res, 400, { error: "User with this email already exists" });
        return;
      }

      const newUser = {
        id: nextUserId++,
        name: name,
        email: email,
        password: password,
        role: role,
        restaurant_id: restaurantId,
        restaurant_name: restaurantName,
        is_active: true,
      };

      users.push(newUser);
      saveUsers(); // Persist the new user to JSON
      console.log(`[USER] ✅ Created user: ${email} (${role})`);

      send(res, 201, {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        restaurant_id: newUser.restaurant_id,
        restaurant_name: newUser.restaurant_name,
      });
      return;
    }

    // PATCH /superadmin/users/:id - Toggle user active status
    if (req.method === "PATCH" && path.match(/^\/superadmin\/users\/\d+$/)) {
      const userId = Number(path.split("/").pop());
      const body = await parseBody(req);
      const userIndex = users.findIndex(u => u.id === userId);
      
      if (userIndex === -1) {
        send(res, 404, { error: "User not found" });
        return;
      }

      // Update user status
      if (body.isActive !== undefined) {
        users[userIndex].is_active = Boolean(body.isActive);
      }

      saveUsers(); // Persist the updated user to JSON
      console.log(`[USER] ✅ Updated user ${userId}: is_active=${users[userIndex].is_active}`);
      
      send(res, 200, {
        id: users[userIndex].id,
        name: users[userIndex].name,
        email: users[userIndex].email,
        role: users[userIndex].role,
        restaurant_id: users[userIndex].restaurant_id,
        restaurant_name: users[userIndex].restaurant_name,
        is_active: users[userIndex].is_active,
        must_change_password: users[userIndex].must_change_password || false,
      });
      return;
    }

    // POST /superadmin/users/:id/reset-password - Reset user password
    if (req.method === "POST" && path.match(/^\/superadmin\/users\/\d+\/reset-password$/)) {
      const userId = Number(path.split("/")[3]);
      const body = await parseBody(req);
      const userIndex = users.findIndex(u => u.id === userId);
      
      if (userIndex === -1) {
        send(res, 404, { error: "User not found" });
        return;
      }

      if (!body.temporaryPassword || body.temporaryPassword.length < 8) {
        send(res, 400, { error: "Temporary password must be at least 8 characters" });
        return;
      }

      // Update password and set must_change_password flag
      users[userIndex].password = String(body.temporaryPassword).trim();
      users[userIndex].must_change_password = true;

      saveUsers(); // Persist the updated user to JSON
      console.log(`[USER] ✅ Reset password for user ${userId}`);
      
      send(res, 200, {
        success: true,
        message: "Password reset successfully",
      });
      return;
    }

    // DELETE /superadmin/users/:id - Delete user
    if (req.method === "DELETE" && path.match(/^\/superadmin\/users\/\d+$/)) {
      const userId = Number(path.split("/").pop());
      const userIndex = users.findIndex(u => u.id === userId);
      
      if (userIndex === -1) {
        send(res, 404, { error: "User not found" });
        return;
      }

      // Prevent deleting super admin
      if (users[userIndex].role === "superadmin") {
        send(res, 403, { error: "Cannot delete super admin user" });
        return;
      }

      const deletedUser = users.splice(userIndex, 1)[0];
      saveUsers(); // Persist the deletion to JSON
      console.log(`[USER] ✅ Deleted user ${userId}: ${deletedUser.email}`);
      
      send(res, 200, {
        success: true,
        message: "User deleted successfully",
      });
      return;
    }

    if (req.method === "GET" && path === "/payroll/staff") {
      send(res, 200, payrollStaff);
      return;
    }

    if (req.method === "POST" && path === "/payroll/staff") {
      const body = await parseBody(req);
      if (!body.name || !body.role) {
        send(res, 400, { error: "Invalid staff payload" });
        return;
      }
      const staff = {
        id: Math.max(...payrollStaff.map(s => s.id), 0) + 1,
        name: String(body.name).trim(),
        role: String(body.role).trim(),
        present: Boolean(body.present),
        leaves: Number(body.leaves || 0),
        salary: Number(body.salary || 0),
      };
      payrollStaff.push(staff);
      send(res, 201, staff);
      return;
    }

    // PUT endpoint for updating staff
    if (req.method === "PUT" && path.match(/^\/payroll\/staff\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const staffIndex = payrollStaff.findIndex(s => s.id === id);
      if (staffIndex === -1) {
        send(res, 404, { error: "Staff member not found" });
        return;
      }
      payrollStaff[staffIndex] = {
        ...payrollStaff[staffIndex],
        name: body.name ? String(body.name).trim() : payrollStaff[staffIndex].name,
        role: body.role ? String(body.role).trim() : payrollStaff[staffIndex].role,
        salary: body.salary !== undefined ? Number(body.salary) : payrollStaff[staffIndex].salary,
        present: body.present !== undefined ? Boolean(body.present) : payrollStaff[staffIndex].present,
        leaves: body.leaves !== undefined ? Number(body.leaves) : payrollStaff[staffIndex].leaves,
      };
      send(res, 200, payrollStaff[staffIndex]);
      return;
    }

    // DELETE endpoint for removing staff
    if (req.method === "DELETE" && path.match(/^\/payroll\/staff\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const staffIndex = payrollStaff.findIndex(s => s.id === id);
      if (staffIndex === -1) {
        send(res, 404, { error: "Staff member not found" });
        return;
      }
      const deleted = payrollStaff.splice(staffIndex, 1);
      send(res, 200, { message: "Staff member deleted", deleted: deleted[0] });
      return;
    }

    if (req.method === "GET" && path === "/tasks") {
      send(res, 200, tasks);
      return;
    }

    if (req.method === "POST" && path === "/tasks") {
      const body = await parseBody(req);
      if (!body.title) {
        send(res, 400, { error: "Invalid task payload" });
        return;
      }
      const task = {
        id: Math.max(...tasks.map(t => t.id), 0) + 1,
        title: String(body.title).trim(),
        assigned_to: String(body.assigned_to || "Unassigned"),
        status: String(body.status || "Pending"),
      };
      tasks.push(task);
      send(res, 201, task);
      return;
    }

    // PUT endpoint for updating tasks
    if (req.method === "PUT" && path.match(/^\/tasks\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const taskIndex = tasks.findIndex(t => t.id === id);
      if (taskIndex === -1) {
        send(res, 404, { error: "Task not found" });
        return;
      }
      tasks[taskIndex] = {
        ...tasks[taskIndex],
        title: body.title ? String(body.title).trim() : tasks[taskIndex].title,
        assigned_to: body.assigned_to ? String(body.assigned_to).trim() : tasks[taskIndex].assigned_to,
        status: body.status ? String(body.status) : tasks[taskIndex].status,
      };
      send(res, 200, tasks[taskIndex]);
      return;
    }

    // DELETE endpoint for removing tasks
    if (req.method === "DELETE" && path.match(/^\/tasks\/\d+$/)) {
      const id = Number(path.split("/").pop());
      const taskIndex = tasks.findIndex(t => t.id === id);
      if (taskIndex === -1) {
        send(res, 404, { error: "Task not found" });
        return;
      }
      const deleted = tasks.splice(taskIndex, 1);
      send(res, 200, { message: "Task deleted", deleted: deleted[0] });
      return;
    }

    if (req.method === "GET" && path === "/reports/overview") {
      // Get top items from menu based on orders
      const itemCounts = {};
      orders.forEach(order => {
        order.items.forEach(item => {
          const itemName = String(item).split(' x')[0].trim();
          itemCounts[itemName] = (itemCounts[itemName] || 0) + 1;
        });
      });
      
      const topItems = Object.entries(itemCounts)
        .map(([name, count]) => ({ name, orders: count }))
        .sort((a, b) => b.orders - a.orders)
        .slice(0, 5);

      send(res, 200, {
        revenue: orders.reduce((sum, o) => sum + o.total, 0),
        totalOrders: orders.length,
        totalCustomers: crmCustomers.length,
        topItems: topItems.length > 0 ? topItems : [{ name: "Butter Chicken", orders: 5 }, { name: "Paneer Tikka", orders: 3 }],
      });
      return;
    }

    if (req.method === "GET" && path === "/pos/transactions") {
      send(res, 200, posTransactions);
      return;
    }

    if (req.method === "POST" && path === "/pos/transactions") {
      const body = await parseBody(req);
      if (!Array.isArray(body.items) || Number(body.total) <= 0) {
        send(res, 400, { error: "Invalid POS payload" });
        return;
      }
      const transaction = {
        id: nextTransactionId++,
        order_number: `POS-${Date.now()}`,
        items: body.items,
        subtotal: Number(body.subtotal || 0),
        tax: Number(body.tax || 0),
        total: Number(body.total),
        payment_method: String(body.payment_method || "cash"),
        created_at: new Date().toISOString(),
      };
      posTransactions.unshift(transaction);
      send(res, 201, transaction);
      return;
    }

    if (req.method === "PATCH" && path.startsWith("/orders/") && path.endsWith("/status")) {
      const id = Number(path.split("/")[2]);
      const body = await parseBody(req);
      const order = orders.find((item) => item.id === id);
      if (!order) {
        notFound(res);
        return;
      }
      if (body.status) {
        order.status = String(body.status);
        
        // Update table status based on order status
        if (order.table_number) {
          const table = tables.find((t) => t.table_number === order.table_number);
          if (table) {
            if (body.status === "served") {
              // When order is served, table remains occupied (customer is eating)
              table.status = "occupied";
              table.current_order = order.id;
              table.estimated_time = "Eating";
            } else if (body.status === "completed") {
              // When order is completed, table becomes available (customer left)
              table.status = "available";
              table.current_order = null;
              table.estimated_time = null;
            }
          }
        }
      }
      send(res, 200, order);
      return;
    }

    notFound(res);
  } catch (err) {
    send(res, 400, { error: err instanceof Error ? err.message : "Request failed" });
  }
});

server.listen(PORT, () => {
  console.log(`Mock backend running on http://localhost:${PORT}`);
});
