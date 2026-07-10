import React from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Edit, Trash2, UserX, UserCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@headlessui/react";
import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

type StaffMember = {
  id: number;
  name: string;
  role: string;
  present: boolean;
  leaves: number;
  salary: number;
};

export default function Payroll() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newSalary, setNewSalary] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingAttendanceId, setEditingAttendanceId] = useState<number | null>(null);
  const [attendancePresent, setAttendancePresent] = useState(false);
  const [attendanceLeaves, setAttendanceLeaves] = useState(0);

  const loadStaff = useCallback(async () => {
    const headers = buildAuthHeaders();
    if (!headers) {
      clearAuthSession();
      window.location.href = "/admin-login";
      return;
    }

    const response = await fetch(`${API_BASE_URL}/payroll/staff`, { headers });
    if (isAuthError(response.status)) {
      clearAuthSession();
      window.location.href = "/admin-login";
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Failed to load payroll staff");
    }
    setStaff(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await loadStaff();
      } catch (error) {
        // Payroll load error
      } finally {
        setLoading(false);
      }
    };
    void bootstrap();
  }, [loadStaff]);

  const handleAddStaff = async () => {
    if (!newName || !newRole || !newSalary) return;
    const headers = buildAuthHeaders();
    if (!headers) return;

    const response = await fetch(`${API_BASE_URL}/payroll/staff`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: newName.trim(),
        role: newRole.trim(),
        salary: Number(newSalary),
        present: true,
        leaves: 0,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data?.error || "Unable to add staff member");
      return;
    }

    await loadStaff();
    setShowModal(false);
    setNewName("");
    setNewRole("");
    setNewSalary("");
  };

  const handleEditStaff = (member: StaffMember) => {
    setEditingId(member.id);
    setNewName(member.name);
    setNewRole(member.role);
    setNewSalary(member.salary.toString());
    setShowModal(true);
  };

  const handleUpdateStaff = async () => {
    // Validation
    if (!newName || !newName.trim()) {
      alert("Staff name is required");
      return;
    }
    if (newName.trim().length < 2) {
      alert("Staff name must be at least 2 characters");
      return;
    }
    if (!newRole || !newRole.trim()) {
      alert("Staff role is required");
      return;
    }
    if (!newSalary) {
      alert("Salary is required");
      return;
    }
    const salary = Number(newSalary);
    if (isNaN(salary) || salary <= 0) {
      alert("Salary must be greater than 0");
      return;
    }
    if (salary > 1000000) {
      alert("Salary seems unrealistic (max: 1,000,000)");
      return;
    }
    if (editingId === null) return;
    
    const headers = buildAuthHeaders();
    if (!headers) return;

    const response = await fetch(`${API_BASE_URL}/payroll/staff/${editingId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        name: newName.trim(),
        role: newRole.trim(),
        salary: Number(newSalary),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data?.error || "Unable to update staff member");
      return;
    }

    await loadStaff();
    setShowModal(false);
    setEditingId(null);
    setNewName("");
    setNewRole("");
    setNewSalary("");
  };

  const handleDeleteStaff = async (id: number) => {
    if (!confirm("Are you sure you want to delete this staff member?")) return;
    const headers = buildAuthHeaders();
    if (!headers) return;

    const response = await fetch(`${API_BASE_URL}/payroll/staff/${id}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data?.error || "Unable to delete staff member");
      return;
    }

    await loadStaff();
  };

  const handleEditAttendance = (member: StaffMember) => {
    setEditingAttendanceId(member.id);
    setAttendancePresent(member.present);
    setAttendanceLeaves(member.leaves);
  };

  const handleUpdateAttendance = async () => {
    // Validation
    if (attendanceLeaves < 0 || attendanceLeaves > 30) {
      alert("Leaves must be between 0 and 30");
      return;
    }
    if (editingAttendanceId === null) return;
    
    const headers = buildAuthHeaders();
    if (!headers) return;

    const response = await fetch(`${API_BASE_URL}/payroll/staff/${editingAttendanceId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        present: attendancePresent,
        leaves: attendanceLeaves,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data?.error || "Unable to update attendance");
      return;
    }

    await loadStaff();
    setEditingAttendanceId(null);
    setAttendancePresent(false);
    setAttendanceLeaves(0);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-emerald-500 drop-shadow" />
            <div>
              <h1 className="text-2xl font-bold text-emerald-600">Payroll</h1>
              <p className="text-muted-foreground">Manage staff attendance, leaves & payroll</p>
            </div>
          </div>
          <Button className="gradient-warm text-primary-foreground gap-2 shadow-lg hover:scale-[1.04] transition-transform" onClick={() => setShowModal(true)}>
            <UserPlus className="h-4 w-4" /> Add Staff
          </Button>
        </div>
        <Card className="shadow-card bg-gradient-to-br from-emerald-50 via-white to-emerald-100 border-emerald-100">
          <CardHeader className="flex flex-row items-center gap-2">
            <Users className="h-5 w-5 text-emerald-400 mr-1" />
            <CardTitle className="text-base">Staff List</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-emerald-50">
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Role</th>
                    <th className="text-center py-2">Present</th>
                    <th className="text-center py-2">Leaves</th>
                    <th className="text-right py-2">Salary (₹)</th>
                    <th className="text-center py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && staff.length === 0 && (
                    <tr>
                      <td className="py-8 text-center text-muted-foreground opacity-70" colSpan={6}>
                        <div className="flex flex-col items-center justify-center gap-2">
                          <UserX className="h-12 w-12 mb-2 text-emerald-200" />
                          <span className="text-base">No staff found for this restaurant.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {staff.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-emerald-50/60 transition-all">
                      <td className="py-2 font-medium flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-emerald-400" /> {s.name}
                      </td>
                      <td className="py-2">{s.role}</td>
                      <td className="py-2 text-center">
                        <button
                          onClick={() => handleEditAttendance(s)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded font-semibold text-xs transition-all hover:scale-105"
                          style={{
                            backgroundColor: s.present ? "#dcfce7" : "#fee2e2",
                            color: s.present ? "#16a34a" : "#dc2626",
                          }}
                        >
                          {s.present ? "Yes" : "No"}
                        </button>
                      </td>
                      <td className="py-2 text-center">
                        <button
                          onClick={() => handleEditAttendance(s)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded font-semibold text-xs bg-blue-100 text-blue-600 transition-all hover:scale-105"
                        >
                          {s.leaves}
                        </button>
                      </td>
                      <td className="py-2 text-right">{s.salary.toLocaleString()}</td>
                      <td className="py-2 text-center">
                        <button onClick={() => handleEditStaff(s)} className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-emerald-100 text-emerald-600 font-semibold text-xs mr-1">
                          <Edit className="h-4 w-4" /> Edit
                        </button>
                        <button onClick={() => handleDeleteStaff(s.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-red-100 text-red-600 font-semibold text-xs">
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        {showModal && (
          <Dialog open={showModal} onClose={() => { setShowModal(false); setEditingId(null); setNewName(""); setNewRole(""); setNewSalary(""); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <Dialog.Panel className="bg-white p-6 rounded-xl shadow-xl w-[350px]">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><UserPlus className="h-5 w-5 text-emerald-400" /> {editingId ? "Edit Staff" : "Add Staff"}</h3>
              <input
                type="text"
                placeholder="Name"
                className="w-full border rounded px-2 py-1 mb-2"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Role"
                className="w-full border rounded px-2 py-1 mb-2"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
              />
              <input
                type="number"
                placeholder="Salary"
                className="w-full border rounded px-2 py-1 mb-4"
                value={newSalary}
                onChange={e => setNewSalary(e.target.value)}
              />
              <button
                className="bg-emerald-500 text-white px-4 py-2 rounded font-semibold hover:bg-emerald-600 transition mr-2"
                onClick={editingId ? handleUpdateStaff : handleAddStaff}
              >
                <UserPlus className="h-4 w-4 inline mr-1" /> {editingId ? "Update" : "Add"}
              </button>
              <button
                className="bg-gray-400 text-white px-4 py-2 rounded font-semibold hover:bg-gray-600 transition"
                onClick={() => { setShowModal(false); setEditingId(null); setNewName(""); setNewRole(""); setNewSalary(""); }}
              >
                Cancel
              </button>
            </Dialog.Panel>
          </Dialog>
        )}
        {editingAttendanceId !== null && (
          <Dialog open={editingAttendanceId !== null} onClose={() => { setEditingAttendanceId(null); setAttendancePresent(false); setAttendanceLeaves(0); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <Dialog.Panel className="bg-white p-6 rounded-xl shadow-xl w-[350px]">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><UserCheck className="h-5 w-5 text-emerald-400" /> Update Attendance</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Present</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAttendancePresent(true)}
                    className={`flex-1 py-2 rounded font-semibold transition ${
                      attendancePresent
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setAttendancePresent(false)}
                    className={`flex-1 py-2 rounded font-semibold transition ${
                      !attendancePresent
                        ? "bg-red-500 text-white"
                        : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Leaves</label>
                <input
                  type="number"
                  min="0"
                  className="w-full border rounded px-3 py-2"
                  value={attendanceLeaves}
                  onChange={e => setAttendanceLeaves(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <button
                className="bg-emerald-500 text-white px-4 py-2 rounded font-semibold hover:bg-emerald-600 transition mr-2"
                onClick={handleUpdateAttendance}
              >
                <UserCheck className="h-4 w-4 inline mr-1" /> Update
              </button>
              <button
                className="bg-gray-400 text-white px-4 py-2 rounded font-semibold hover:bg-gray-600 transition"
                onClick={() => { setEditingAttendanceId(null); setAttendancePresent(false); setAttendanceLeaves(0); }}
              >
                Cancel
              </button>
            </Dialog.Panel>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}
