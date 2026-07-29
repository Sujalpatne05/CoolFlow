import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chrome as Home, Building, CreditCard, Users, ChartBar as BarChart2, Settings, LifeBuoy, Menu, X, LogOut, Shield } from "lucide-react";

const sidebarNav = [
  { label: "Dashboard", icon: Home, route: "/superadmin-dashboard" },
  { label: "Restaurants", icon: Building, route: "/superadmin-restaurants" },
  { label: "Subscriptions", icon: CreditCard, route: "/superadmin-subscriptions" },
  { label: "Revenue", icon: BarChart2, route: "/superadmin-revenue" },
  { label: "Users", icon: Users, route: "/superadmin-users" },
  { label: "Analytics", icon: BarChart2, route: "/superadmin-analytics" },
  { label: "System Settings", icon: Settings, route: "/superadmin-settings" },
  { label: "Support", icon: LifeBuoy, route: "/superadmin-support" },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const currentPath = window.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("isSuperAdmin");
    localStorage.removeItem("userRole");
    window.location.href = "/admin-login";
  };

  const handleNav = (route: string) => {
    navigate(route);
    setMobileOpen(false);
  };

  const SidebarContent = () => (
    <>
      <div className="px-3 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-1">
          <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center shadow-soft">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">Control Center</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Platform Admin</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto">
        {sidebarNav.map((item) => {
          const isActive = currentPath === item.route;
          return (
            <button
              key={item.label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full text-left ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              }`}
              onClick={() => handleNav(item.route)}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="h-[18px] w-[18px]" />
          <span>Logout</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md gradient-brand flex items-center justify-center">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold">Control Center</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="h-9 w-9 rounded-lg hover:bg-sidebar-accent flex items-center justify-center">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)} />
      )}
      <div className={`md:hidden fixed top-0 left-0 h-full w-72 bg-sidebar z-50 shadow-elevated transform transition-transform duration-300 flex flex-col ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <SidebarContent />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-sidebar border-r border-sidebar-border flex-col min-h-screen">
        <SidebarContent />
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 pt-16 md:pt-6 overflow-x-hidden min-w-0">
        {children}
      </main>
    </div>
  );
}
