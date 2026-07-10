import {
  LayoutDashboard,
  Receipt,
  Users,
  BarChart3,
  UtensilsCrossed,
  Package,
  ShoppingCart,
  ChefHat,
  Table,
  Calendar,
  CreditCard,
  Monitor,
  Truck,
  BookOpen,
  UserCog,
  Wallet,
  Settings2,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import React, { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { getStoredRestaurantName, buildAuthHeaders } from "@/lib/session";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

// Role-based menu configuration
const getMenuGroups = (role: string | null) => {
  const baseMenuGroups = [
    {
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin"] },
      ],
    },
    {
      label: "Orders & Billing",
      items: [
        { title: "POS Billing", url: "/billing", icon: Receipt, roles: ["admin", "manager"] },
        { title: "Billing", url: "/bill-settlement", icon: Wallet, roles: ["admin", "manager"] },
        { title: "Kitchen Display", url: "/kitchen-display", icon: Monitor, roles: ["admin", "manager", "staff"] },
        { title: "Orders", url: "/orders", icon: ShoppingCart, roles: ["admin", "manager", "staff"] },
      ],
    },
    {
      label: "Restaurant",
      items: [
        { title: "Menu Management", url: "/menu", icon: UtensilsCrossed, roles: ["admin", "manager"] },
        { title: "Table Management", url: "/table-management", icon: Table, roles: ["admin", "manager"] },
        { title: "Reservations", url: "/reservations", icon: Calendar, roles: ["admin", "manager"] },
        { title: "Delivery Management", url: "/delivery-management", icon: Truck, roles: ["admin", "manager"] },
      ],
    },
    {
      label: "Finance",
      items: [
        { title: "Payments Overview", url: "/payments-overview", icon: CreditCard, roles: ["admin"] },
        { title: "Reports & Tally", url: "/reports", icon: BarChart3, roles: ["admin"] },
      ],
    },
    {
      label: "Management",
      items: [
        { title: "Inventory", url: "/inventory", icon: Package, roles: ["admin", "manager"] },
        { title: "Payroll", url: "/payroll", icon: Users, roles: ["admin", "manager"] },
        { title: "CRM", url: "/crm", icon: UserCog, roles: ["admin", "manager"] },
      ],
    },
    {
      label: "Config",
      items: [
        { title: "Settings", url: "/settings", icon: Settings2, roles: ["admin"] },
      ],
    },
  ];

  // Filter menu groups and items based on role
  return baseMenuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role || "staff")),
    }))
    .filter((group) => group.items.length > 0);
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const userRole = localStorage.getItem("userRole");
  const restaurantName = getStoredRestaurantName();
  const [logo, setLogo] = useState<string | null>(null);
  const menuGroups = getMenuGroups(userRole);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const headers = buildAuthHeaders();
        if (!headers) return;

        const profileRes = await fetch(`${API_BASE_URL}/profile`, { headers });
        const profileData = await profileRes.json();
        
        if (profileData?.restaurantLogo) {
          setLogo(profileData.restaurantLogo);
        } else {
          setLogo("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23FF6B35' width='100' height='100'/%3E%3Ctext x='50' y='50' font-size='40' fill='white' text-anchor='middle' dy='.3em'%3E🍽️%3C/text%3E%3C/svg%3E");
        }
      } catch (e) {
        setLogo("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23FF6B35' width='100' height='100'/%3E%3Ctext x='50' y='50' font-size='40' fill='white' text-anchor='middle' dy='.3em'%3E🍽️%3C/text%3E%3C/svg%3E");
      }
    };

    fetchLogo();
  }, []);

  useEffect(() => {
    const activeItem = document.querySelector('[data-sidebar-active="true"]');
    activeItem?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [location.pathname]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex flex-col items-center gap-3">
          {logo && (
            <img 
              src={logo} 
              alt="Restaurant Logo" 
              className="h-16 w-16 rounded-lg flex-shrink-0"
            />
          )}
          {!collapsed && (
            <div className="text-center">
              <p className="text-sm font-semibold text-sidebar-foreground">
                {restaurantName ? restaurantName : "Management System"}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && (
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40 px-3 py-1">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = location.pathname === item.url;

                  return (
                    <SidebarMenuItem key={item.title} data-sidebar-active={isActive ? "true" : undefined}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <NavLink
                          to={item.url}
                          end
                          className={
                            isActive
                              ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg hover:from-emerald-600 hover:to-teal-700"
                              : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }
                          activeClassName="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold"
                        >
                          <item.icon className="mr-2 h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="text-center border-t border-sidebar-border pt-3">
            <p className="text-xs text-sidebar-foreground/60">
              Created by <span className="font-semibold">Logdine</span>
            </p>
            <p className="text-xs text-sidebar-foreground/50 mt-1">
              © {new Date().getFullYear()}
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
