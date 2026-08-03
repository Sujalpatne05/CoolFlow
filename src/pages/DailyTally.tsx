import React, { useEffect, useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, TrendingUp, Download } from "lucide-react";
import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";

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
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
  orderType?: string;
  created_at?: string;
};

export default function DailyTally() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const headers = buildAuthHeaders();
        if (!headers) {
          clearAuthSession();
          navigate("/admin-login");
          return;
        }

        const response = await fetch(`${API_BASE_URL}/orders`, { headers });
        if (isAuthError(response.status)) {
          clearAuthSession();
          navigate("/admin-login");
          return;
        }

        const data = await response.json();
        if (Array.isArray(data)) {
          setOrders(data);
        }
      } catch (error) {
        // Daily tally load error
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [navigate]);

  const getDateRange = () => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    return { startOfDay, startOfWeek, startOfMonth };
  };

  const filterOrdersByPeriod = (orders: Order[], period: "daily" | "weekly" | "monthly") => {
    const { startOfDay, startOfWeek, startOfMonth } = getDateRange();
    const now = new Date();

    return orders.filter((order) => {
      if (!order.created_at) return false;
      const orderDate = new Date(order.created_at);

      switch (period) {
        case "daily":
          return orderDate >= startOfDay && orderDate <= now;
        case "weekly":
          return orderDate >= startOfWeek && orderDate <= now;
        case "monthly":
          return orderDate >= startOfMonth && orderDate <= now;
        default:
          return false;
      }
    });
  };

  const filteredOrders = useMemo(() => filterOrdersByPeriod(orders, period), [orders, period]);

  const stats = useMemo(() => {
    const paidOrders = filteredOrders.filter((o) => o.paymentStatus === "paid" || o.status === "completed");
    const unpaidOrders = filteredOrders.filter((o) => o.paymentStatus !== "paid" && o.status !== "completed");

    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const unpaidAmount = unpaidOrders.reduce((sum, o) => sum + Number(o.total), 0);

    const paymentMethods = {
      cash: paidOrders.filter((o) => o.paymentMethod === "cash").reduce((sum, o) => sum + Number(o.total), 0),
      card: paidOrders.filter((o) => o.paymentMethod === "card").reduce((sum, o) => sum + Number(o.total), 0),
      upi: paidOrders.filter((o) => o.paymentMethod === "upi").reduce((sum, o) => sum + Number(o.total), 0),
    };

    const orderTypes = {
      dineIn: paidOrders.filter((o) => o.orderType === "dine-in").reduce((sum, o) => sum + Number(o.total), 0),
      takeaway: paidOrders.filter((o) => o.orderType === "take-away").reduce((sum, o) => sum + Number(o.total), 0),
      delivery: paidOrders.filter((o) => o.orderType === "delivery").reduce((sum, o) => sum + Number(o.total), 0),
    };

    return {
      totalOrders: filteredOrders.length,
      paidOrders: paidOrders.length,
      unpaidOrders: unpaidOrders.length,
      totalRevenue,
      unpaidAmount,
      paymentMethods,
      orderTypes,
    };
  }, [filteredOrders]);

  const getPeriodLabel = () => {
    const today = new Date();
    switch (period) {
      case "daily":
        return today.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      case "weekly":
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return `${weekStart.toLocaleDateString("en-IN")} - ${weekEnd.toLocaleDateString("en-IN")}`;
      case "monthly":
        return today.toLocaleDateString("en-IN", { year: "numeric", month: "long" });
      default:
        return "";
    }
  };

  const handleExportReport = (format: "pdf" | "csv") => {
    if (format === "csv") {
      const csvRows = [
        "Daily Tally Report",
        `Generated: ${new Date().toLocaleString("en-IN")}`,
        `Period: ${getPeriodLabel()}`,
        "",
        "SUMMARY",
        `Total Revenue,Rs ${stats.totalRevenue.toLocaleString("en-IN")}`,
        `Total Orders,${stats.totalOrders}`,
        `Paid Orders,${stats.paidOrders}`,
        `Unpaid Orders,${stats.unpaidOrders}`,
        `Unpaid Amount,Rs ${stats.unpaidAmount.toLocaleString("en-IN")}`,
        "",
        "PAYMENT METHODS",
        `Cash,Rs ${stats.paymentMethods.cash.toLocaleString("en-IN")}`,
        `Card,Rs ${stats.paymentMethods.card.toLocaleString("en-IN")}`,
        `UPI,Rs ${stats.paymentMethods.upi.toLocaleString("en-IN")}`,
        "",
        "ORDER TYPES",
        `Dine-in,Rs ${stats.orderTypes.dineIn.toLocaleString("en-IN")}`,
        `Takeaway,Rs ${stats.orderTypes.takeaway.toLocaleString("en-IN")}`,
        `Delivery,Rs ${stats.orderTypes.delivery.toLocaleString("en-IN")}`,
        "",
        "BILLS",
        "Bill ID,Type,Items,Payment Method,Amount,Status",
        ...filteredOrders.map((order) => 
          `ORD-${order.id},${order.orderType || "N/A"},"${Array.isArray(order.items) ? order.items.join("; ") : "N/A"}",${order.paymentMethod || "N/A"},Rs ${order.total},${order.paymentStatus === "paid" || order.status === "completed" ? "Paid" : "Unpaid"}`
        ),
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `daily-tally-${new Date().toISOString().split("T")[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // PDF export
    const doc = new jsPDF();
    let yPos = 15;

    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text("Daily Tally Report", 10, yPos);
    yPos += 10;

    // Generated date and period
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 10, yPos);
    yPos += 5;
    doc.text(`Period: ${getPeriodLabel()}`, 10, yPos);
    yPos += 8;

    // Summary section
    doc.setFont(undefined, "bold");
    doc.text("SUMMARY", 10, yPos);
    yPos += 6;
    doc.setFont(undefined, "normal");
    doc.text(`Total Revenue: Rs ${stats.totalRevenue.toLocaleString("en-IN")}`, 12, yPos);
    yPos += 5;
    doc.text(`Total Orders: ${stats.totalOrders}`, 12, yPos);
    yPos += 5;
    doc.text(`Paid Orders: ${stats.paidOrders}`, 12, yPos);
    yPos += 5;
    doc.text(`Unpaid Orders: ${stats.unpaidOrders}`, 12, yPos);
    yPos += 5;
    doc.text(`Unpaid Amount: Rs ${stats.unpaidAmount.toLocaleString("en-IN")}`, 12, yPos);
    yPos += 10;

    // Payment Methods section
    doc.setFont(undefined, "bold");
    doc.text("PAYMENT METHODS", 10, yPos);
    yPos += 6;
    doc.setFont(undefined, "normal");
    doc.text(`Cash: Rs ${stats.paymentMethods.cash.toLocaleString("en-IN")}`, 12, yPos);
    yPos += 5;
    doc.text(`Card: Rs ${stats.paymentMethods.card.toLocaleString("en-IN")}`, 12, yPos);
    yPos += 5;
    doc.text(`UPI: Rs ${stats.paymentMethods.upi.toLocaleString("en-IN")}`, 12, yPos);
    yPos += 10;

    // Order Types section
    doc.setFont(undefined, "bold");
    doc.text("ORDER TYPES", 10, yPos);
    yPos += 6;
    doc.setFont(undefined, "normal");
    doc.text(`Dine-in: Rs ${stats.orderTypes.dineIn.toLocaleString("en-IN")}`, 12, yPos);
    yPos += 5;
    doc.text(`Takeaway: Rs ${stats.orderTypes.takeaway.toLocaleString("en-IN")}`, 12, yPos);
    yPos += 5;
    doc.text(`Delivery: Rs ${stats.orderTypes.delivery.toLocaleString("en-IN")}`, 12, yPos);

    doc.save(`daily-tally-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary-600 flex items-center gap-2">
              <Calendar className="text-primary-500" /> Daily Tally Report
            </h1>
            <p className="text-gray-600 mt-1">Track your revenue and bills</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleExportReport("pdf")} className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white">
              <Download size={16} /> Export PDF
            </Button>
            <Button onClick={() => handleExportReport("csv")} variant="outline" className="flex items-center gap-2">
              <Download size={16} /> Export CSV
            </Button>
          </div>
        </div>

        {/* Period Selector */}
        <Tabs value={period} onValueChange={(v) => setPeriod(v as "daily" | "weekly" | "monthly")}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Period Info */}
        <Card className="bg-gradient-to-r from-primary-50 to-yellow-50 border-primary-200">
          <CardContent className="pt-6">
            <p className="text-lg font-semibold text-primary-700">{getPeriodLabel()}</p>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">₹{stats.totalRevenue.toLocaleString("en-IN")}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.paidOrders} paid orders</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Unpaid Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">₹{stats.unpaidAmount.toLocaleString("en-IN")}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.unpaidOrders} unpaid orders</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">{stats.totalOrders}</p>
              <p className="text-xs text-gray-500 mt-1">All orders</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Order Value</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-purple-600">
                ₹{stats.totalOrders > 0 ? Math.round(stats.totalRevenue / stats.totalOrders).toLocaleString("en-IN") : 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Per order</p>
            </CardContent>
          </Card>
        </div>

        {/* Payment Methods Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Methods Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-gray-600 mb-1">Cash</p>
                <p className="text-2xl font-bold text-green-600">₹{stats.paymentMethods.cash.toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-600 mb-1">Card</p>
                <p className="text-2xl font-bold text-blue-600">₹{stats.paymentMethods.card.toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <p className="text-sm text-gray-600 mb-1">UPI</p>
                <p className="text-2xl font-bold text-purple-600">₹{stats.paymentMethods.upi.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Types Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue by Order Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-600 mb-1">Dine-in</p>
                <p className="text-2xl font-bold text-blue-600">₹{stats.orderTypes.dineIn.toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-primary-50 p-4 rounded-lg border border-primary-200">
                <p className="text-sm text-gray-600 mb-1">Takeaway</p>
                <p className="text-2xl font-bold text-primary-600">₹{stats.orderTypes.takeaway.toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <p className="text-sm text-gray-600 mb-1">Delivery</p>
                <p className="text-2xl font-bold text-purple-600">₹{stats.orderTypes.delivery.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bills List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Bills ({filteredOrders.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading bills...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No bills found for this period</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-3 px-4 font-semibold">Bill ID</th>
                      <th className="text-left py-3 px-4 font-semibold">Type</th>
                      <th className="text-left py-3 px-4 font-semibold">Items</th>
                      <th className="text-center py-3 px-4 font-semibold">Payment</th>
                      <th className="text-right py-3 px-4 font-semibold">Amount</th>
                      <th className="text-center py-3 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-primary-600">ORD-{order.id}</td>
                        <td className="py-3 px-4">
                          <Badge
                            className={
                              order.orderType === "dine-in"
                                ? "bg-blue-100 text-blue-800"
                                : order.orderType === "take-away"
                                ? "bg-primary-100 text-primary-800"
                                : "bg-purple-100 text-purple-800"
                            }
                          >
                            {order.orderType === "dine-in" ? "Dine-in" : order.orderType === "take-away" ? "Takeaway" : "Delivery"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-gray-600 truncate max-w-xs">
                          {Array.isArray(order.items) ? order.items.join(", ") : "N/A"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge
                            className={
                              order.paymentMethod === "cash"
                                ? "bg-green-100 text-green-800"
                                : order.paymentMethod === "card"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-purple-100 text-purple-800"
                            }
                          >
                            {order.paymentMethod?.toUpperCase() || "N/A"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right font-bold">₹{order.total.toLocaleString("en-IN")}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge
                            className={
                              order.paymentStatus === "paid" || order.status === "completed"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }
                          >
                            {order.paymentStatus === "paid" || order.status === "completed" ? "Paid" : "Unpaid"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
