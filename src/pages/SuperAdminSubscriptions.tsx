import React, { useEffect, useMemo, useState } from "react";
import SuperAdminLayout from "../components/SuperAdminLayout";
import {
  AlertTriangle,
  BadgeCheck,
  CreditCard,
  PauseCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/api";

type SubscriptionStatus = "Active" | "Grace" | "Suspended" | "Inactive";

type Subscription = {
  id: number;
  name: string;
  owner: string;
  plan: "Premium" | "Standard";
  status: SubscriptionStatus;
  expiry: string; // Now formatted as DD-MM-YYYY
  mrr: string;
  overdueDays: number;
  restaurant_name?: string;
  subscription_date?: string; // Now formatted as DD-MM-YYYY
  start_date?: string; // Now formatted as DD-MM-YYYY
  created_at?: string;
};

type SubscriptionApiRow = {
  id: number;
  name: string;
  owner: string;
  plan: string;
  status: string;
  expiry: string;
  mrr: string;
  overdue_days: number;
  subscription_date?: string;
  created_at?: string;
};

function statusBadge(status: SubscriptionStatus) {
  if (status === "Active") return "bg-primary-100 text-primary-700";
  if (status === "Grace") return "bg-secondary-100 text-secondary-800";
  if (status === "Suspended") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

export default function SuperAdminSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [renewModal, setRenewModal] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [feedback, setFeedback] = useState("");
  const [detailModal, setDetailModal] = useState(false);

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return "—";
    // Convert YYYY-MM-DD to DD-MM-YYYY
    const [year, month, day] = dateStr.split('-');
    return `${day}-${month}-${year}`;
  };

  const loadSubscriptions = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<SubscriptionApiRow[]>("/superadmin/subscriptions");
      const normalized = response.map((row) => ({
        id: row.id,
        name: row.name,
        owner: row.owner,
        plan: (row.plan === "Premium" ? "Premium" : "Standard") as "Premium" | "Standard",
        status: (["Active", "Grace", "Suspended", "Inactive"].includes(row.status) ? row.status : "Inactive") as SubscriptionStatus,
        expiry: formatDate(row.expiry),
        mrr: row.mrr,
        overdueDays: Number(row.overdue_days || 0),
        subscription_date: formatDate(row.subscription_date || row.created_at),
        start_date: formatDate(row.subscription_date || row.created_at),
      }));
      setSubscriptions(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscriptions();
  }, []);

  const filteredSubs = useMemo(() => {
    return subscriptions.filter((sub) => {
      const name = (sub.name || sub.restaurant_name || "").toLowerCase();
      const owner = (sub.owner || "").toLowerCase();
      const searchMatch = name.includes(search.toLowerCase()) || owner.includes(search.toLowerCase());
      const statusMatch = statusFilter === "all" || sub.status === statusFilter;
      return searchMatch && statusMatch;
    });
  }, [subscriptions, search, statusFilter]);

  const stats = useMemo(() => {
    const active = subscriptions.filter((subscription) => subscription.status === "Active").length;
    const grace = subscriptions.filter((subscription) => subscription.status === "Grace").length;
    const suspended = subscriptions.filter((subscription) => subscription.status === "Suspended").length;
    return { active, grace, suspended };
  }, [subscriptions]);

  const handleRenew = (subscription: Subscription) => {
    setSelectedSub(subscription);
    setRenewModal(true);
    setFeedback("");
  };

  const handleViewDetails = (subscription: Subscription) => {
    setSelectedSub(subscription);
    setDetailModal(true);
  };

  const confirmRenew = async () => {
    if (!selectedSub) return;
    const nextExpiry = new Date();
    nextExpiry.setFullYear(nextExpiry.getFullYear() + 1);
    const expiryStr = nextExpiry.toISOString().slice(0, 10); // YYYY-MM-DD format for backend
    try {
      await apiRequest(`/superadmin/subscriptions/${selectedSub.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Active", expiry: expiryStr }),
      });
      setSubscriptions((current) =>
        current.map((subscription) =>
          subscription.id === selectedSub.id ? { ...subscription, expiry: formatDate(expiryStr), status: "Active", overdueDays: 0 } : subscription,
        ),
      );
      setRenewModal(false);
      setFeedback(`${selectedSub?.name || selectedSub?.restaurant_name} renewed successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to renew subscription");
    }
  };

  const updateStatus = async (subscription: Subscription, status: SubscriptionStatus, overdueDays: number) => {
    setError("");
    try {
      await apiRequest(`/superadmin/subscriptions/${subscription.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setSubscriptions((current) =>
        current.map((row) => (row.id === subscription.id ? { ...row, status, overdueDays: Math.max(row.overdueDays, overdueDays) } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-indigo-900 via-slate-900 to-primary-900 px-4 py-6 text-white sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold sm:text-3xl">Subscription Control Hub</h1>
              <p className="mt-1 text-sm text-slate-200">Track renewals, recover risky accounts, and automate grace-to-suspend lifecycle.</p>
            </div>
            <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100">
              Churn Risk Today: <span className="text-secondary-200">{stats.grace + stats.suspended}</span> accounts
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-primary-200 bg-primary-50 p-4 shadow-sm">
            <p className="text-sm font-semibold text-primary-700">Active</p>
            <p className="mt-1 text-3xl font-extrabold text-primary-900">{stats.active}</p>
          </article>
          <article className="rounded-xl border border-secondary-200 bg-secondary-50 p-4 shadow-sm">
            <p className="text-sm font-semibold text-secondary-700">Grace Period</p>
            <p className="mt-1 text-3xl font-extrabold text-secondary-900">{stats.grace}</p>
          </article>
          <article className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-sm font-semibold text-red-700">Suspended</p>
            <p className="mt-1 text-3xl font-extrabold text-red-900">{stats.suspended}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by restaurant or owner"
                className="w-full rounded-lg border border-slate-300 py-3 pl-9 pr-3 text-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <select className="rounded-lg border border-slate-300 px-3 py-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Grace">Grace</option>
              <option value="Suspended">Suspended</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
          {loading && <p className="mt-3 text-sm text-slate-500">Loading subscriptions...</p>}
          {feedback && <p className="mt-3 text-sm font-semibold text-primary-700">{feedback}</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Restaurant</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Owner</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Plan</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Status</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Start Date</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Expiry</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Risk</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.map((sub) => (
                  <tr key={sub.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-900">{sub.name || sub.restaurant_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{sub.owner}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${sub.plan === "Premium" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-700"}`}>{sub.plan}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${statusBadge(sub.status)}`}>
                        {sub.status === "Active" ? <BadgeCheck className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{sub.subscription_date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{sub.expiry}</td>
                    <td className="px-4 py-3">
                      {sub.overdueDays > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          {sub.overdueDays} days overdue
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-bold text-primary-700">Healthy</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-h-10 items-center gap-2 text-xs font-semibold">
                        <button className="rounded-md bg-slate-100 px-2 py-1.5 text-slate-700 hover:bg-slate-200" onClick={() => handleViewDetails(sub)}>
                          Details
                        </button>
                        <button className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-1.5 text-sky-700 hover:bg-sky-200" onClick={() => handleRenew(sub)}>
                          <RefreshCw className="h-3.5 w-3.5" /> Renew
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !filteredSubs.length && <p className="px-4 py-6 text-sm text-slate-500">No subscriptions found for current filters.</p>}
        </section>

        {renewModal && selectedSub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <h2 className="text-xl font-bold text-slate-900">Renew Subscription</h2>
              <p className="mt-2 text-sm text-slate-600">
                Renew <span className="font-semibold">{selectedSub?.name || selectedSub?.restaurant_name}</span> and reset status to active?
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setRenewModal(false)}>
                  Cancel
                </button>
                <button className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" onClick={confirmRenew}>
                  Confirm Renew
                </button>
              </div>
            </div>
          </div>
        )}
        {detailModal && selectedSub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <h2 className="text-xl font-bold text-slate-900">Subscription Details</h2>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Restaurant Name</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedSub.name || selectedSub.restaurant_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Owner</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedSub.owner}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Plan</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedSub.plan}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
                    <p className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${statusBadge(selectedSub.status)}`}>
                      {selectedSub.status === "Active" ? <BadgeCheck className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {selectedSub.status}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Subscription Start Date</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedSub.subscription_date}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Expiry Date</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedSub.expiry}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">MRR</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedSub.mrr || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Overdue Days</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedSub.overdueDays > 0 ? selectedSub.overdueDays : "0"}</p>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setDetailModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}
