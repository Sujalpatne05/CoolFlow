import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/StatCard";
import { ShoppingCart, Clock, CheckCircle, Truck, Calendar, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";
import { PrintBillButton } from "@/components/PrintBillButton";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

type OrderStatus = "pending" | "preparing" | "ready" | "served" | "completed";

type ApiOrder = {
  id: number;
  user_id: number;
  table_number?: number | null;
  items: string[];
  total: string | number;
  status: OrderStatus;
  orderType?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  created_at?: string;
  tableSection?: string;
};

type Order = {
  id: number;
  tableNumber: number | null;
  tableSection?: string;
  items: string[];
  total: number;
  status: OrderStatus;
  orderType?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  createdAt: Date;
};

const statusStyle: Record<OrderStatus, string> = {
  pending: "bg-yellow-500 text-white",
  preparing: "bg-blue-500 text-white",
  ready: "bg-green-600 text-white",
  served: "bg-gray-500 text-white",
  completed: "bg-green-700 text-white",
};

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);

  const goToLogin = (message = "Session expired. Please login again.") => {
    setError(message);
    clearAuthSession();
    setTimeout(() => navigate("/admin-login"), 300);
  };

  const loadOrders = async () => {
    try {
      setError("");
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
        setError(data?.error || "Unable to load orders.");
        return;
      }

      const mapped = (Array.isArray(data) ? data : []).map((order: ApiOrder) => {
        // Use actual status from backend - kitchen controls the workflow
        // For takeaway/delivery, treat 'served' as 'completed' in display
        let displayStatus = order.status || "pending";
        if ((order.orderType === "take-away" || order.orderType === "delivery") && displayStatus === "served") {
          displayStatus = "completed";
        }
        
        return {
          id: order.id,
          tableNumber: order.table_number ?? null,
          tableSection: order.tableSection || "Main Hall",
          items: Array.isArray(order.items) ? order.items : [],
          total: Number(order.total),
          status: displayStatus,
          orderType: order.orderType,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          createdAt: order.created_at ? new Date(order.created_at) : new Date(),
        };
      });

      setOrders(mapped);
    } catch (e) {
      setError("Unable to connect to backend.");
    }
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(
    () => {
      let filteredByDate = orders;

      // Filter by single selected date
      if (selectedDate) {
        filteredByDate = filteredByDate.filter(o => {
          const orderDate = new Date(o.createdAt);
          const selectedDateStr = selectedDate.toDateString();
          return orderDate.toDateString() === selectedDateStr;
        });
      }

      // Filter by date range (From/To)
      if (fromDate || toDate) {
        filteredByDate = filteredByDate.filter(o => {
          const orderDate = new Date(o.createdAt);
          
          if (fromDate) {
            const fromDateStart = new Date(fromDate);
            fromDateStart.setHours(0, 0, 0, 0);
            if (orderDate < fromDateStart) return false;
          }
          
          if (toDate) {
            const toDateEnd = new Date(toDate);
            toDateEnd.setHours(23, 59, 59, 999);
            if (orderDate > toDateEnd) return false;
          }
          
          return true;
        });
      }

      return {
        pending: filteredByDate.filter((o) => o.status === "pending").length,
        preparing: filteredByDate.filter((o) => o.status === "preparing").length,
        ready: filteredByDate.filter((o) => o.status === "ready").length,
        served: filteredByDate.filter((o) => o.status === "served").length,
        completed: filteredByDate.filter((o) => o.status === "completed").length,
        total: filteredByDate.length,
      };
    },
    [orders, selectedDate, fromDate, toDate],
  );

  const getDateLabel = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  };

  const handleQuickDate = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    setSelectedDate(date);
  };

  const clearFilters = () => {
    setSelectedDate(null);
  };

  const getOrderTypeLabel = (orderType?: string) => {
    switch (orderType) {
      case "dine-in":
        return "Dine-in";
      case "take-away":
        return "Takeaway";
      case "delivery":
        return "Delivery";
      default:
        return "Order";
    }
  };

  const getOrderTypeColor = (orderType?: string) => {
    switch (orderType) {
      case "dine-in":
        return "bg-blue-100 text-blue-800";
      case "take-away":
        return "bg-teal-100 text-teal-800";
      case "delivery":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPaymentMethodLabel = (method?: string) => {
    if (!method) return "Not specified";
    return method.toUpperCase();
  };

  const renderOrders = (filter: "all" | OrderStatus) => {
    let filteredByDate = orders;
    
    // Filter by single selected date
    if (selectedDate) {
      filteredByDate = filteredByDate.filter(o => {
        const orderDate = new Date(o.createdAt);
        const selectedDateStr = selectedDate.toDateString();
        return orderDate.toDateString() === selectedDateStr;
      });
    }

    // Filter by date range (From/To)
    if (fromDate || toDate) {
      filteredByDate = filteredByDate.filter(o => {
        const orderDate = new Date(o.createdAt);
        
        if (fromDate) {
          const fromDateStart = new Date(fromDate);
          fromDateStart.setHours(0, 0, 0, 0);
          if (orderDate < fromDateStart) return false;
        }
        
        if (toDate) {
          const toDateEnd = new Date(toDate);
          toDateEnd.setHours(23, 59, 59, 999);
          if (orderDate > toDateEnd) return false;
        }
        
        return true;
      });
    }

    const list = filter === "all" ? filteredByDate : filteredByDate.filter((order) => order.status === filter);

    if (list.length === 0) {
      const dateText = selectedDate ? `for ${getDateLabel(selectedDate)}` : "at this time";
      return <p className="text-xs sm:text-sm text-muted-foreground">No orders found {dateText}.</p>;
    }

    return (
      <div className="grid gap-3 sm:gap-4">
        {list.map((order) => (
          <Card key={order.id} className="shadow-card overflow-hidden hover:shadow-lg transition-shadow duration-200">
            <CardContent className="p-0">
              <div className="flex gap-0">
                {/* Large Table Number Badge on Left */}
                {order.tableNumber !== null ? (
                  <div className="bg-gradient-to-b from-red-500 to-red-600 text-white flex flex-col items-center justify-center flex-shrink-0 w-20 sm:w-24 rounded-r-lg shadow-md">
                    <p className="text-xs font-semibold">TABLE</p>
                    <p className="text-4xl sm:text-5xl font-bold leading-none">{order.tableNumber}</p>
                  </div>
                ) : (
                  <div className="bg-gradient-to-b from-gray-400 to-gray-500 text-white flex items-center justify-center flex-shrink-0 w-20 sm:w-24 rounded-r-lg shadow-md">
                    <p className="text-xs font-semibold">NO TABLE</p>
                  </div>
                )}

                {/* Order Details */}
                <div className="flex-1 p-3 sm:p-4 bg-gradient-to-r from-white to-gray-50">
                  <div className="flex flex-col gap-2 sm:gap-3">
                    {/* Header Row - Order ID and Amount */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm sm:text-base text-gray-900">ORD-{order.id}</span>
                          <span className="text-xs text-gray-500">•</span>
                          <span className="text-sm sm:text-base font-semibold text-green-600">Rs. {order.total.toLocaleString("en-IN")}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{order.createdAt.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        <Badge className={`${statusStyle[order.status]} text-xs font-semibold`}>{order.status.toUpperCase()}</Badge>
                        <Badge className={`${getOrderTypeColor(order.orderType)} text-xs font-semibold`}>
                          {getOrderTypeLabel(order.orderType)}
                        </Badge>
                      </div>
                    </div>

                    {/* Items - with better styling */}
                    <div className="bg-white rounded px-2 py-1.5 border border-gray-200">
                      <p className="text-xs text-gray-600 font-semibold mb-1">Items:</p>
                      <p className="text-xs sm:text-sm break-words text-gray-800 font-medium">
                        {order.items.map((item: any) => {
                          if (typeof item === 'object' && item !== null) {
                            return `${item.name} x${item.qty}`;
                          }
                          return item;
                        }).join(", ")}
                      </p>
                    </div>

                    {/* Footer Row - Payment Info */}
                    <div className="flex flex-col gap-3 pt-2 border-t border-gray-200">
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-600">Payment: </span>
                          <span className="font-semibold text-gray-900">{getPaymentMethodLabel(order.paymentMethod)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-600">Status</span>
                          <span className={`font-semibold ${order.paymentStatus === "paid" ? "text-green-600" : "text-teal-600"}`}>
                            {order.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                          </span>
                        </div>
                      </div>
                      <PrintBillButton
                        orderId={order.id}
                        className="w-full sm:w-auto border-teal-300 text-teal-700 hover:bg-teal-50 hover:text-gray-950"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Orders</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Live order feed from billing and kitchen</p>
        </div>

        {error && <div className="text-xs sm:text-sm text-red-600">{error}</div>}

        {/* Enhanced Date Filter */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 shadow-md">
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    Smart Date Filter
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">Quick date selection</p>
                </div>
                {selectedDate && (
                  <button
                    onClick={clearFilters}
                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <X className="w-4 h-4" /> Clear
                  </button>
                )}
              </div>

              {/* All Date Filters in One Line - Left: Quick buttons, Right: Date inputs */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-4 items-end justify-between">
                  {/* Left Side - Quick Date Buttons */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-gray-700">Quick Selection</label>
                    <div className="flex gap-2 items-end">
                      <button
                        onClick={() => handleQuickDate(0)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                          selectedDate?.toDateString() === new Date().toDateString()
                            ? "bg-emerald-600 text-white shadow-md"
                            : "bg-white border border-gray-300 text-gray-700 hover:bg-emerald-50"
                        }`}
                      >
                        Today
                      </button>
                      <button
                        onClick={() => handleQuickDate(1)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                          selectedDate?.toDateString() === new Date(Date.now() - 86400000).toDateString()
                            ? "bg-emerald-600 text-white shadow-md"
                            : "bg-white border border-gray-300 text-gray-700 hover:bg-emerald-50"
                        }`}
                      >
                        Yesterday
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDate(null);
                          setFromDate(null);
                          setToDate(null);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                          !selectedDate && !fromDate && !toDate
                            ? "bg-purple-600 text-white shadow-md"
                            : "bg-white border border-gray-300 text-gray-700 hover:bg-purple-50"
                        }`}
                      >
                        All Time
                      </button>
                    </div>
                  </div>

                  {/* Right Side - Date Inputs with individual labels */}
                  <div className="flex gap-3 items-end">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-gray-700">Single Day</label>
                      <input
                        type="date"
                        value={selectedDate ? selectedDate.toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          setSelectedDate(e.target.value ? new Date(e.target.value) : null);
                          setFromDate(null);
                          setToDate(null);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        title="Single date"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-gray-700">From</label>
                      <input
                        type="date"
                        value={fromDate ? fromDate.toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          setFromDate(e.target.value ? new Date(e.target.value) : null);
                          setSelectedDate(null);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        title="From date"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-gray-700">To</label>
                      <input
                        type="date"
                        value={toDate ? toDate.toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          setToDate(e.target.value ? new Date(e.target.value) : null);
                          setSelectedDate(null);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        title="To date"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {selectedDate && (
                <p className="text-xs text-blue-600 font-semibold">📅 {getDateLabel(selectedDate)}</p>
              )}

              {/* Filter Status */}
              {selectedDate && (
                <div className="bg-blue-100 border border-blue-300 rounded-lg p-3">
                  <p className="text-xs sm:text-sm text-blue-900 font-semibold">
                    📊 Showing {stats.total} orders for {getDateLabel(selectedDate)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
          <StatCard title="Pending" value={String(stats.pending)} icon={<ShoppingCart className="h-4 sm:h-5 w-4 sm:w-5" />} />
          <StatCard title="Preparing" value={String(stats.preparing)} icon={<Clock className="h-4 sm:h-5 w-4 sm:w-5" />} />
          <StatCard title="Ready" value={String(stats.ready)} icon={<CheckCircle className="h-4 sm:h-5 w-4 sm:w-5" />} />
          <StatCard title="Served" value={String(stats.served)} icon={<Truck className="h-4 sm:h-5 w-4 sm:w-5" />} />
          <StatCard title="Completed" value={String(stats.completed)} icon={<CheckCircle className="h-4 sm:h-5 w-4 sm:w-5" />} />
        </div>

        <Tabs defaultValue="all">
          <TabsList className="w-full grid grid-cols-3 sm:grid-cols-6 gap-1 sm:gap-0">
            <TabsTrigger value="all" className="text-xs sm:text-sm">All</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs sm:text-sm">Pending</TabsTrigger>
            <TabsTrigger value="preparing" className="text-xs sm:text-sm">Prep</TabsTrigger>
            <TabsTrigger value="ready" className="text-xs sm:text-sm hidden sm:inline-flex">Ready</TabsTrigger>
            <TabsTrigger value="served" className="text-xs sm:text-sm hidden sm:inline-flex">Served</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm">Done</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">{renderOrders("all")}</TabsContent>
          <TabsContent value="pending" className="mt-4">{renderOrders("pending")}</TabsContent>
          <TabsContent value="preparing" className="mt-4">{renderOrders("preparing")}</TabsContent>
          <TabsContent value="ready" className="mt-4">{renderOrders("ready")}</TabsContent>
          <TabsContent value="served" className="mt-4">{renderOrders("served")}</TabsContent>
          <TabsContent value="completed" className="mt-4">{renderOrders("completed")}</TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
