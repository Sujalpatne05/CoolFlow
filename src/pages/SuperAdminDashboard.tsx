import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Building, CreditCard, Users, BarChart2,
  ShieldCheck, TrendingUp, Activity, ArrowRight, RefreshCw,
  CheckCircle, Clock, XCircle
} from "lucide-react";
import { AreaChart, Area, CartesianGrid, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import SuperAdminLayout from "../components/SuperAdminLayout";
import { buildAuthHeaders } from "@/lib/session";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

const monthlyRevenue = [
  { month: "Jan", revenue: 1200000 }, { month: "Feb", revenue: 1480000 },
  { month: "Mar", revenue: 1640000 }, { month: "Apr", revenue: 1710000 },
  { month: "May", revenue: 1980000 }, { month: "Jun", revenue: 2160000 },
  { month: "Jul", revenue: 2290000 }, { month: "Aug", revenue: 2410000 },
  { month: "Sep", revenue: 2540000 }, { month: "Oct", revenue: 2630000 },
  { month: "Nov", revenue: 2790000 }, { month: "Dec", revenue: 3010000 },
];

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = async () => {
    try {
      const headers = buildAuthHeaders() || {};
      const [rRes, uRes, sRes] = await Promise.all([
        fetch(`${API_BASE_URL}/superadmin/restaurants`, { headers }),
        fetch(`${API_BASE_URL}/superadmin/users`, { headers }),
        fetch(`${API_BASE_URL}/superadmin/subscriptions`, { headers }),
      ]);
      const [rData, uData, sData] = await Promise.all([rRes.json(), uRes.json(), sRes.json()]);
      setRestaurants(Array.isArray(rData) ? rData : []);
      setUsers(Array.isArray(uData) ? uData : []);
      setSubscriptions(Array.isArray(sData) ? sData : []);
      setLastRefresh(new Date());
    } catch (e) { /* Dashboard load error */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const activeRestaurants = restaurants.filter(r => r.status === "Active").length;
  const totalAdmins = users.filter(u => u.role === "admin").length;
  const activeSubscriptions = subscriptions.filter(s => s.status === "active").length;
  const graceAccounts = subscriptions.filter(s => s.status === "grace").length;

  const kpis = [
    { title: "Total Restaurants", value: restaurants.length, sub: `${activeRestaurants} active`, icon: Building, color: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd", route: "/superadmin-restaurants" },
    { title: "Admin Users", value: totalAdmins, sub: "Across all restaurants", icon: Users, color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe", route: "/superadmin-users" },
    { title: "Active Subscriptions", value: activeSubscriptions, sub: `${graceAccounts} in grace period`, icon: CreditCard, color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0", route: "/superadmin-subscriptions" },
    { title: "Platform MRR", value: "\u20B930.1L", sub: "+12.4% this month", icon: TrendingUp, color: "#f97316", bg: "#fff7ed", border: "#fed7aa", route: "/superadmin-revenue" },
  ];

  const recentRestaurants = [...restaurants].reverse().slice(0, 5);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 p-6 text-white relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute -bottom-16 left-0 w-48 h-48 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide mb-3">
                <Activity className="h-3 w-3" /> Live Command Center
              </span>
              <h1 className="text-2xl font-extrabold sm:text-3xl">Super Admin Control Tower</h1>
              <p className="mt-2 text-sm text-cyan-100">
                Manage all restaurants, subscriptions, users and platform health from one place.
              </p>
              <p className="text-xs text-cyan-200 mt-1">Last refreshed: {lastRefresh.toLocaleTimeString()}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={load} className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 transition">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button onClick={() => navigate("/superadmin-restaurants")} className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold hover:bg-cyan-400 transition">
                Manage Restaurants <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map(kpi => (
            <div key={kpi.title} onClick={() => navigate(kpi.route)}
              className="cursor-pointer rounded-xl border p-5 hover:shadow-lg transition-all"
              style={{ background: kpi.bg, borderColor: kpi.border }}>
              <div className="flex justify-between items-start mb-4">
                <div className="rounded-lg p-2" style={{ background: kpi.color + "20" }}>
                  <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">{kpi.title}</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-1">{loading ? "..." : kpi.value}</p>
              <p className="text-xs text-gray-500 mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Revenue Chart */}
          <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-900">Platform Revenue Growth</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Last 12 months</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyRevenue}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={v => `?${(v/100000).toFixed(0)}L`} />
                  <Tooltip formatter={(v: number) => [`?${(v/100000).toFixed(1)}L`, "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#0284c7" fill="url(#revGrad)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              {[
                { label: "Add New Restaurant", icon: Building, color: "text-blue-600 bg-blue-50", route: "/superadmin-restaurants" },
                { label: "Manage Subscriptions", icon: CreditCard, color: "text-green-600 bg-green-50", route: "/superadmin-subscriptions" },
                { label: "View All Users", icon: Users, color: "text-purple-600 bg-purple-50", route: "/superadmin-users" },
                { label: "Revenue Reports", icon: BarChart2, color: "text-emerald-600 bg-emerald-50", route: "/superadmin-revenue" },
                { label: "Support Tickets", icon: AlertTriangle, color: "text-red-600 bg-red-50", route: "/superadmin-support" },
                { label: "System Settings", icon: ShieldCheck, color: "text-slate-600 bg-slate-50", route: "/superadmin-settings" },
              ].map(action => (
                <button key={action.label} onClick={() => navigate(action.route)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition text-left border border-gray-100">
                  <div className={`p-2 rounded-lg ${action.color}`}>
                    <action.icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{action.label}</span>
                  <ArrowRight className="h-4 w-4 text-gray-400 ml-auto" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Restaurants */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-900">Registered Restaurants</h2>
            <button onClick={() => navigate("/superadmin-restaurants")} className="text-sm font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1">
              View all <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : restaurants.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No restaurants registered yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Restaurant</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Owner</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">City</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Plan</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRestaurants.map(r => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-semibold text-gray-900">{r.name}</td>
                      <td className="py-3 px-4 text-gray-600">{r.owner}</td>
                      <td className="py-3 px-4 text-gray-600">{r.city || "?"}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{r.plan || "Standard"}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {r.status === "Active"
                          ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700"><CheckCircle className="h-3 w-3" /> Active</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700"><XCircle className="h-3 w-3" /> Inactive</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}