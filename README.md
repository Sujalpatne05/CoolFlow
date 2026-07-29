# OrderNest - Restaurant Management System

## Project Info

OrderNest is a comprehensive Restaurant Management System built with modern web technologies for restaurant operations, menu management, orders, analytics, and more.

## Technologies Used

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- PostgreSQL (Neon)
- Express.js

## How to Run Locally

1. **Clone the repository:**
   ```sh
   git clone <YOUR_GIT_URL>
   ```
2. **Navigate to the project directory:**
   ```sh
   cd <YOUR_PROJECT_NAME>
   ```
3. **Install dependencies:**
   ```sh
   npm install
   ```
4. **Setup Environment Variables:**
   - Copy `.env.example` to `.env` in root folder
   - Copy `server/.env.example` to `server/.env`
   - Update database connection string in `server/.env`

5. **Start the backend server:**
   ```sh
   npm run backend
   ```
   
6. **Start the frontend development server (in a new terminal):**
   ```sh
   npm run dev
   ```
   
   The app will be available at `http://localhost:8080`

## Default Login Credentials

**Super Admin:**
- Email: `superadmin@ordernest.com`
- Password: `Admin@123`

## Features

- 🏪 Multi-tenant restaurant management
- 👥 Role-based access control (RBAC)
- 📋 POS & Billing system
- 🍽️ Menu management with categories
- 📊 Kitchen Display System (KDS)
- 🚚 Delivery management
- 📅 Table reservations
- 💰 Payments & reports
- 👨‍💼 Staff & payroll management
- 📱 Progressive Web App (PWA)
- 🖨️ Print bills & KOT
- 📈 Analytics & insights

## Project Structure

```
hotel/
├── public/          # Static assets
├── server/          # Backend server (Express + PostgreSQL)
│   └── prod/        # Production server files
├── src/             # Frontend source code
│   ├── components/  # Reusable components
│   ├── pages/       # Page components
│   └── lib/         # Utilities & helpers
├── .env             # Frontend environment variables
└── server/.env      # Backend environment variables
```

## Deployment

You can deploy this project using:
- **Frontend**: Vercel, Netlify, or Render
- **Backend**: Render, Railway, or any Node.js hosting
- **Database**: Neon, Supabase, or any PostgreSQL provider

Configuration files included:
- `vercel.json` - Vercel deployment
- `netlify.toml` - Netlify deployment  
- `render.yaml` - Render deployment

## Development

```sh
# Install dependencies
npm install

# Run backend
npm run backend

# Run frontend (in another terminal)
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

## License

This project is private and proprietary.

---

**OrderNest** - Your kitchen, your control 🍽️
