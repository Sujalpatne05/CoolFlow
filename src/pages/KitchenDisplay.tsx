import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Clock, CheckCircle2, AlertCircle, ChefHat, Flame, Snowflake, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

type ApiOrder = {
  id: number;
  items: string[];
  total: string | number;
  table_number?: number | null;
  status?: "pending" | "preparing" | "ready" | "served";
  orderType?: string;
  created_at?: string;
  notes?: string;
};

interface KitchenOrder {
  id: string;
  orderNumber: string;
  tableNumber: string;
  items: OrderItem[];
  status: "pending" | "preparing" | "ready" | "served" | "completed";
  priority: "normal" | "urgent";
  timestamp: Date;
  estimatedTime: number;
  type: "dine-in" | "takeout" | "delivery";
  notes?: string;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
  status: "pending" | "preparing" | "ready";
  station: "hot" | "cold" | "grill" | "bar";
}

const inferStation = (name: string): OrderItem["station"] => {
  const lowered = name.toLowerCase();
  if (lowered.includes("salad") || lowered.includes("cold")) return "cold";
  if (lowered.includes("wine") || lowered.includes("cola") || lowered.includes("shake") || lowered.includes("juice")) return "bar";
  if (lowered.includes("grill") || lowered.includes("steak")) return "grill";
  return "hot";
};

const parseBillItem = (raw: string | any, idx: number): OrderItem => {
  // Handle both string format and object format
  let itemStr = typeof raw === 'string' ? raw : '';
  let notes = '';
  
  if (typeof raw === 'object' && raw !== null) {
    // If it's an object, extract the string representation
    itemStr = raw.name ? `${raw.name} x${raw.qty}` : '';
    notes = raw.note || raw.notes || '';
  }
  
  // Parse format: "Item Name x qty" or "Item Name x qty (note)"
  const noteMatch = itemStr.match(/\s*\((.+)\)\s*$/);
  if (noteMatch) {
    notes = noteMatch[1];
    itemStr = itemStr.replace(noteMatch[0], '');
  }
  
  const match = itemStr.match(/^(.*)\sx(\d+)$/i);
  const name = match ? match[1].trim() : itemStr;
  const quantity = match ? Number(match[2]) : 1;

  return {
    id: `${idx + 1}`,
    name,
    quantity,
    notes: notes || undefined,
    status: "pending",
    station: inferStation(name),
  };
};

const toItemStatus = (orderStatus: KitchenOrder["status"]): OrderItem["status"] => {
  if (orderStatus === "preparing") return "preparing";
  if (orderStatus === "ready" || orderStatus === "served" || orderStatus === "completed") return "ready";
  return "pending";
};

