import { LayoutDashboard, Receipt, Users, ChartBar as BarChart3, UtensilsCrossed, Package, ShoppingCart, ChefHat, Table, Calendar, CreditCard, Monitor, Truck, UserCog, Wallet, Settings2 } from "lucide-react";
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

  return baseMenuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role || "staff")),
    }))
    .filter((group) => group.items.length > 0);
};

const FALLBACK_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='10' fill='%232563eb'/%3E%3Cpath d='M12 14h16M14 14v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V14' stroke='white' stroke-width='2' stroke-linecap='round' fill='none'/%3E%3Ccircle cx='20' cy='11' r='2' fill='white'/%3E%3C/svg%3E";

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
        setLogo(profileData?.restaurantLogo || FALLBACK_LOGO);
      } catch (e) {
        setLogo(FALLBACK_LOGO);
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
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-3 px-1">
          <img src={logo || FALLBACK_LOGO} alt="Logo" className="h-8 w-8 rounded-md object-cover border border-sidebar-border flex-shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sidebar-accent-foreground truncate leading-tight">
                {restaurantName || "Management System"}
              </p>
              <p className="text-[11px] text-sidebar-foreground capitalize mt-0.5">
                {userRole || "staff"} workspace
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/70 px-3 py-2">
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
                              ? "bg-primary/10 text-primary font-semibold"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }
                          activeClassName="bg-primary/10 text-primary font-semibold"
                        >
                          <item.icon className="h-[18px] w-[18px] shrink-0" />
                          {!collapsed && <span className="text-[13px]">{item.title}</span>}
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

      <SidebarFooter className="px-3 py-3">
        {!collapsed && (
          <div className="rounded-md border border-sidebar-border bg-secondary/50 px-3 py-2.5">
            <p className="text-[11px] font-medium text-sidebar-foreground/80">
              OrderNest Platform
            </p>
            <p className="text-[10px] text-sidebar-foreground/60 mt-0.5">
              v2.0 · © {new Date().getFullYear()}
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
