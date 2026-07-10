import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Plus, Phone, Mail, Star, MoreVertical } from "lucide-react";
import { apiRequest } from "@/lib/api";

type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string;
  visits: number;
  total_spent: number;
  vip: boolean;
  last_visit: string;
};

const defaultForm = {
  name: "",
  email: "",
  phone: "",
  visits: 0,
  totalSpent: 0,
  vip: false,
};

const formatCurrency = (amount: number) => `Rs ${Math.round(amount).toLocaleString("en-IN")}`;

const CRM = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);

  const loadCustomers = async () => {
    const data = await apiRequest<Customer[]>("/crm/customers");
    setCustomers(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await loadCustomers();
      } catch (error) {
        // CRM load error
      } finally {
        setLoading(false);
      }
    };
    void bootstrap();
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const query = search.toLowerCase();
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query),
    );
  }, [customers, search]);

  const resetForm = () => setForm(defaultForm);

  const openAddModal = () => {
    resetForm();
    setEditCustomer(null);
    setShowModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditCustomer(customer);
    setForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      visits: customer.visits,
      totalSpent: customer.total_spent,
      vip: customer.vip,
    });
    setShowModal(true);
    setMenuOpenId(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Validation
    if (!form.name.trim()) {
      alert("Customer name is required");
      return;
    }
    if (form.name.trim().length < 2) {
      alert("Customer name must be at least 2 characters");
      return;
    }
    if (!form.email.trim()) {
      alert("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      alert("Please enter a valid email address");
      return;
    }
    if (form.phone && !/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) {
      alert("Phone must be 10 digits");
      return;
    }
    if (form.visits < 0 || form.visits > 1000) {
      alert("Visits must be between 0 and 1000");
      return;
    }
    if (form.totalSpent < 0 || form.totalSpent > 1000000) {
      alert("Total spent must be between 0 and 1,000,000");
      return;
    }
    
    try {
      if (editCustomer) {
        await apiRequest(`/crm/customers/${editCustomer.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            visits: Number(form.visits),
            totalSpent: Number(form.totalSpent),
            vip: form.vip,
          }),
        });
      } else {
        await apiRequest("/crm/customers", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            visits: Number(form.visits),
            totalSpent: Number(form.totalSpent),
            vip: form.vip,
          }),
        });
      }

      await loadCustomers();
      setShowModal(false);
      setEditCustomer(null);
      resetForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to save customer");
    }
  };

  const handleDelete = async (customer: Customer) => {
    try {
      await apiRequest(`/crm/customers/${customer.id}`, { method: "DELETE" });
      await loadCustomers();
      setMenuOpenId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to delete customer");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Customer Management</h1>
            <p className="text-muted-foreground">{filteredCustomers.length} registered customers</p>
          </div>
          <Button className="gradient-warm text-primary-foreground gap-2" onClick={openAddModal}>
            <Plus className="h-4 w-4" /> Add Customer
          </Button>
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-[420px] relative">
              <button className="absolute top-2 right-2 text-gray-500 hover:text-black" onClick={() => setShowModal(false)} aria-label="Close">x</button>
              <h2 className="text-lg font-bold mb-4">{editCustomer ? "Edit Customer" : "Add Customer"}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input name="name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Enter customer name" className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input name="email" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Enter email address" className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input name="phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Enter phone number" className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Visits</label>
                    <input name="visits" type="number" min={0} value={form.visits} onChange={(e) => setForm((prev) => ({ ...prev, visits: Number(e.target.value) }))} placeholder="0" className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Spent (₹)</label>
                    <input name="totalSpent" type="number" min={0} value={form.totalSpent} onChange={(e) => setForm((prev) => ({ ...prev, totalSpent: Number(e.target.value) }))} placeholder="0" className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.vip} onChange={(e) => setForm((prev) => ({ ...prev, vip: e.target.checked }))} className="w-4 h-4 rounded" /> 
                  <span className="font-medium">Mark as VIP Customer</span>
                </label>
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 rounded transition">{editCustomer ? "Save Changes" : "Add Customer"}</button>
              </form>
            </div>
          </div>
        )}

        {viewCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-[380px] relative">
              <button className="absolute top-2 right-2 text-gray-500 hover:text-black" onClick={() => setViewCustomer(null)} aria-label="Close">x</button>
              <h2 className="text-lg font-bold mb-4">Customer Details</h2>
              <div className="space-y-2 text-sm">
                <div><b>Name:</b> {viewCustomer.name}</div>
                <div><b>Email:</b> {viewCustomer.email}</div>
                <div><b>Phone:</b> {viewCustomer.phone}</div>
                <div><b>Visits:</b> {viewCustomer.visits}</div>
                <div><b>Total Spent:</b> {formatCurrency(viewCustomer.total_spent)}</div>
                <div><b>VIP:</b> {viewCustomer.vip ? "Yes" : "No"}</div>
              </div>
            </div>
          </div>
        )}

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {!loading && filteredCustomers.length === 0 && (
            <Card className="shadow-card">
              <CardContent className="p-5 text-sm text-muted-foreground">No customers found for this restaurant.</CardContent>
            </Card>
          )}
          {filteredCustomers.map((customer) => (
            <Card key={customer.id} className="shadow-card hover:shadow-elevated transition-shadow animate-scale-in">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full gradient-warm flex items-center justify-center text-sm font-bold text-primary-foreground">
                      {customer.name.split(" ").map((name) => name[0]).join("")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{customer.name}</h3>
                        {customer.vip && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
                      </div>
                      <p className="text-xs text-muted-foreground">Last visit: {customer.last_visit ? new Date(customer.last_visit).toLocaleDateString() : "N/A"}</p>
                    </div>
                  </div>
                  <div className="relative">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMenuOpenId(menuOpenId === customer.id ? null : customer.id)}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                    {menuOpenId === customer.id && (
                      <div className="absolute right-0 mt-2 w-32 bg-white border rounded shadow-lg z-10">
                        <button className="block w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => openEditModal(customer)}>Edit</button>
                        <button className="block w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => setViewCustomer(customer)}>View</button>
                        <button className="block w-full text-left px-4 py-2 text-red-500 hover:bg-gray-100" onClick={() => void handleDelete(customer)}>Delete</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    <span>{customer.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{customer.phone}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t flex justify-between">
                  <div className="text-center">
                    <p className="text-lg font-bold">{customer.visits}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Visits</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{formatCurrency(customer.total_spent)}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Spent</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{formatCurrency(customer.visits > 0 ? customer.total_spent / customer.visits : 0)}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Order</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CRM;