export default function KitchenDisplay() {
  const navigate = useNavigate();
  const silentRedirected = useRef(false);
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const goToLogin = (message = "Session expired. Please login again.") => {
    if (!silentRedirected.current) {
      toast.error(message);
      clearAuthSession();
      silentRedirected.current = true;
      setTimeout(() => navigate("/admin-login"), 300);
    }
  };

  const loadOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const headers = buildAuthHeaders();
      if (!headers) {
        goToLogin("Please login to continue.");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/orders`, { headers });
      const data = await response.json();

      if (isAuthError(response.status)) {
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }

      if (!response.ok) {
        if (!silent) toast.error(data?.error || "Unable to load orders for kitchen display");
        return;
      }

      const mapped: KitchenOrder[] = (Array.isArray(data) ? data : []).map((order: ApiOrder) => {
        const orderType = order.orderType || "dine-in";
        const displayType = orderType === "take-away" ? "takeout" : orderType === "delivery" ? "delivery" : "dine-in";
        
        return {
          id: String(order.id),
          orderNumber: `ORD-${order.id}`,
          tableNumber: order.table_number ? String(order.table_number) : "N/A",
          items: (Array.isArray(order.items) ? order.items : []).map((rawItem, itemIdx) => {
            const parsed = parseBillItem(rawItem, itemIdx);
            return { ...parsed, status: toItemStatus(order.status || "pending") };
          }),
          status: order.status || "pending",
          priority: Number(order.total) >= 1000 ? "urgent" : "normal",
          timestamp: order.created_at ? new Date(order.created_at) : new Date(),
          estimatedTime: 15,
          type: displayType as "dine-in" | "takeout" | "delivery",
          notes: order.notes || "",
        };
      });

      setOrders(mapped);
    } catch {
      if (!silent) toast.error("Unable to connect to backend");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();

    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    const refreshInterval = setInterval(() => {
      loadOrders(true);
    }, 15000);

    return () => {
      clearInterval(clockInterval);
      clearInterval(refreshInterval);
    };
  }, []);

  const updateOrderStatus = async (orderId: string, nextStatus: KitchenOrder["status"]) => {
    const headers = buildAuthHeaders();
    if (!headers) {
      goToLogin("Please login to continue.");
      return;
    }

    const previous = orders;
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status: nextStatus,
              items: order.items.map((item) => ({ ...item, status: toItemStatus(nextStatus) })),
            }
          : order,
      ),
    );

    try {
      const response = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json();
      if (isAuthError(response.status)) {
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }
      if (!response.ok) {
        setOrders(previous);
        toast.error(data?.error || "Unable to update order status");
        return;
      }
      if (nextStatus === "preparing") {
        toast.success("Order started");
      } else if (nextStatus === "ready") {
        toast.success("Order ready for serving");
      } else if (nextStatus === "served") {
        toast.success("Order served");
      } else if (nextStatus === "completed") {
        toast.success("Order completed");
      }
    } catch {
      setOrders(previous);
      toast.error("Unable to connect to backend");
    }
  };

  const getElapsedTime = (timestamp: Date) => {
    return Math.floor((currentTime.getTime() - timestamp.getTime()) / 60000);
  };

  const getStatusColor = (status: string, isOverdue: boolean = false) => {
    if (isOverdue) return "bg-red-600";
    switch (status) {
      case "pending": return "bg-yellow-500";
      case "preparing": return "bg-blue-500";
      case "ready": return "bg-green-500";
      case "served": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  const getStationIcon = (station: string) => {
    switch (station) {
      case "hot": return <Flame className="h-4 w-4 text-red-500" />;
      case "cold": return <Snowflake className="h-4 w-4 text-blue-500" />;
      case "grill": return <ChefHat className="h-4 w-4 text-orange-500" />;
      case "bar": return <Clock className="h-4 w-4 text-purple-500" />;
      default: return null;
    }
  };

  const activeOrders = orders
    .filter((order) => order.status !== "served" && order.status !== "completed")
    .sort((a, b) => {
      if (a.priority === "urgent" && b.priority !== "urgent") return -1;
      if (a.priority !== "urgent" && b.priority === "urgent") return 1;
      return a.timestamp.getTime() - b.timestamp.getTime();
    });

  const completedOrders = orders
    .filter((order) => order.status === "served" || order.status === "completed")
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const stats = {
    pending: orders.filter(o => o.status === "pending").length,
    preparing: orders.filter(o => o.status === "preparing").length,
    ready: orders.filter(o => o.status === "ready").length,
    served: orders.filter(o => o.status === "served" || o.status === "completed").length,
  };

  const renderOrderCard = (order: KitchenOrder, isCompleted = false) => {
    const elapsed = getElapsedTime(order.timestamp);
    const isOverdue = elapsed > order.estimatedTime && !isCompleted;

    return (
      <Card key={order.id} className={cn("relative overflow-hidden", order.priority === "urgent" && !isCompleted && "ring-2 ring-red-500", isOverdue && "ring-2 ring-red-600 shadow-lg shadow-red-200", isCompleted && "opacity-75")}>
        <div className={`absolute top-0 left-0 right-0 h-1 ${getStatusColor(order.status, isOverdue)}`} />
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xl">{order.orderNumber}</CardTitle>
              <div className="text-sm mt-1">
                {order.type === "dine-in" ? `Table ${order.tableNumber}` : (
                  <Badge className={order.type === "takeout" ? "bg-orange-500" : "bg-purple-500"}>
                    {order.type === "takeout" ? "TAKEAWAY" : "DELIVERY"}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              {order.priority === "urgent" && !isCompleted && <Badge className="bg-red-500"><AlertCircle className="h-3 w-3 mr-1" />URGENT</Badge>}
              <Badge className={getStatusColor(order.status, isOverdue)}>{order.status}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Order Time Display with Live Timer */}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs text-blue-600 font-semibold">Order Received</p>
                <p className="text-sm font-bold text-blue-900">{order.timestamp.toLocaleTimeString()}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-600 font-semibold">Time Elapsed</p>
              <p className={cn("text-2xl font-bold tabular-nums", isOverdue ? "text-red-600" : "text-blue-900")}>{elapsed}m</p>
            </div>
          </div>

          {/* Overdue Alert */}
          {isOverdue && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border-l-4 border-red-600 rounded">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-700">Order Overdue!</p>
                <p className="text-xs text-red-600">{elapsed - order.estimatedTime} min over standard time</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {order.items.map(item => (
              <div key={`${order.id}-${item.id}`} className="flex items-start gap-3 p-2 bg-gray-50 rounded">
                <div className="flex-shrink-0 mt-1">{getStationIcon(item.station)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{item.quantity}x</span>
                    <span className="text-sm">{item.name}</span>
                  </div>
                  {item.notes && (
                    <div className="mt-2 p-2.5 bg-gradient-to-r from-amber-100 to-orange-100 border-l-3 border-orange-500 rounded">
                      <p className="text-sm font-semibold text-gray-800"><span className="text-orange-700">NOTE:</span> {item.notes}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {item.status === "pending" && <Badge variant="outline">Pending</Badge>}
                  {item.status === "preparing" && <Badge className="bg-blue-500">Preparing</Badge>}
                  {item.status === "ready" && <Badge className="bg-green-500">Ready</Badge>}
                </div>
              </div>
            ))}
          </div>

          {order.notes && (
            <div className="p-4 bg-gradient-to-r from-amber-50 via-orange-50 to-red-50 border-l-4 border-orange-400 rounded-lg shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-orange-100">
                    <MessageSquare className="h-5 w-5 text-orange-600" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-orange-600 mb-1.5 uppercase tracking-wider">Chef's Note</p>
                  <p className="text-base font-semibold text-gray-800 break-words leading-relaxed">{order.notes}</p>
                </div>
              </div>
            </div>
          )}

          {!isCompleted && (
            <div className="flex gap-2 pt-2">
              <Button 
                className="flex-1 bg-emerald-600 hover:bg-emerald-700" 
                onClick={() => updateOrderStatus(order.id, order.type === "dine-in" ? "served" : "completed")}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Serve Order
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Kitchen Display System</h1>
            <p className="text-gray-600 mt-1">Live order tracking for kitchen staff</p>
            <p className="text-sm text-gray-500 mt-1">Current Time: {currentTime.toLocaleTimeString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-yellow-600">Pending</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-yellow-600">{stats.pending}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-blue-600">Preparing</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-blue-600">{stats.preparing}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-green-600">Ready</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">{stats.ready}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">Served</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-gray-600">{stats.served}</div></CardContent>
          </Card>
        </div>

        {loading ? (
          <Card><CardContent className="py-12 text-center text-gray-500">Loading orders...</CardContent></Card>
        ) : (
          <Tabs defaultValue="active">
            <TabsList className="mb-4">
              <TabsTrigger value="active">
                Active Orders
                {activeOrders.length > 0 && (
                  <Badge className="ml-2 bg-orange-500 text-white text-xs">{activeOrders.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed
                {completedOrders.length > 0 && (
                  <Badge className="ml-2 bg-gray-400 text-white text-xs">{completedOrders.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              {activeOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <ChefHat className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">No active orders in kitchen</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeOrders.map(order => renderOrderCard(order, false))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed">
              {completedOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">No completed orders yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedOrders.map(order => renderOrderCard(order, true))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

