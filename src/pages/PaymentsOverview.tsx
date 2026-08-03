import React, { useEffect, useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Banknote, Smartphone, TrendingUp, Eye, EyeOff } from "lucide-react";
import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

type Order = {
  id: number;
  items: string[];
  total: number;
  table_number?: number | null;
  status: string;
  paymentMethod: string;
  orderType?: string;
  paymentStatus?: string;
  createdAt?: string;
};

type PaymentMethod = "card" | "cash" | "upi" | "all";

export default function PaymentsOverview() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const headers = buildAuthHeaders();
        if (!headers) {
          clearAuthSession();
          window.location.href = "/admin-login";
          return;
        }

        const response = await fetch(`${API_BASE_URL}/orders`, { headers });
        if (isAuthError(response.status)) {
          clearAuthSession();
          window.location.href = "/admin-login";
          return;
        }

        const data = await response.json();
        setOrders(Array.isArray(data) ? data : []);
      } catch (error) {
        // Payments load error
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, []);

  // Calculate payment statistics
  const paymentStats = useMemo(() => {
    const stats = {
      all: { total: 0, count: 0, orders: [] as Order[] },
      card: { total: 0, count: 0, orders: [] as Order[] },
      cash: { total: 0, count: 0, orders: [] as Order[] },
      upi: { total: 0, count: 0, orders: [] as Order[] },
    };

    orders.forEach((order) => {
      stats.all.total += Number(order.total);
      stats.all.count += 1;
      stats.all.orders.push(order);

      const method = (order.paymentMethod || "cash").toLowerCase() as PaymentMethod;
      if (method !== "all" && stats[method]) {
        stats[method].total += Number(order.total);
        stats[method].count += 1;
        stats[method].orders.push(order);
      }
    });

    return stats;
  }, [orders]);

  const currentStats = paymentStats[selectedPaymentMethod];
  const totalRevenue = paymentStats.all.total;

  const getPaymentIcon = (method: PaymentMethod) => {
    switch (method) {
      case "card":
        return <CreditCard className="h-5 w-5" />;
      case "cash":
        return <Banknote className="h-5 w-5" />;
      case "upi":
        return <Smartphone className="h-5 w-5" />;
      case "all":
        return <TrendingUp className="h-5 w-5" />;
      default:
        return <CreditCard className="h-5 w-5" />;
    }
  };

  const getPaymentColor = (method: PaymentMethod) => {
    switch (method) {
      case "card":
        return "bg-blue-100 text-blue-700 border-blue-300";
      case "cash":
        return "bg-green-100 text-green-700 border-green-300";
      case "upi":
        return "bg-purple-100 text-purple-700 border-purple-300";
      case "all":
        return "bg-primary-100 text-primary-700 border-primary-300";
      default:
        return "bg-gray-100 text-gray-700 border-gray-300";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
      case "served":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "preparing":
      case "in progress":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
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
        return "bg-primary-100 text-primary-800";
      case "delivery":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary-600">Payments Overview</h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Track payments by method and view order details</p>
          </div>
          <div className="bg-gradient-to-r from-primary-500 to-secondary-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg shadow-lg w-full sm:w-fit">
            <p className="text-xs sm:text-sm opacity-90">Total Revenue</p>
            <p className="text-2xl sm:text-3xl font-bold">₹{totalRevenue.toLocaleString("en-IN")}</p>
          </div>
        </div>

        {/* Payment Method Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Card Payments */}
          <Card
            className={`cursor-pointer transition-all ${
              selectedPaymentMethod === "card" ? "ring-2 ring-blue-500 shadow-lg" : "hover:shadow-md"
            }`}
            onClick={() => setSelectedPaymentMethod("card")}
          >
            <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base sm:text-lg font-bold text-gray-900">Card Payments</CardTitle>
                <div className="bg-blue-100 p-1.5 sm:p-2 rounded-lg flex-shrink-0">
                  <CreditCard className="h-4 sm:h-5 w-4 sm:w-5 text-blue-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="space-y-2">
                <p className="text-2xl sm:text-3xl font-bold text-blue-600">₹{paymentStats.card.total.toLocaleString("en-IN")}</p>
                <p className="text-xs sm:text-sm font-semibold text-gray-900">{paymentStats.card.count} transactions</p>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2 sm:mt-3">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${totalRevenue > 0 ? (paymentStats.card.total / totalRevenue) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cash Payments */}
          <Card
            className={`cursor-pointer transition-all ${
              selectedPaymentMethod === "cash" ? "ring-2 ring-green-500 shadow-lg" : "hover:shadow-md"
            }`}
            onClick={() => setSelectedPaymentMethod("cash")}
          >
            <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base sm:text-lg font-bold text-gray-900">Cash Payments</CardTitle>
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg flex-shrink-0">
                  <Banknote className="h-4 sm:h-5 w-4 sm:w-5 text-green-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="space-y-2">
                <p className="text-2xl sm:text-3xl font-bold text-green-600">₹{paymentStats.cash.total.toLocaleString("en-IN")}</p>
                <p className="text-xs sm:text-sm font-semibold text-gray-900">{paymentStats.cash.count} transactions</p>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2 sm:mt-3">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${totalRevenue > 0 ? (paymentStats.cash.total / totalRevenue) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* UPI Payments */}
          <Card
            className={`cursor-pointer transition-all ${
              selectedPaymentMethod === "upi" ? "ring-2 ring-purple-500 shadow-lg" : "hover:shadow-md"
            }`}
            onClick={() => setSelectedPaymentMethod("upi")}
          >
            <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base sm:text-lg font-bold text-gray-900">UPI Payments</CardTitle>
                <div className="bg-purple-100 p-1.5 sm:p-2 rounded-lg flex-shrink-0">
                  <Smartphone className="h-4 sm:h-5 w-4 sm:w-5 text-purple-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="space-y-2">
                <p className="text-2xl sm:text-3xl font-bold text-purple-600">₹{paymentStats.upi.total.toLocaleString("en-IN")}</p>
                <p className="text-xs sm:text-sm font-semibold text-gray-900">{paymentStats.upi.count} transactions</p>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2 sm:mt-3">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${totalRevenue > 0 ? (paymentStats.upi.total / totalRevenue) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orders List */}
        <Card className="shadow-lg">
          <CardHeader className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
              <CardTitle className="text-base sm:text-xl flex items-center gap-2">
                {getPaymentIcon(selectedPaymentMethod)}
                <span className="truncate">{selectedPaymentMethod.charAt(0).toUpperCase() + selectedPaymentMethod.slice(1)} Payment Orders</span>
              </CardTitle>
              <Badge className={`${getPaymentColor(selectedPaymentMethod)} text-xs sm:text-sm whitespace-nowrap`}>
                {currentStats.count} orders • ₹{currentStats.total.toLocaleString("en-IN")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            {loading ? (
              <div className="text-center py-8 text-gray-500 text-sm">Loading orders...</div>
            ) : currentStats.orders.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">No orders found for this payment method</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border -mx-3 sm:mx-0">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold">Order ID</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold hidden sm:table-cell">Items</th>
                      <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-semibold">Type</th>
                      <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-semibold hidden md:table-cell">Table</th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold">Amount</th>
                      <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-semibold hidden lg:table-cell">Status</th>
                      <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentStats.orders.map((order) => (
                      <tr key={order.id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="py-2 sm:py-3 px-2 sm:px-4 font-medium text-blue-600 text-xs sm:text-sm">#{order.id}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 hidden sm:table-cell">
                          <div className="max-w-xs">
                            <p className="text-gray-700 truncate text-xs sm:text-sm">
                              {Array.isArray(order.items) ? order.items.join(", ") : "N/A"}
                            </p>
                          </div>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center">
                          <Badge className={`${getOrderTypeColor(order.orderType)} text-xs`}>
                            {getOrderTypeLabel(order.orderType)}
                          </Badge>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center hidden md:table-cell">
                          {order.table_number ? (
                            <Badge className="bg-primary-100 text-primary-700 text-xs">Table {order.table_number}</Badge>
                          ) : (
                            <span className="text-gray-500 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-right font-bold text-primary-600 text-xs sm:text-sm">
                          ₹{Number(order.total).toLocaleString("en-IN")}
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center hidden lg:table-cell">
                          <Badge className={`${getStatusColor(order.status)} text-xs`}>
                            {order.status || "Pending"}
                          </Badge>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowOrderDetails(true);
                            }}
                            className="text-blue-600 hover:text-blue-700 h-8 w-8 p-0"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Details Modal */}
        <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">Order Details - #{selectedOrder?.id}</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4 sm:space-y-6">
                {/* Order Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <p className="text-xs sm:text-sm text-gray-600">Order ID</p>
                    <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">#{selectedOrder.id}</p>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <p className="text-xs sm:text-sm text-gray-600">Order Type</p>
                    <Badge className={`${getOrderTypeColor(selectedOrder.orderType)} mt-1 text-xs`}>
                      {getOrderTypeLabel(selectedOrder.orderType)}
                    </Badge>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <p className="text-xs sm:text-sm text-gray-600">Payment Method</p>
                    <div className="flex items-center gap-2 mt-1">
                      {getPaymentIcon(selectedPaymentMethod)}
                      <p className="text-base sm:text-lg font-bold capitalize">{selectedPaymentMethod}</p>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <p className="text-xs sm:text-sm text-gray-600">Payment Status</p>
                    <p className={`text-base sm:text-lg font-bold mt-1 ${selectedOrder.paymentStatus === "paid" ? "text-green-600" : "text-primary-600"}`}>
                      {selectedOrder.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <p className="text-xs sm:text-sm text-gray-600">Table Number</p>
                    <p className="text-xl sm:text-2xl font-bold text-primary-600 mt-1">
                      {selectedOrder.table_number ? `Table ${selectedOrder.table_number}` : "N/A"}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <p className="text-xs sm:text-sm text-gray-600">Status</p>
                    <Badge className={`${getStatusColor(selectedOrder.status)} mt-1 text-xs`}>
                      {selectedOrder.status || "Pending"}
                    </Badge>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <h3 className="font-semibold text-base sm:text-lg mb-2 sm:mb-3">Order Items</h3>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-4 space-y-2">
                    {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                      selectedOrder.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 border-b last:border-0">
                          <span className="text-gray-700 text-xs sm:text-sm">{item}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-xs sm:text-sm">No items</p>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="bg-gradient-to-r from-primary-50 to-yellow-50 p-3 sm:p-4 rounded-lg border-2 border-primary-200">
                  <div className="flex justify-between items-center">
                    <span className="text-base sm:text-lg font-semibold text-gray-700">Total Amount</span>
                    <span className="text-2xl sm:text-3xl font-bold text-primary-600">₹{Number(selectedOrder.total).toLocaleString("en-IN")}</span>
                  </div>
                </div>

                {/* Close Button */}
                <Button onClick={() => setShowOrderDetails(false)} className="w-full text-sm">
                  Close
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
