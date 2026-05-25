import { useEffect, useState } from "react";
import { usePWAPrompt } from "@/hooks/usePwaPrompt";
import SuperAdminRestaurants from "./pages/SuperAdminRestaurants";
import SuperAdminSubscriptions from "./pages/SuperAdminSubscriptions";
import SuperAdminRevenue from "./pages/SuperAdminRevenue";
import SuperAdminUsers from "./pages/SuperAdminUsers";
import SuperAdminAnalytics from "./pages/SuperAdminAnalytics";
import SuperAdminSettings from "./pages/SuperAdminSettings";
import SuperAdminSupport from "./pages/SuperAdminSupport";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import TableManagement from "./pages/TableManagement";
import Reservations from "./pages/Reservations";
import KitchenDisplay from "./pages/KitchenDisplay";
import DeliveryManagement from "./pages/DeliveryManagement";
import TableQROrdering from "./pages/TableQROrdering";
import TablePayment from "./pages/TablePayment";
import TableConfirmation from "./pages/TableConfirmation";
import { Toaster } from "@/components/ui/toaster";
import React from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminLogin from "./pages/LoginFixed";
const SuperAdminLogin = AdminLogin; // same login page for everyone
import Index from "./pages/Dashboard";
import Billing from "./pages/Billing";
import BillSettlement from "./pages/BillSettlement";
import Payroll from "./pages/Payroll";
import MenuManagement from "./pages/MenuManagement";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import CRM from "./pages/CRM";
import Reports from "./pages/Reports";
import PaymentsOverview from "./pages/PaymentsOverview";
import NotFound from "./pages/NotFound";
import AdminUsers from "./pages/AdminUsers";
import MyProfile from "./pages/MyProfile";
import Settings from "./pages/Settings";
import PublicReservation from "./pages/PublicReservation";
import { getAuthToken, getStoredRole } from "@/lib/session";

const queryClient = new QueryClient();

const getRole = () => {
  const token = getAuthToken();
  if (!token) return null;
  return getStoredRole();
};

const isSuperAdmin = () => getRole() === "superadmin";

const WelcomePage = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="bg-white p-8 rounded shadow text-center">
      <h2 className="text-2xl font-bold text-blue-700 mb-2">Welcome!</h2>
      <p className="text-gray-700">You are logged in as <span className="font-semibold">{getRole()}</span>. No dashboard is assigned for this role.</p>
    </div>
  </div>
);

const App = () => {
  usePWAPrompt();
  const [showInstall, setShowInstall] = useState(false);
  useEffect(() => {
    const handler = () => setShowInstall(true);
    window.addEventListener("pwa-install-available", handler);
    return () => window.removeEventListener("pwa-install-available", handler);
  }, []);
  const handleInstall = () => {
    if (window.deferredPrompt) {
      window.deferredPrompt.prompt();
      window.deferredPrompt.userChoice.then(() => setShowInstall(false));
    }
  };
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PWAInstallPrompt />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/" element={
            getRole() === "admin"
            ? <Index />
            : getRole() === "superadmin"
              ? <SuperAdminDashboard />
              : getRole() === "manager" || getRole() === "staff"
                ? <Orders />
                : <AdminLogin />
          } />
          <Route path="/superadmin-login" element={<SuperAdminLogin />} />
          <Route path="/billing" element={
            (getRole() === "admin" || getRole() === "manager" || getRole() === "staff") ? <Billing /> : <AdminLogin />
          } />
          <Route path="/bill-settlement" element={
            (getRole() === "admin" || getRole() === "manager" || getRole() === "staff") ? <BillSettlement /> : <AdminLogin />
          } />
          <Route path="/payroll" element={
            (getRole() === "admin" || getRole() === "manager") ? <Payroll /> : <AdminLogin />
          } />
          <Route path="/menu" element={
            (getRole() === "admin" || getRole() === "manager") ? <MenuManagement /> : <AdminLogin />
          } />
          <Route path="/orders" element={
            (getRole() === "admin" || getRole() === "manager" || getRole() === "staff") ? <Orders /> : <AdminLogin />
          } />
          <Route path="/inventory" element={
            (getRole() === "admin" || getRole() === "manager") ? <Inventory /> : <AdminLogin />
          } />
          <Route path="/crm" element={
            (getRole() === "admin" || getRole() === "manager") ? <CRM /> : <AdminLogin />
          } />
          <Route path="/reports" element={
            (getRole() === "admin" || getRole() === "manager") ? <Reports /> : <AdminLogin />
          } />
          <Route path="/payments-overview" element={
            (getRole() === "admin" || getRole() === "manager" || getRole() === "staff") ? <PaymentsOverview /> : <AdminLogin />
          } />
          <Route path="/admin-users" element={
            getRole() === "admin" ? <AdminUsers /> : <AdminLogin />
          } />
          <Route path="/my-profile" element={
            (getRole() === "admin" || getRole() === "manager" || getRole() === "staff") ? <MyProfile /> : <AdminLogin />
          } />
          <Route path="/settings" element={
            getRole() === "admin" ? <Settings /> : <AdminLogin />
          } />
          <Route path="/table-management" element={
            (getRole() === "admin" || getRole() === "manager") ? <TableManagement /> : <AdminLogin />
          } />
          <Route path="/reservations" element={
            (getRole() === "admin" || getRole() === "manager" || getRole() === "staff") ? <Reservations /> : <AdminLogin />
          } />
          <Route path="/kitchen-display" element={
            (getRole() === "admin" || getRole() === "manager" || getRole() === "staff") ? <KitchenDisplay /> : <AdminLogin />
          } />
          <Route path="/delivery-management" element={
            (getRole() === "admin" || getRole() === "manager") ? <DeliveryManagement /> : <AdminLogin />
          } />
          <Route path="/table-qr/:tableId" element={<TableQROrdering />} />
          <Route path="/table-payment/:tableId/:orderId" element={<TablePayment />} />
          <Route path="/table-confirmation/:tableId/:orderId" element={<TableConfirmation />} />
          <Route path="/book/:token" element={<PublicReservation />} />
          <Route path="/superadmin-dashboard" element={isSuperAdmin() ? <SuperAdminDashboard /> : <SuperAdminLogin />} />
          <Route path="/superadmin-restaurants" element={isSuperAdmin() ? <SuperAdminRestaurants /> : <SuperAdminLogin />} />
          <Route path="/superadmin-subscriptions" element={isSuperAdmin() ? <SuperAdminSubscriptions /> : <SuperAdminLogin />} />
          <Route path="/superadmin-revenue" element={isSuperAdmin() ? <SuperAdminRevenue /> : <SuperAdminLogin />} />
          <Route path="/superadmin-users" element={isSuperAdmin() ? <SuperAdminUsers /> : <SuperAdminLogin />} />
          <Route path="/superadmin-analytics" element={isSuperAdmin() ? <SuperAdminAnalytics /> : <SuperAdminLogin />} />
          <Route path="/superadmin-settings" element={isSuperAdmin() ? <SuperAdminSettings /> : <SuperAdminLogin />} />
          <Route path="/superadmin-support" element={isSuperAdmin() ? <SuperAdminSupport /> : <SuperAdminLogin />} />
          <Route path="/change-password" element={<Index />} />
          <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
