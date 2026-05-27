import React, { useEffect, useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { buildAuthHeaders, clearAuthSession, isAuthError, getStoredRestaurantName } from "@/lib/session";
import {
  IndianRupee, ShoppingCart, Users, TrendingUp,
  ChefHat, AlertTriangle, Clock, CheckCircle,
  Table, CreditCard, Activity, ArrowRight
} from "lucide-react";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

export default function Dashboard() {
  const navigate = useNavigate();
  const userRole = localStorage.getItem("userRole") || "staff";
  const [orders, setOrders] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restaurantName, setRestaurantName] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        const headers = buildAuthHeaders();
        if (!headers) { clearAuthSession(); navigate("/admin-login"); return; }

        const [ordersRes, tablesRes, inventoryRes, profileRes] = await Promise.all([
          fetch(`${API_BASE_URL}/orders`, { headers }),
          fetch(`${API_BASE_URL}/tables`, { headers }),
          fetch(`${API_BASE_URL}/inventory`, { headers }),
          fetch(`${API_BASE_URL}/profile`, { headers }),
        ]);

        if (isAuthError(ordersRes.status)) { clearAuthSession(); navigate("/admin-login"); return; }

        const [ordersData, tablesData, inventoryData, profileData] = await Promise.all([
          ordersRes.json(), tablesRes.json(), inventoryRes.json(), profileRes.json(),
        ]);

        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setTables(Array.isArray(tablesData) ? tablesData : []);
        setInventory(Array.isArray(inventoryData) ? inventoryData : []);
        if (profileData?.restaurantName) {
          setRestaurantName(profileData.restaurantName);
        }
      } catch (e) {
        // Dashboard load error
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [navigate]);

  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalOrders = orders.length;
    const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const unpaidOrders = orders.filter(o => o.paymentStatus !== "paid" && o.orderType === "dine-in");
    const kitchenPending = orders.filter(o => o.status === "pending").length;
    const kitchenPreparing = orders.filter(o => o.status === "preparing").length;
    const kitchenReady = orders.filter(o => o.status === "ready").length;
    const lowStock = inventory.filter((i: any) => i.quantity <= i.min_stock);
    return { totalRevenue, totalOrders, avgOrder, unpaidOrders, kitchenPending, kitchenPreparing, kitchenReady, lowStock };
  }, [orders, inventory]);

  const topItems = useMemo(() => {
    const counts: { [k: string]: number } = {};
    orders.forEach(o => {
      (o.items || []).forEach((item: string | any) => {
        let itemStr = typeof item === 'string' ? item : '';
        
        // Handle object format
        if (typeof item === 'object' && item !== null) {
          itemStr = item.name ? `${item.name} x${item.qty}` : '';
        }
        
        const match = itemStr.match(/^(.+?)\s+x(\d+)$/);
        const name = match ? match[1] : itemStr;
        const qty = match ? Number(match[2]) : 1;
        counts[name] = (counts[name] || 0) + qty;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [orders]);

  const recentActivity = useMemo(() => {
    return orders.slice(0, 8).map(o => ({
      id: o.id,
      text: o.orderType === "dine-in"
        ? `Table ${o.table_number} placed order`
        : `${o.orderType === "take-away" ? "Takeaway" : "Delivery"} order #${o.id}`,
      amount: Number(o.total),
      status: o.status,
      paid: o.paymentStatus === "paid",
    }));
  }, [orders]);

  const tableStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-green-500";
      case "occupied": return "bg-red-500";
      case "reserved": return "bg-yellow-500";
      case "maintenance": return "bg-gray-400";
      default: return "bg-gray-300";
    }
  };

  const tableTextColor = (status: string) => {
    switch (status) {
      case "available": return "text-green-700 bg-green-50 border-green-200";
      case "occupied": return "text-red-700 bg-red-50 border-red-200";
      case "reserved": return "text-yellow-700 bg-yellow-50 border-yellow-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">

        {/* Header */}
        <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold mb-1">Welcome back, {restaurantName || getStoredRestaurantName() || "Restaurant"}!</h1>
              <p className="text-orange-100 text-sm">Here's your restaurant at a glance — {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
          </div>
          <ChefHat className="h-16 w-16 text-orange-200 hidden sm:block" />
        </div>

        {/* Key Stats - Role Based */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Revenue - Admin only */}
          {userRole === "admin" && (
            <div onClick={() => navigate("/payments-overview")} className="cursor-pointer">
              <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-green-500">
                <CardContent className="pt-4 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
                      <p className="text-2xl font-bold text-green-600">₹{stats.totalRevenue.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="bg-green-100 p-2 rounded-lg"><IndianRupee className="h-5 w-5 text-green-600" /></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Total Orders - All roles */}
          <div onClick={() => navigate("/orders")} className="cursor-pointer">
            <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
              <CardContent className="pt-4 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Total Orders</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.totalOrders}</p>
                  </div>
                  <div className="bg-blue-100 p-2 rounded-lg"><ShoppingCart className="h-5 w-5 text-blue-600" /></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Avg Order Value - Admin only */}
          {userRole === "admin" && (
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="pt-4 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Avg Order Value</p>
                    <p className="text-2xl font-bold text-purple-600">₹{stats.avgOrder.toLocaleString("en-IN")}</p>
                  </div>
                  <div className="bg-purple-100 p-2 rounded-lg"><TrendingUp className="h-5 w-5 text-purple-600" /></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Unpaid Bills - Admin only */}
          {userRole === "admin" && (
            <div onClick={() => navigate("/bill-settlement")} className="cursor-pointer">
              <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-orange-500">
                <CardContent className="pt-4 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Unpaid Bills</p>
                      <p className="text-2xl font-bold text-orange-600">{stats.unpaidOrders.length}</p>
                    </div>
                    <div className="bg-orange-100 p-2 rounded-lg"><CreditCard className="h-5 w-5 text-orange-600" /></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Pending Actions */}
        {(stats.unpaidOrders.length > 0 || stats.kitchenPending > 0 || stats.lowStock.length > 0) && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                <AlertTriangle size={18} /> Pending Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {stats.unpaidOrders.length > 0 && (
                  <Button size="sm" variant="outline" className="border-orange-400 text-orange-700 hover:bg-orange-100" onClick={() => navigate("/bill-settlement")}>
                    <CreditCard size={14} className="mr-1" /> {stats.unpaidOrders.length} Unpaid Bills
                  </Button>
                )}
                {stats.kitchenPending > 0 && (
                  <Button size="sm" variant="outline" className="border-blue-400 text-blue-700 hover:bg-blue-50" onClick={() => navigate("/kitchen-display")}>
                    <ChefHat size={14} className="mr-1" /> {stats.kitchenPending} Orders in Kitchen
                  </Button>
                )}
                {stats.lowStock.length > 0 && (
                  <Button size="sm" variant="outline" className="border-red-400 text-red-700 hover:bg-red-50" onClick={() => navigate("/inventory")}>
                    <AlertTriangle size={14} className="mr-1" /> {stats.lowStock.length} Low Stock Items
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Table Status - Admin & Manager only */}
          {(userRole === "admin" || userRole === "manager") && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Table size={18} className="text-orange-500" /> Live Table Status
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => navigate("/table-management")} className="text-orange-600 text-xs">
                    Manage <ArrowRight size={14} className="ml-1" />
                  </Button>
                </div>
                <div className="flex gap-3 text-xs mt-1">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> Available</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> Occupied</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block"></span> Reserved</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block"></span> Maintenance</span>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-4 text-gray-400">Loading tables...</div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {tables.map((table: any) => (
                      <div
                        key={table.id}
                        onClick={() => table.status === "occupied" ? navigate(`/billing?table=${table.table_number ?? table.number}`) : navigate("/table-management")}
                        className={`cursor-pointer rounded-xl border-2 p-3 text-center transition-all hover:scale-105 ${tableTextColor(table.status)}`}
                      >
                        <div className={`w-3 h-3 rounded-full mx-auto mb-1 ${tableStatusColor(table.status)}`}></div>
                        <p className="font-bold text-sm">T{table.table_number ?? table.number}</p>
                        <p className="text-xs capitalize">{table.status}</p>
                        {table.status === "occupied" && (
                          <p className="text-xs mt-1 font-semibold">Open Bill</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Kitchen Status */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base flex items-center gap-2">
                  <ChefHat size={18} className="text-orange-500" /> Kitchen Status
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => navigate("/kitchen-display")} className="text-orange-600 text-xs">
                  View <ArrowRight size={14} className="ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-yellow-600" />
                  <span className="text-sm font-medium">Pending</span>
                </div>
                <Badge className="bg-yellow-500 text-white text-lg px-3">{stats.kitchenPending}</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2">
                  <ChefHat size={16} className="text-blue-600" />
                  <span className="text-sm font-medium">Preparing</span>
                </div>
                <Badge className="bg-blue-500 text-white text-lg px-3">{stats.kitchenPreparing}</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="text-sm font-medium">Ready to Serve</span>
                </div>
                <Badge className="bg-green-500 text-white text-lg px-3">{stats.kitchenReady}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Top Selling Items Today - Admin only */}
          {userRole === "admin" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp size={18} className="text-orange-500" /> Top Selling Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topItems.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">No orders yet</p>
                ) : (
                  <div className="space-y-2">
                    {topItems.map(([name, count], idx) => {
                      const maxCount = topItems[0][1];
                      const pct = Math.round((count / maxCount) * 100);
                      return (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-xs font-bold text-orange-500 w-4">#{idx + 1}</span>
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium">{name}</span>
                              <span className="text-gray-500">{count} sold</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity size={18} className="text-orange-500" /> Recent Activity
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => navigate("/orders")} className="text-orange-600 text-xs">
                  All Orders <ArrowRight size={14} className="ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No recent activity</p>
              ) : (
                <div className="space-y-2">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${activity.status === "completed" ? "bg-green-500" : activity.status === "preparing" ? "bg-blue-500" : "bg-yellow-500"}`}></div>
                        <span className="text-sm">{activity.text}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">₹{activity.amount}</span>
                        <Badge className={activity.paid ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>
                          {activity.paid ? "Paid" : "Unpaid"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alert - Admin only */}
        {userRole === "admin" && stats.lowStock.length > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-red-700">
                <AlertTriangle size={18} /> Low Stock Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {stats.lowStock.map((item: any) => (
                  <Badge key={item.id} className="bg-red-100 text-red-800 border border-red-300">
                    {item.name}: {item.quantity} {item.unit} left
                  </Badge>
                ))}
              </div>
              <Button size="sm" className="mt-3 bg-red-500 hover:bg-red-600" onClick={() => navigate("/inventory")}>
                Manage Inventory
              </Button>
            </CardContent>
          </Card>
        )}

      </div>
    </DashboardLayout>
  );
}
