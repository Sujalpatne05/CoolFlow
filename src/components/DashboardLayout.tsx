import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/StatCard";
import { UserCog, LogOut } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buildAuthHeaders, clearAuthSession } from "@/lib/session";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [logo, setLogo] = useState<string>("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23FF6B35' width='100' height='100'/%3E%3Ctext x='50' y='50' font-size='40' fill='white' text-anchor='middle' dy='.3em'%3E🍽️%3C/text%3E%3C/svg%3E");

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const headers = buildAuthHeaders();
        if (!headers) return;

        const profileRes = await fetch(`${API_BASE_URL}/profile`, { headers });
        const profileData = await profileRes.json();
        
        if (profileData?.restaurantLogo) {
          setLogo(profileData.restaurantLogo);
        }
      } catch (e) {
        // Logo fetch failed, will use default
      }
    };

    fetchLogo();
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    window.location.href = "/admin-login";
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col relative">
          <header className="min-h-14 flex items-center justify-between border-b px-3 py-2 sm:px-4 bg-card relative gap-2">
            <SidebarTrigger />
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
              <NotificationBell />
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-red-50 text-red-600 hover:text-red-700 transition-colors"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline text-sm font-medium">Logout</span>
              </button>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
