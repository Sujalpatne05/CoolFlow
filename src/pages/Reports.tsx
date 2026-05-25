import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { IndianRupee, TrendingUp, ShoppingCart, Users, Download, BarChart3, PieChart as PieChartIcon, Calendar, X, Eye, Package, Zap, TrendingDown, FileText } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import jsPDF from "jspdf";
import { apiRequest } from "@/lib/api";

type Order = {
  id: number;
  items: string[];
  total: number;
  status: string;
  orderType?: string;
  paymentStatus?: string;
  created_at?: string;
};

type ReportOverview = {
  revenue: number;
  totalOrders: number;
  totalCustomers: number;
  topItems: Array<{ name: string; orders: number }>;
};

const COLORS = ["#FF6B35", "#004E89", "#1B6CA8", "#F7931E", "#FDB913", "#C1272D"];

const Reports = () => {
  const [overview, setOverview] = useState<ReportOverview>({
    revenue: 0,
    totalOrders: 0,
    totalCustomers: 0,
    topItems: [],
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [overviewData, ordersData] = await Promise.all([
          apiRequest<ReportOverview>("/reports/overview"),
          apiRequest<Order[]>("/orders", { method: "GET" }, true),
        ]);
        setOverview(overviewData);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
      } catch (error) {
        // Reports load error
      } finally {
        setLoading(false);
      }
    };
    void bootstrap();
  }, []);

  // Filter orders by selected date
  const filteredOrders = useMemo(() => {
    if (!selectedDate) return orders;
    return orders.filter(o => {
      if (!o.created_at) return false;
      const orderDate = new Date(o.created_at);
      const selectedDateStr = selectedDate.toDateString();
      return orderDate.toDateString() === selectedDateStr;
    });
  }, [orders, selectedDate]);

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

  // Calculate top selling items with quantities
  const topSellingItems = useMemo(() => {
    const itemCounts: { [key: string]: number } = {};
    filteredOrders.forEach((order) => {
      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const match = item.match(/^(.+?)\s+x(\d+)$/);
          const itemName = match ? match[1] : item;
          const qty = match ? Number(match[2]) : 1;
          itemCounts[itemName] = (itemCounts[itemName] || 0) + qty;
        });
      }
    });
    return Object.entries(itemCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredOrders]);

  // Calculate revenue by order type
  const revenueByType = useMemo(() => {
    const typeRevenue: { [key: string]: number } = {
      "dine-in": 0,
      "take-away": 0,
      delivery: 0,
    };
    filteredOrders.forEach((order) => {
      const type = order.orderType || "dine-in";
      typeRevenue[type] = (typeRevenue[type] || 0) + Number(order.total);
    });
    return Object.entries(typeRevenue).map(([name, value]) => ({
      name: name === "dine-in" ? "Dine-in" : name === "take-away" ? "Takeaway" : "Delivery",
      value,
    }));
  }, [filteredOrders]);

  // Calculate payment method breakdown
  const paymentMethodBreakdown = useMemo(() => {
    const methods: { [key: string]: number } = { cash: 0, card: 0, upi: 0 };
    filteredOrders.forEach((order) => {
      const method = order.paymentStatus === "paid" ? (order.paymentStatus || "cash") : "unpaid";
      if (method !== "unpaid") {
        methods[method] = (methods[method] || 0) + Number(order.total);
      }
    });
    return Object.entries(methods).map(([name, value]) => ({
      name: name.toUpperCase(),
      value,
    }));
  }, [filteredOrders]);

  // Daily revenue trend
  const dailyRevenue = useMemo(() => {
    const days: { [key: string]: number } = {};
    filteredOrders.forEach((order) => {
      if (order.created_at) {
        const date = new Date(order.created_at).toLocaleDateString("en-IN");
        days[date] = (days[date] || 0) + Number(order.total);
      }
    });
    return Object.entries(days)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7);
  }, [filteredOrders]);

  // Order type distribution
  const orderTypeDistribution = useMemo(() => {
    const types: { [key: string]: number } = { "dine-in": 0, "take-away": 0, delivery: 0 };
    filteredOrders.forEach((order) => {
      const type = order.orderType || "dine-in";
      types[type] = (types[type] || 0) + 1;
    });
    return Object.entries(types).map(([name, count]) => ({
      name: name === "dine-in" ? "Dine-in" : name === "take-away" ? "Takeaway" : "Delivery",
      count,
    }));
  }, [filteredOrders]);

  const handleDownload = (type: "pdf" | "csv") => {
    if (type === "csv") {
      const csvRows = [
        "Restaurant Report",
        `Generated: ${new Date().toLocaleString("en-IN")}`,
        selectedDate ? `Date: ${getDateLabel(selectedDate)}` : "Date: All Orders",
        "",
        "SUMMARY",
        `Total Revenue,Rs ${Math.round(overview.revenue).toLocaleString("en-IN")}`,
        `Total Orders,${overview.totalOrders}`,
        `Total Customers,${overview.totalCustomers}`,
        "",
        "TOP SELLING ITEMS",
        "Item,Quantity",
        ...topSellingItems.map((item) => `${item.name},${item.count}`),
        "",
        "REVENUE BY ORDER TYPE",
        "Type,Amount",
        ...revenueByType.map((item) => `${item.name},Rs ${item.value}`),
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `restaurant-report-${new Date().toISOString().split("T")[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const doc = new jsPDF();
    let yPos = 15;
    
    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text("Restaurant Report", 10, yPos);
    yPos += 10;
    
    // Generated date
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 10, yPos);
    yPos += 5;
    if (selectedDate) {
      doc.text(`Date: ${getDateLabel(selectedDate)}`, 10, yPos);
      yPos += 5;
    }
    yPos += 3;

    // Summary section
    doc.setFont(undefined, "bold");
    doc.text("SUMMARY", 10, yPos);
    yPos += 6;
    doc.setFont(undefined, "normal");
    doc.text(`Total Revenue: Rs ${Math.round(overview.revenue).toLocaleString("en-IN")}`, 12, yPos);
    yPos += 5;
    doc.text(`Total Orders: ${overview.totalOrders}`, 12, yPos);
    yPos += 5;
    doc.text(`Total Customers: ${overview.totalCustomers}`, 12, yPos);
    yPos += 10;

    // Top Selling Items section
    doc.setFont(undefined, "bold");
    doc.text("TOP SELLING ITEMS", 10, yPos);
    yPos += 6;
    doc.setFont(undefined, "normal");
    topSellingItems.slice(0, 10).forEach((item, idx) => {
      doc.text(`${idx + 1}. ${item.name} - ${item.count} units`, 12, yPos);
      yPos += 5;
      if (yPos > 270) {
        doc.addPage();
        yPos = 15;
      }
    });

    yPos += 5;
    
    // Revenue by Order Type section
    doc.setFont(undefined, "bold");
    doc.text("REVENUE BY ORDER TYPE", 10, yPos);
    yPos += 6;
    doc.setFont(undefined, "normal");
    revenueByType.forEach((item) => {
      doc.text(`${item.name}: Rs ${item.value.toLocaleString("en-IN")}`, 12, yPos);
      yPos += 5;
    });

    doc.save(`restaurant-report-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const topItemsChart = useMemo(() => {
    return overview.topItems && overview.topItems.length > 0 ? overview.topItems : [{ name: "No Data", orders: 0 }];
  }, [overview.topItems]);

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="text-orange-500 flex-shrink-0" size={24} /> Reports & Analytics
          </h1>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 mt-2 sm:mt-3">
            <button
              className="px-3 sm:px-4 py-2 rounded bg-orange-500 text-white font-semibold text-xs sm:text-sm hover:bg-orange-600 flex items-center gap-2 w-full sm:w-auto justify-center"
              onClick={() => handleDownload("pdf")}
            >
              <Download size={14} /> Download PDF
            </button>
            <button
              className="px-3 sm:px-4 py-2 rounded bg-blue-500 text-white font-semibold text-xs sm:text-sm hover:bg-blue-600 flex items-center gap-2 w-full sm:w-auto justify-center"
              onClick={() => handleDownload("csv")}
            >
              <Download size={14} /> Download CSV
            </button>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm mt-2">Comprehensive analytics and performance metrics</p>
        </div>

        {/* Enhanced Date Filter */}
        <Card className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200 shadow-md">
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-orange-600" />
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

              {/* Quick Date Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <button
                  onClick={() => handleQuickDate(0)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    selectedDate?.toDateString() === new Date().toDateString()
                      ? "bg-orange-600 text-white shadow-md"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-orange-50"
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => handleQuickDate(1)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    selectedDate?.toDateString() === new Date(Date.now() - 86400000).toDateString()
                      ? "bg-orange-600 text-white shadow-md"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-orange-50"
                  }`}
                >
                  Yesterday
                </button>
                <button
                  onClick={() => {
                    setSelectedDate(null);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    !selectedDate
                      ? "bg-purple-600 text-white shadow-md"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-purple-50"
                  }`}
                >
                  All Time
                </button>
              </div>

              {/* Custom Date Input */}
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-2 block">Select Date</label>
                <input
                  type="date"
                  value={selectedDate ? selectedDate.toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    setSelectedDate(e.target.value ? new Date(e.target.value) : null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                {selectedDate && (
                  <p className="text-xs text-orange-600 mt-2 font-semibold">📅 {getDateLabel(selectedDate)}</p>
                )}
              </div>

              {/* Filter Status */}
              {selectedDate && (
                <div className="bg-orange-100 border border-orange-300 rounded-lg p-3">
                  <p className="text-xs sm:text-sm text-orange-900 font-semibold">
                    📊 Showing {filteredOrders.length} orders for {getDateLabel(selectedDate)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <StatCard title="Total Revenue" value={`₹${Math.round(overview.revenue).toLocaleString("en-IN")}`} icon={<IndianRupee className="h-4 sm:h-5 w-4 sm:w-5" />} />
          <StatCard title="Total Orders" value={String(overview.totalOrders)} icon={<ShoppingCart className="h-4 sm:h-5 w-4 sm:w-5" />} />
          <StatCard title="Total Customers" value={String(overview.totalCustomers)} icon={<Users className="h-4 sm:h-5 w-4 sm:w-5" />} />
          <StatCard
            title="Avg Order Value"
            value={`₹${overview.totalOrders > 0 ? Math.round(overview.revenue / overview.totalOrders).toLocaleString("en-IN") : 0}`}
            icon={<TrendingUp className="h-4 sm:h-5 w-4 sm:w-5" />}
          />
        </div>

        {/* Prominent Navigation Options */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {/* Overview */}
          <button
            onClick={() => setActiveTab("overview")}
            className={`p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
              activeTab === "overview"
                ? "border-blue-500 bg-blue-50 shadow-lg"
                : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-md"
            }`}
          >
            <Eye className={`w-6 h-6 sm:w-7 sm:h-7 ${activeTab === "overview" ? "text-blue-600" : "text-gray-600"}`} />
            <span className={`text-xs sm:text-sm font-bold text-center ${activeTab === "overview" ? "text-blue-600" : "text-gray-700"}`}>
              Overview
            </span>
          </button>

          {/* Items */}
          <button
            onClick={() => setActiveTab("items")}
            className={`p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
              activeTab === "items"
                ? "border-green-500 bg-green-50 shadow-lg"
                : "border-gray-200 bg-white hover:border-green-300 hover:shadow-md"
            }`}
          >
            <Package className={`w-6 h-6 sm:w-7 sm:h-7 ${activeTab === "items" ? "text-green-600" : "text-gray-600"}`} />
            <span className={`text-xs sm:text-sm font-bold text-center ${activeTab === "items" ? "text-green-600" : "text-gray-700"}`}>
              Items
            </span>
          </button>

          {/* Breakdown */}
          <button
            onClick={() => setActiveTab("breakdown")}
            className={`p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2 hidden sm:flex ${
              activeTab === "breakdown"
                ? "border-purple-500 bg-purple-50 shadow-lg"
                : "border-gray-200 bg-white hover:border-purple-300 hover:shadow-md"
            }`}
          >
            <Zap className={`w-6 h-6 sm:w-7 sm:h-7 ${activeTab === "breakdown" ? "text-purple-600" : "text-gray-600"}`} />
            <span className={`text-xs sm:text-sm font-bold text-center ${activeTab === "breakdown" ? "text-purple-600" : "text-gray-700"}`}>
              Breakdown
            </span>
          </button>

          {/* Trends */}
          <button
            onClick={() => setActiveTab("trends")}
            className={`p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
              activeTab === "trends"
                ? "border-red-500 bg-red-50 shadow-lg"
                : "border-gray-200 bg-white hover:border-red-300 hover:shadow-md"
            }`}
          >
            <TrendingDown className={`w-6 h-6 sm:w-7 sm:h-7 ${activeTab === "trends" ? "text-red-600" : "text-gray-600"}`} />
            <span className={`text-xs sm:text-sm font-bold text-center ${activeTab === "trends" ? "text-red-600" : "text-gray-700"}`}>
              Trends
            </span>
          </button>

          {/* Tally */}
          <button
            onClick={() => setActiveTab("tally")}
            className={`p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
              activeTab === "tally"
                ? "border-orange-500 bg-orange-50 shadow-lg"
                : "border-gray-200 bg-white hover:border-orange-300 hover:shadow-md"
            }`}
          >
            <FileText className={`w-6 h-6 sm:w-7 sm:h-7 ${activeTab === "tally" ? "text-orange-600" : "text-gray-600"}`} />
            <span className={`text-xs sm:text-sm font-bold text-center ${activeTab === "tally" ? "text-orange-600" : "text-gray-700"}`}>
              Tally
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div>
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                {/* Revenue by Order Type */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <PieChartIcon size={20} className="text-orange-500" /> Revenue by Order Type
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={revenueByType} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value">
                          {revenueByType.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `₹${value}`} />
                        <Legend verticalAlign="bottom" height={36} formatter={(value, entry: any) => `${value}: ₹${entry.payload.value}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Order Type Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Order Type Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {orderTypeDistribution.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                          <span className="font-medium">{item.name}</span>
                          <Badge className="bg-orange-100 text-orange-800">{item.count} orders</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Top Items Tab */}
          {activeTab === "items" && (
            <div className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top 10 Selling Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topSellingItems}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#FF6B35" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Top Items List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Detailed Item Sales</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-2 px-3 font-semibold">Rank</th>
                          <th className="text-left py-2 px-3 font-semibold">Item Name</th>
                          <th className="text-right py-2 px-3 font-semibold">Quantity Sold</th>
                          <th className="text-right py-2 px-3 font-semibold">Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topSellingItems.map((item, idx) => {
                          const total = topSellingItems.reduce((sum, i) => sum + i.count, 0);
                          const percentage = ((item.count / total) * 100).toFixed(1);
                          return (
                            <tr key={idx} className="border-b hover:bg-gray-50">
                              <td className="py-2 px-3 font-bold text-orange-600">#{idx + 1}</td>
                              <td className="py-2 px-3">{item.name}</td>
                              <td className="py-2 px-3 text-right font-semibold">{item.count}</td>
                              <td className="py-2 px-3 text-right">
                                <Badge className="bg-blue-100 text-blue-800">{percentage}%</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Breakdown Tab */}
          {activeTab === "breakdown" && (
            <div className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Payment Method Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={paymentMethodBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => `₹${value}`} />
                      <Bar dataKey="value" fill="#004E89" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {paymentMethodBreakdown.map((item, idx) => (
                  <Card key={idx}>
                    <CardContent className="pt-6">
                      <p className="text-sm text-gray-600 mb-2">{item.name}</p>
                      <p className="text-2xl font-bold text-orange-600">₹{item.value.toLocaleString("en-IN")}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Trends Tab */}
          {activeTab === "trends" && (
            <div className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Daily Revenue Trend (Last 7 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dailyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(value) => `₹${value}`} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#FF6B35" strokeWidth={2} dot={{ fill: "#FF6B35", r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tally Tab */}
          {activeTab === "tally" && (
            <div className="space-y-2 sm:space-y-4 mt-3 sm:mt-4">
              {/* Period Selector - Compact Mobile */}
              <div className="flex gap-1 sm:gap-2">
                <button
                  onClick={() => setPeriod("daily")}
                  className={`flex-1 px-1 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-semibold transition ${period === "daily" ? "bg-orange-500 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setPeriod("weekly")}
                  className={`flex-1 px-1 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-semibold transition ${period === "weekly" ? "bg-orange-500 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setPeriod("monthly")}
                  className={`flex-1 px-1 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-semibold transition ${period === "monthly" ? "bg-orange-500 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  Monthly
                </button>
              </div>

              {/* Tally Summary - Compact Mobile */}
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-3 lg:gap-4">
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-2 sm:p-3 rounded-lg border border-green-200">
                  <p className="text-xs text-gray-600 mb-0.5">Revenue</p>
                  <p className="text-sm sm:text-xl lg:text-2xl font-bold text-green-600">₹{Math.round(overview.revenue).toLocaleString("en-IN")}</p>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-2 sm:p-3 rounded-lg border border-blue-200">
                  <p className="text-xs text-gray-600 mb-0.5">Orders</p>
                  <p className="text-sm sm:text-xl lg:text-2xl font-bold text-blue-600">{overview.totalOrders}</p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-2 sm:p-3 rounded-lg border border-purple-200">
                  <p className="text-xs text-gray-600 mb-0.5">Avg Value</p>
                  <p className="text-sm sm:text-xl lg:text-2xl font-bold text-purple-600">
                    ₹{overview.totalOrders > 0 ? Math.round(overview.revenue / overview.totalOrders).toLocaleString("en-IN") : 0}
                  </p>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-2 sm:p-3 rounded-lg border border-orange-200">
                  <p className="text-xs text-gray-600 mb-0.5">Customers</p>
                  <p className="text-sm sm:text-xl lg:text-2xl font-bold text-orange-600">{overview.totalCustomers}</p>
                </div>
              </div>

              {/* Payment Methods - Compact Mobile */}
              <Card className="shadow-sm">
                <CardHeader className="p-2 sm:p-4 pb-2 sm:pb-3">
                  <CardTitle className="text-xs sm:text-base">Payment Methods</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-4 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-3">
                    {paymentMethodBreakdown.map((item, idx) => (
                      <div key={idx} className="bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-3 rounded border">
                        <p className="text-xs text-gray-600 mb-0.5">{item.name}</p>
                        <p className="text-xs sm:text-base lg:text-lg font-bold text-orange-600">₹{item.value.toLocaleString("en-IN")}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Order Type Revenue - Compact Mobile */}
              <Card className="shadow-sm">
                <CardHeader className="p-2 sm:p-4 pb-2 sm:pb-3">
                  <CardTitle className="text-xs sm:text-base">Revenue by Type</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-4 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-3">
                    {revenueByType.map((item, idx) => (
                      <div key={idx} className="bg-gradient-to-br from-blue-50 to-blue-100 p-2 sm:p-3 rounded border border-blue-200">
                        <p className="text-xs text-gray-600 mb-0.5">{item.name}</p>
                        <p className="text-xs sm:text-base lg:text-lg font-bold text-blue-600">₹{item.value.toLocaleString("en-IN")}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Bills List - Compact Mobile */}
              <Card className="shadow-sm">
                <CardHeader className="p-2 sm:p-4 pb-2 sm:pb-3">
                  <CardTitle className="text-xs sm:text-base flex items-center gap-1">
                    <Calendar size={14} className="sm:w-5 sm:h-5" /> Bills ({filteredOrders.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-4">
                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold">Bill ID</th>
                          <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold hidden sm:table-cell">Type</th>
                          <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold hidden md:table-cell">Items</th>
                          <th className="text-center py-3 px-4 font-semibold">Payment</th>
                          <th className="text-right py-3 px-4 font-semibold">Amount</th>
                          <th className="text-center py-3 px-4 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((order) => (
                          <tr key={order.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4 font-medium text-orange-600">ORD-{order.id}</td>
                            <td className="py-3 px-4 hidden sm:table-cell">
                              <Badge
                                className={
                                  order.orderType === "dine-in"
                                    ? "bg-blue-100 text-blue-800"
                                    : order.orderType === "take-away"
                                    ? "bg-orange-100 text-orange-800"
                                    : "bg-purple-100 text-purple-800"
                                }
                              >
                                {order.orderType === "dine-in" ? "Dine-in" : order.orderType === "take-away" ? "Takeaway" : "Delivery"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-gray-600 truncate max-w-xs hidden md:table-cell">
                              {Array.isArray(order.items) ? order.items.join(", ") : "N/A"}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Badge className="bg-gray-100 text-gray-800">{order.paymentStatus === "paid" ? "Paid" : "Unpaid"}</Badge>
                            </td>
                            <td className="py-3 px-4 text-right font-bold">₹{Number(order.total).toLocaleString("en-IN")}</td>
                            <td className="py-3 px-4 text-center">
                              <Badge
                                className={
                                  order.status === "completed"
                                    ? "bg-green-100 text-green-800"
                                    : order.status === "pending"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-blue-100 text-blue-800"
                                }
                              >
                                {order.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Compact Card View */}
                  <div className="sm:hidden space-y-1.5">
                    {filteredOrders.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">
                        <p className="text-xs">No bills</p>
                      </div>
                    ) : (
                      filteredOrders.map((order) => (
                        <div key={order.id} className="bg-gradient-to-r from-gray-50 to-gray-100 p-2 rounded border border-gray-200">
                          {/* Row 1: Bill ID and Amount */}
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-orange-600 text-xs">ORD-{order.id}</span>
                            <span className="font-bold text-sm text-gray-900">₹{Number(order.total).toLocaleString("en-IN")}</span>
                          </div>

                          {/* Row 2: Type and Payment */}
                          <div className="flex justify-between items-center gap-1 mb-1">
                            <Badge
                              className={
                                order.orderType === "dine-in"
                                  ? "bg-blue-100 text-blue-800 text-xs"
                                  : order.orderType === "take-away"
                                  ? "bg-orange-100 text-orange-800 text-xs"
                                  : "bg-purple-100 text-purple-800 text-xs"
                              }
                            >
                              {order.orderType === "dine-in" ? "Dine-in" : order.orderType === "take-away" ? "Takeaway" : "Delivery"}
                            </Badge>
                            <Badge className="bg-gray-100 text-gray-800 text-xs">
                              {order.paymentStatus === "paid" ? "✓ Paid" : "Unpaid"}
                            </Badge>
                          </div>

                          {/* Row 3: Status */}
                          <Badge
                            className={
                              order.status === "completed"
                                ? "bg-green-100 text-green-800 text-xs"
                                : order.status === "pending"
                                ? "bg-yellow-100 text-yellow-800 text-xs"
                                : "bg-blue-100 text-blue-800 text-xs"
                            }
                          >
                            {order.status}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
