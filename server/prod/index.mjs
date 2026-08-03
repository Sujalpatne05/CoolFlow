import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setupSchema } from './schema.mjs';

import authRoutes from './routes/auth.mjs';
import menuRoutes from './routes/menu.mjs';
import tablesRoutes from './routes/tables.mjs';
import ordersRoutes from './routes/orders.mjs';
import reservationsRoutes from './routes/reservations.mjs';
import deliveriesRoutes from './routes/deliveries.mjs';
import customerDeliveryRoutes from './routes/customer-delivery.mjs';
import miscRoutes from './routes/misc.mjs';
import superadminRoutes from './routes/superadmin.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from server directory
dotenv.config({ path: join(__dirname, '../.env') });

const app = express();
const PORT = Number(process.env.PORT || 5001);

app.use(cors({ 
  origin: '*', 
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => res.json({ ok: true, service: 'logdine-prod', time: new Date().toISOString() }));

// All routes
app.use(authRoutes);
app.use(menuRoutes);
app.use(tablesRoutes);
app.use(ordersRoutes);
app.use(reservationsRoutes);
app.use(deliveriesRoutes);
app.use(customerDeliveryRoutes);
app.use(miscRoutes);
app.use(superadminRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: `Cannot ${req.method} ${req.path}` }));

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message || 'Server error' });
});

// Start
setupSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[SERVER] ✅ Production backend running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('[SERVER] ❌ Failed to setup schema:', err.message);
    process.exit(1);
  });
