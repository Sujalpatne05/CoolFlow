import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { apiRequest } from "@/lib/api";
import { UserCog, Plus, Trash2, Edit2, X, Check } from "lucide-react";

type StaffUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string;
};

const ROLES = ["manager", "staff", "cashier", "chef"];

const roleColors: Record<string, string> = {
  admin: "bg-teal-100 text-teal-800",
  manager: "bg-blue-100 text-blue-800",
  cashier: "bg-purple-100 text-purple-800",
  chef: "bg-emerald-100 text-emerald-800",
  staff: "bg-green-100 text-green-800",
};

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [form, setForm] = useState({ name: "", email: "", role: "staff", password: "" });

  const fetchUsers = async () => {
    try {
      const data = await apiRequest<StaffUser[]>("/staff", { method: "GET" }, true);
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load staff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error("Name, email and password are required");
      return;
    }
    setSaving(true);
    try {
      const newUser = await apiRequest<StaffUser>("/staff", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setUsers(prev => [newUser, ...prev]);
      setForm({ name: "", email: "", role: "staff", password: "" });
      setShowAdd(false);
      toast.success("Staff member added");
    } catch (err: any) {
      toast.error(err?.message || "Failed to add staff");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (user: StaffUser) => {
    setEditId(user.id);
    setEditName(user.name);
    setEditRole(user.role);
  };

  const handleSaveEdit = async (id: number) => {
    try {
      const updated = await apiRequest<StaffUser>(`/staff/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName, role: editRole }),
      });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updated } : u));
      setEditId(null);
      toast.success("Updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update");
    }
  };

  const handleToggleActive = async (user: StaffUser) => {
    try {
      const updated = await apiRequest<StaffUser>(`/staff/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...updated } : u));
      toast.success(`${user.name} ${!user.is_active ? "activated" : "deactivated"}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update status");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete ${name}? They will no longer be able to log in.`)) return;
    try {
      await apiRequest(`/staff/${id}`, { method: "DELETE" });
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success("Staff member removed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UserCog className="text-emerald-500" /> Staff Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your restaurant's staff accounts</p>
          </div>
          <Button onClick={() => setShowAdd(true)} className="bg-emerald-500 hover:bg-emerald-600">
            <Plus size={16} className="mr-1" /> Add Staff
          </Button>
        </div>

        {/* Add Staff Form */}
        {showAdd && (
          <Card className="border-emerald-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Add New Staff Member</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Full Name</label>
                  <Input placeholder="e.g. Rahul Sharma" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Email</label>
                  <Input type="email" placeholder="rahul@cafe.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Role</label>
                  <select className="w-full border rounded px-3 py-2 text-sm" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Password</label>
                  <Input type="password" placeholder="Min 6 characters" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
                </div>
                <div className="sm:col-span-2 flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving} className="bg-emerald-500 hover:bg-emerald-600">
                    {saving ? "Adding..." : "Add Staff"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Staff List */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Loading staff...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No staff members yet. Add your first one above.</div>
            ) : (
              <div className="divide-y">
                {users.map(user => (
                  <div key={user.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      {editId === user.id ? (
                        <div className="flex gap-2 items-center flex-wrap">
                          <Input value={editName} onChange={e => setEditName(e.target.value)} className="w-40 h-8 text-sm" />
                          <select className="border rounded px-2 py-1 text-sm" value={editRole} onChange={e => setEditRole(e.target.value)}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <Button size="sm" variant="ghost" onClick={() => handleSaveEdit(user.id)} className="h-8 px-2"><Check size={14} /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="h-8 px-2"><X size={14} /></Button>
                        </div>
                      ) : (
                        <>
                          <div className="font-medium text-sm">{user.name}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </>
                      )}
                    </div>
                    <Badge className={`text-xs ${roleColors[user.role] || "bg-gray-100 text-gray-700"}`}>
                      {user.role}
                    </Badge>
                    <Badge className={`text-xs ${user.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {editId !== user.id && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(user)} className="h-8 w-8 p-0">
                          <Edit2 size={13} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleToggleActive(user)} className="h-8 px-2 text-xs">
                          {user.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(user.id, user.name)} className="h-8 w-8 p-0 text-red-500 hover:text-red-600">
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminUsers;
