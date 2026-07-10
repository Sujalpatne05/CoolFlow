import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building,
  CheckCircle2,
  PlusCircle,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import SuperAdminLayout from "../components/SuperAdminLayout";
import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

type Restaurant = {
  id: number;
  name: string;
  owner: string;
  status: "Active" | "Inactive";
  plan: "Premium" | "Standard";
  city: string;
  created_at?: string;
  logo?: string;
  subscriptionStartDate?: string;
  subscriptionExpiryDate?: string;
  user_count?: number;
};

function getHealthTone(score: number) {
  if (score >= 85) return "bg-emerald-100 text-emerald-800";
  if (score >= 70) return "bg-teal-100 text-teal-800";
  return "bg-red-100 text-red-700";
}

function estimateHealth(restaurant: Restaurant) {
  const base = restaurant.plan === "Premium" ? 82 : 72;
  const statusBoost = restaurant.status === "Active" ? 8 : -10;
  const idBoost = restaurant.id % 7;
  return Math.max(45, Math.min(98, base + statusBoost + idBoost));
}

function estimateUsers(restaurant: Restaurant) {
  if (restaurant.status === "Inactive") return Math.max(5, (restaurant.id % 20) + 3);
  return restaurant.plan === "Premium" ? 90 + (restaurant.id % 40) : 45 + (restaurant.id % 35);
}

