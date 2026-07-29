import React, { useEffect, useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { buildAuthHeaders, clearAuthSession, isAuthError, getStoredRestaurantName } from "@/lib/session";
import {
  IndianRupee, ShoppingCart, TrendingUp, ChefHat, AlertTriangle, Clock, CheckCircle,
  Table, CreditCard, Activity, ArrowRight, UtensilsCrossed,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

const PIE_COLORS = ["hsl(221 83% 53%)", "hsl(172 66% 50%)", "hsl(38 92% 50%)", "hsl(142 71% 45%)"];

const tableTextColor = (status: string) => {
  switch (status) {
    case "available": return "border-success/30 bg-success/10 text-success";
    case "occupied": return "border-destructive/30 bg-destructive/10 text-destructive";
    case "reserved": return "border-warning/30 bg-warning/10 text-warning";
    default: return "border-border bg-muted text-muted-foreground";
  }
};

const tableDotColor = (status: string) => {
  switch (status) {
    case "available": return "bg-success";
    case "occupied": return "bg-destructive";
    case "reserved": return "bg-warning";
    default: return "bg-muted-foreground";
  }
};

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
        if (profileData?.restaurantName) setRestaurantName(profileData.restaurantName);
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
    const kitchenReady = orders.filter(o => o.status === "ready").length;
    const lowStock = inventory.filter((i: any) => Number(i.quantity ?? i.stock) <= Number(i.min_stock));
    return { totalRevenue, totalOrders, avgOrder, unpaidOrders, kitchenPending, kitchenReady, lowStock };
  }, [orders, inventory]);

  const topItems = useMemo(() => {
    const counts: { [k: string]: number } = {};
    orders.forEach(o => {
      (o.items || []).forEach((item: string | any) => {
        let itemStr = typeof item === "string" ? item : "";
        if (typeof item === "object" && item !== null) {
          itemStr = item.name ? `${item.name} x${item.qty}` : "";
        }
        const match = itemStr.match(/^(.+?)\s+x(\d+)$/);
        const name = match ? match[1] : itemStr;
        const qty = match ? Number(match[2]) : 1;
        counts[name] = (counts[name] || 0) + qty;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [orders]);

  const revenueByType = useMemo(() => {
    const map: { [k: string]: number } = {};
    orders.forEach(o => {
      const t = o.orderType || "dine-in";
      map[t] = (map[t] || 0) + Number(o.total || 0);
    });
    const labels: Record<string, string> = { "dine-in": "Dine-in", "take-away": "Takeaway", delivery: "Delivery" };
    return Object.entries(map).map(([k, v]) => ({ name: labels[k] || k, value: v }));
  }, [orders]);

  // Last 7 days revenue series
  const dailyRevenue = useMemo(() => {
    const days: { [k: string]: number } = {};
    orders.forEach(o => {
      if (o.created_at) {
        const d = new Date(o.created_at).toLocaleDateString("en-IN", { weekday: "short" });
        days[d] = (days[d] || 0) + Number(o.total || 0);
      }
    });
    const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return order.map(d => ({ day: d, revenue: days[d] || 0 }));
  }, [orders]);

  const recentActivity = useMemo(() => {
    return orders.slice(0, 6).map(o => ({
      id: o.id,
      text: o.orderType === "dine-in"
        ? `Table ${o.table_number} placed order`
        : `${o.orderType === "take-away" ? "Takeaway" : "Delivery"} order #${o.id}`,
      amount: Number(o.total),
      status: o.status,
      paid: o.paymentStatus === "paid",
    }));
  }, [orders]);

  const activeName = restaurantName || getStoredRestaurantName() || "Restaurant";

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 animate-fade-in">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
              Welcome back, <span className="text-gradient">{activeName}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">Here's what's happening across your restaurant today.</p>
          </div>
          <Button onClick={() => navigate("/billing")} className="gradient-brand text-white shadow-soft hover:shadow-elevated w-fit">
            <UtensilsCrossed className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>

        {/* Pending actions banner */}
        {(stats.unpaidOrders.length > 0 || stats.kitchenPending > 0 || stats.lowStock.length > 0) && (
          <Card className="border-primary/20 bg-primary/5 animate-slide-up">
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 mr-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Needs attention</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.unpaidOrders.length > 0 && (
                  <button onClick={() => navigate("/bill-settlement")} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 transition-colors">
                    {stats.unpaidOrders.length} unpaid bills
                  </button>
                )}
                {stats.kitchenPending > 0 && (
                  <button onClick={() => navigate("/kitchen-display")} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 transition-colors">
                    {stats.kitchenPending} in kitchen
                  </button>
                )}
                {stats.lowStock.length > 0 && (
                  <button onClick={() => navigate("/inventory")} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 transition-colors">
                    {stats.lowStock.length} low stock
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {userRole === "admin" && (
            <StatCardLink title="Total Revenue" value={`₹${stats.totalRevenue.toLocaleString("en-IN")}`} icon={<IndianRupee className="h-5 w-5" />} onClick={() => navigate("/payments-overview")} />
          )}
          <StatCardLink title="Total Orders" value={stats.totalOrders} icon={<ShoppingCart className="h-5 w-5" />} onClick={() => navigate("/orders")} />
          {userRole === "admin" && (
            <StatCardLink title="Avg Order Value" value={`₹${stats.avgOrder.toLocaleString("en-IN")}`} icon={<TrendingUp className="h-5 w-5" />} />
          )}
          {userRole === "admin" && (
            <StatCardLink title="Unpaid Bills" value={stats.unpaidOrders.length} icon={<CreditCard className="h-5 w-5" />} onClick={() => navigate("/bill-settlement")} />
          )}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue chart */}
          <Card className="lg:col-span-2 animate-slide-up">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Revenue this week</CardTitle>
                  <CardDescription>Daily revenue across all order types</CardDescription>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Last 7 days</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyRevenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(221 83% 53%)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(221 83% 53%)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 20%)" vertical={false} />
                    <XAxis dataKey="day" stroke="hsl(215 20% 55%)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(215 20% 55%)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(217 33% 20%)", borderRadius: "8px", fontSize: "12px" }}
                      labelStyle={{ color: "hsl(215 20% 65%)" }}
                      itemStyle={{ color: "hsl(210 40% 98%)" }}
                      formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Revenue"]}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(221 83% 53%)" strokeWidth={2.5} fill="url(#revFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Order type split */}
          <Card className="animate-slide-up">
            <CardHeader>
              <CardTitle>Revenue split</CardTitle>
              <CardDescription>By order type</CardDescription>
            </CardHeader>
            <CardContent>
              {revenueByType.length === 0 ? (
                <EmptyState icon={<UtensilsCrossed className="h-8 w-8" />} text="No orders yet" />
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={revenueByType} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                        {revenueByType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="hsl(222 47% 11%)" strokeWidth={2} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(217 33% 20%)", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="mt-4 space-y-2">
                {revenueByType.map((r, i) => (
                  <div key={r.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground">{r.name}</span>
                    </div>
                    <span className="font-medium tabular-nums">₹{r.value.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tables + Kitchen */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {(userRole === "admin" || userRole === "manager") && (
            <Card className="lg:col-span-2 animate-slide-up">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Live table status</CardTitle>
                    <CardDescription>Real-time seating overview</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/table-management")} className="text-primary hover:text-primary">
                    Manage <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <SkeletonGrid />
                ) : tables.length === 0 ? (
                  <EmptyState icon={<Table className="h-8 w-8" />} text="No tables configured" />
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {tables.map((table: any) => (
                      <button
                        key={table.id}
                        onClick={() => table.status === "occupied" ? navigate(`/billing?table=${table.table_number ?? table.number}`) : navigate("/table-management")}
                        className={`rounded-lg border p-3 text-center transition-all hover:scale-[1.03] ${tableTextColor(table.status)}`}
                      >
                        <div className={`mx-auto mb-1.5 h-2 w-2 rounded-full ${tableDotColor(table.status)}`} />
                        <p className="text-sm font-bold">T{table.table_number ?? table.number}</p>
                        <p className="text-[10px] capitalize mt-0.5">{table.status}</p>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-4 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
                  <LegendDot color="bg-success" label="Available" />
                  <LegendDot color="bg-destructive" label="Occupied" />
                  <LegendDot color="bg-warning" label="Reserved" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Kitchen status */}
          <Card className="animate-slide-up">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Kitchen status</CardTitle>
                  <CardDescription>Current workload</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/kitchen-display")} className="text-primary hover:text-primary">
                  View <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning/5 p-3.5">
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-warning" />
                  <span className="text-sm font-medium">Pending</span>
                </div>
                <span className="text-xl font-bold text-warning tabular-nums">{stats.kitchenPending}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-success/20 bg-success/5 p-3.5">
                <div className="flex items-center gap-2.5">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium">Ready to serve</span>
                </div>
                <span className="text-xl font-bold text-success tabular-nums">{stats.kitchenReady}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top items + activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {userRole === "admin" && (
            <Card className="animate-slide-up">
              <CardHeader>
                <CardTitle>Top selling items</CardTitle>
                <CardDescription>Best performers this period</CardDescription>
              </CardHeader>
              <CardContent>
                {topItems.length === 0 ? (
                  <EmptyState icon={<TrendingUp className="h-8 w-8" />} text="No sales data yet" />
                ) : (
                  <div className="space-y-3">
                    {topItems.map(([name, count], idx) => {
                      const max = topItems[0][1] as number;
                      const pct = Math.round(((count as number) / max) * 100);
                      return (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-xs font-bold text-muted-foreground w-5">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium truncate">{name}</span>
                              <span className="text-muted-foreground tabular-nums">{count}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full gradient-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
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

          <Card className="animate-slide-up">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent activity</CardTitle>
                  <CardDescription>Latest orders</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} className="text-primary hover:text-primary">
                  All <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <EmptyState icon={<Activity className="h-8 w-8" />} text="No recent activity" />
              ) : (
                <div className="space-y-1">
                  {recentActivity.map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${a.status === "completed" ? "bg-success" : a.status === "preparing" ? "bg-info" : "bg-warning"}`} />
                        <span className="text-sm truncate">{a.text}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold tabular-nums">₹{a.amount}</span>
                        <Badge variant="outline" className={a.paid ? "border-success/30 text-success" : "border-warning/30 text-warning"}>
                          {a.paid ? "Paid" : "Unpaid"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Low stock */}
        {userRole === "admin" && stats.lowStock.length > 0 && (
          <Card className="border-destructive/30 animate-slide-up">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <CardTitle>Low stock alert</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/inventory")}>Manage</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {stats.lowStock.map((item: any) => (
                  <Badge key={item.id} variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
                    {item.name}: {item.quantity ?? item.stock} {item.unit}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function StatCardLink({ title, value, icon, onClick }: { title: string; value: string | number; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-card p-5 shadow-soft transition-all duration-200 hover:border-primary/40 hover:shadow-elevated animate-slide-up disabled:opacity-60"
      disabled={!onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">{value}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
          {icon}
        </div>
      </div>
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
      <div className="text-muted-foreground/40 mb-3">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="h-20 rounded-lg animate-shimmer" />
      ))}
    </div>
  );
}
