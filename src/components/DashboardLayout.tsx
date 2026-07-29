import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/StatCard";
import { LogOut, Search } from "lucide-react";
import React, { useEffect, useState } from "react";
import { buildAuthHeaders, clearAuthSession, getStoredRestaurantName } from "@/lib/session";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

const FALLBACK_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%2310805a'/%3E%3Cpath d='M12 14h16M14 14v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V14' stroke='white' stroke-width='2' stroke-linecap='round' fill='none'/%3E%3Ccircle cx='20' cy='11' r='2' fill='white'/%3E%3C/svg%3E";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [logo, setLogo] = useState<string>(FALLBACK_LOGO);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const headers = buildAuthHeaders();
        if (!headers) return;
        const profileRes = await fetch(`${API_BASE_URL}/profile`, { headers });
        const profileData = await profileRes.json();
        if (profileData?.restaurantLogo) setLogo(profileData.restaurantLogo);
      } catch (e) {
        // use fallback
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
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="min-w-0 flex-1 flex flex-col relative">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
              <div className="hidden sm:flex items-center gap-2.5 min-w-0">
                <img src={logo} alt="" className="h-7 w-7 rounded-md object-cover border border-border" />
                <span className="text-sm font-semibold text-foreground truncate">
                  {getStoredRestaurantName() || "Dashboard"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                className="hidden md:flex items-center gap-2 rounded-md border border-border bg-card px-3 h-9 text-sm text-muted-foreground hover:border-input hover:text-foreground transition-colors w-56"
                onClick={() => {/* command palette hook point */}}
              >
                <Search className="h-4 w-4" />
                <span className="text-xs">Search…</span>
                <kbd className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">⌘K</kbd>
              </button>
              <NotificationBell />
              <div className="h-6 w-px bg-border mx-1 hidden sm:block" />
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-md px-2.5 h-9 text-sm font-medium text-muted-foreground hover:bg-destructive/5 hover:text-destructive transition-colors"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </header>
          <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