export default function SuperAdminRestaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    const [year, month, day] = today.split('-').map(Number);
    const oneYearFromNow = `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    return {
      name: "",
      owner: "",
      city: "",
      plan: "Standard" as "Premium" | "Standard",
      status: "Active" as "Active" | "Inactive",
      logo: "" as string,
      subscriptionStartDate: today,
      subscriptionExpiryDate: oneYearFromNow,
    };
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  const filteredRestaurants = useMemo(() => {
    return restaurants.filter((r) => {
      const query = search.toLowerCase();
      const searchMatch =
        r.name.toLowerCase().includes(query) ||
        r.owner.toLowerCase().includes(query) ||
        r.city.toLowerCase().includes(query);
      const planMatch = planFilter === "all" || r.plan === planFilter;
      const statusMatch = statusFilter === "all" || r.status === statusFilter;
      return searchMatch && planMatch && statusMatch;
    });
  }, [restaurants, search, planFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = restaurants.length;
    const active = restaurants.filter((r) => r.status === "Active").length;
    const premium = restaurants.filter((r) => r.plan === "Premium").length;
    const atRisk = restaurants.filter((r) => estimateHealth(r) < 70).length;
    return { total, active, premium, atRisk };
  }, [restaurants]);

  const fetchRestaurants = async () => {
    const headers = buildAuthHeaders();
    if (!headers) {
      setError("Session expired. Login again.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${API_BASE_URL}/superadmin/restaurants`, {
        method: "GET",
        headers,
      });
      const data = await response.json();
      if (!response.ok) {
        if (isAuthError(response.status)) {
          clearAuthSession();
          window.location.href = "/superadmin-login";
          return;
        }
        setError(data?.error || "Unable to load restaurants.");
        return;
      }
      setRestaurants(Array.isArray(data) ? data : []);
    } catch {
      setError("Unable to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setLogoPreview(base64);
        setForm((prev) => ({ ...prev, logo: base64 }));
      };
      reader.readAsDataURL(file);
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditId(null);
    
    const today = new Date().toISOString().split('T')[0];
    const [year, month, day] = today.split('-').map(Number);
    const oneYearFromNow = `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    setForm({ 
      name: "", 
      owner: "", 
      city: "", 
      plan: "Standard", 
      status: "Active", 
      logo: "",
      subscriptionStartDate: today,
      subscriptionExpiryDate: oneYearFromNow,
    });
    setLogoFile(null);
    setLogoPreview("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.owner || !form.city) return;

    const headers = buildAuthHeaders();
    if (!headers) {
      setError("Session expired. Login again as superadmin.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setMessage("");

      const payload = {
        name: form.name.trim(),
        owner: form.owner.trim(),
        city: form.city.trim(),
        plan: form.plan,
        status: "Active",
        logo: form.logo || null,
        subscriptionStartDate: form.subscriptionStartDate,
        subscriptionExpiryDate: form.subscriptionExpiryDate,
      };
      
      console.log("[RESTAURANT] Sending payload:", payload);
      
      const createResponse = await fetch(`${API_BASE_URL}/superadmin/restaurants`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      
      const createData = await createResponse.json();
      
      if (!createResponse.ok) {
        setError(createData?.error || "Unable to create restaurant.");
        return;
      }

      await fetchRestaurants();
      setMessage("Restaurant created successfully. Add admins from the Users page.");
      closeModal();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create restaurant.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(id: number) {
    const selected = restaurants.find((restaurant) => restaurant.id === id);
    if (!selected) return;
    setForm({
      name: selected.name,
      owner: selected.owner,
      city: selected.city,
      plan: selected.plan,
      status: selected.status,
      logo: selected.logo || "",
      subscriptionStartDate: selected.subscriptionStartDate || new Date().toISOString().split('T')[0],
      subscriptionExpiryDate: selected.subscriptionExpiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    setLogoPreview(selected.logo || "");
    setEditId(id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;

    const headers = buildAuthHeaders();
    if (!headers) {
      setError("Session expired. Login again as superadmin.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE_URL}/superadmin/restaurants/${editId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: form.name.trim(),
          owner: form.owner.trim(),
          city: form.city.trim(),
          plan: form.plan,
          status: form.status,
          logo: form.logo || null,
          subscriptionStartDate: form.subscriptionStartDate,
          subscriptionExpiryDate: form.subscriptionExpiryDate,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Unable to update restaurant.");
        return;
      }

      setRestaurants((current) => current.map((item) => (item.id === data.id ? data : item)));
      setMessage("Restaurant updated successfully.");
      closeModal();
    } catch {
      setError("Unable to connect to backend.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    const headers = buildAuthHeaders();
    if (!headers) {
      setError("Session expired. Login again as superadmin.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/superadmin/restaurants/${id}`, {
        method: "DELETE",
        headers,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Unable to delete restaurant.");
        return;
      }
      if (data.success) {
        setRestaurants((current) => current.filter((item) => item.id !== id));
        setMessage("Restaurant removed successfully.");
      }
    } catch {
      setError("Unable to connect to backend.");
    }
  }

  async function handleToggleStatus(restaurant: Restaurant) {
    const headers = buildAuthHeaders();
    if (!headers) {
      setError("Session expired. Login again as superadmin.");
      return;
    }

    try {
      const nextStatus = restaurant.status === "Active" ? "Inactive" : "Active";
      const response = await fetch(`${API_BASE_URL}/superadmin/restaurants/${restaurant.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: restaurant.name,
          owner: restaurant.owner,
          city: restaurant.city,
          plan: restaurant.plan,
          status: nextStatus,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Unable to update status.");
        return;
      }

      setRestaurants((current) => current.map((item) => (item.id === data.id ? data : item)));
      setMessage(`${data.name} is now ${data.status}.`);
    } catch {
      setError("Unable to connect to backend.");
    }
  }

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-cyan-800 via-slate-900 to-blue-900 px-4 py-6 text-white sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold sm:text-3xl">Restaurant Portfolio</h1>
              <p className="mt-1 text-sm text-cyan-100">Monitor tenant health, growth plan, and activation quality.</p>
            </div>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              onClick={() => setShowModal(true)}
            >
              <PlusCircle className="h-5 w-5" />
              Add Restaurant
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Total</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-emerald-700">Active</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-900">{stats.active}</p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-sky-700">Premium</p>
            <p className="mt-1 text-2xl font-extrabold text-sky-900">{stats.premium}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-red-700">At Risk</p>
            <p className="mt-1 text-2xl font-extrabold text-red-900">{stats.atRisk}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <label className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by restaurant, owner, city"
                className="w-full rounded-lg border border-slate-300 py-3 pl-9 pr-3 text-sm outline-none focus:border-sky-500"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <select className="rounded-lg border border-slate-300 px-3 py-3 text-sm" value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
              <option value="all">All Plans</option>
              <option value="Premium">Premium</option>
              <option value="Standard">Standard</option>
            </select>
            <select className="rounded-lg border border-slate-300 px-3 py-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          {message && <p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p>}
          {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Logo</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Restaurant</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Owner</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Plan</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Health</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Users</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Status</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-5 text-sm text-slate-500" colSpan={8}>Loading restaurants...</td>
                  </tr>
                ) : (
                  filteredRestaurants.map((restaurant) => {
                    const healthScore = estimateHealth(restaurant);
                    const activeUsers = restaurant.user_count ?? 0;
                    return (
                      <tr key={restaurant.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200 flex-shrink-0">
                            {restaurant.logo ? (
                              <img src={restaurant.logo} alt={restaurant.name} className="w-full h-full object-cover" />
                            ) : (
                              <Building className="h-8 w-8 text-slate-400" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{restaurant.name}</div>
                          <div className="text-xs text-slate-500">{restaurant.city}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{restaurant.owner}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${restaurant.plan === "Premium" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-700"}`}>
                            {restaurant.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${getHealthTone(healthScore)}`}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {healthScore}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{activeUsers}</td>
                        <td className="px-4 py-3">
                          {restaurant.status === "Active" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                              <XCircle className="h-3.5 w-3.5" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-h-10 items-center gap-3 text-sm">
                            <button className="font-semibold text-sky-700 hover:text-sky-800" onClick={() => handleEdit(restaurant.id)}>
                              Edit
                            </button>
                            <button className="font-semibold text-slate-700 hover:text-slate-900" onClick={() => handleToggleStatus(restaurant)}>
                              {restaurant.status === "Active" ? "Deactivate" : "Activate"}
                            </button>
                            <button className="inline-flex items-center gap-1 font-semibold text-red-600 hover:text-red-700" onClick={() => handleDelete(restaurant.id)}>
                              <Trash2 className="h-4 w-4" />
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {!loading && !filteredRestaurants.length && (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
              <AlertTriangle className="h-4 w-4" />
              No restaurant matched current filters.
            </div>
          )}
        </section>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
            <button className="absolute right-3 top-2 text-2xl text-slate-400 hover:text-slate-600" onClick={closeModal}>
              &times;
            </button>
            <h2 className="text-xl font-bold text-slate-900">{editId ? "Edit Restaurant" : "Onboard New Restaurant"}</h2>
            <p className="mt-1 text-sm text-slate-500">Capture owner and plan details. Health score will auto-bootstrap.</p>
            <form onSubmit={editId ? handleSave : handleAdd} className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Restaurant Name</span>
                <div className="relative">
                  <Building className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <input type="text" name="name" className="w-full rounded-lg border border-slate-300 py-3 pl-9 pr-3 text-sm" value={form.name} onChange={handleInput} required />
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Owner Name</span>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <input type="text" name="owner" className="w-full rounded-lg border border-slate-300 py-3 pl-9 pr-3 text-sm" value={form.owner} onChange={handleInput} required />
                </div>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700">City</span>
                  <input type="text" name="city" className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" value={form.city} onChange={handleInput} required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Plan</span>
                  <select name="plan" className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" value={form.plan} onChange={handleInput}>
                    <option value="Premium">Premium</option>
                    <option value="Standard">Standard</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Restaurant Logo</span>
                <input type="file" accept="image/*" className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" onChange={handleLogoChange} />
                {logoPreview && (
                  <div className="mt-2 flex items-center gap-3">
                    <img src={logoPreview} alt="Logo Preview" className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
                    <span className="text-xs text-slate-500">Logo preview</span>
                  </div>
                )}
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Subscription Start Date</span>
                  <input 
                    type="date" 
                    name="subscriptionStartDate" 
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" 
                    value={form.subscriptionStartDate} 
                    onChange={handleInput} 
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Subscription Expiry Date</span>
                  <input 
                    type="date" 
                    name="subscriptionExpiryDate" 
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" 
                    value={form.subscriptionExpiryDate} 
                    onChange={handleInput} 
                  />
                </label>
              </div>

              {editId && (
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Status</span>
                  <select name="status" className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" value={form.status} onChange={handleInput}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>
              )}



              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button type="button" className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70">
                  {editId ? "Save Changes" : "Create Restaurant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SuperAdminLayout>
  );
}

