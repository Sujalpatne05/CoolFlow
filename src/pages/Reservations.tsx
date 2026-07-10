import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";
import { Copy, Link as LinkIcon } from "lucide-react";

type ReservationStatus = "pending" | "confirmed" | "seated" | "completed" | "cancelled";

type Reservation = {
  id: number;
  name: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  tableNumber: string;
  status: ReservationStatus;
};

type ApiReservation = {
  id: number;
  customer_name: string;
  customer_phone: string;
  reservation_date: string;
  reservation_time: string;
  guests: number;
  table_number: string;
  status: ReservationStatus;
};

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

const statusColor: Record<ReservationStatus, string> = {
  pending: "bg-yellow-500",
  confirmed: "bg-blue-500",
  seated: "bg-purple-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
};

export default function Reservations() {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
    const goToLogin = (message = "Session expired. Please login again.") => {
      setError(message);
      clearAuthSession();
      setTimeout(() => navigate("/admin-login"), 300);
    };

  const [filterStatus, setFilterStatus] = useState<"all" | ReservationStatus>("all");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    date: "",
    time: "",
    guests: "2",
    tableNumber: "",
  });

  const [editReservation, setEditReservation] = useState<Reservation | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", phone: "", date: "", time: "", guests: "2", tableNumber: "",
  });

  const [publicLink, setPublicLink] = useState<string>("");
  const [showLinkModal, setShowLinkModal] = useState(false);

  const openEdit = (r: Reservation) => {
    setEditReservation(r);
    setEditForm({ name: r.name, phone: r.phone, date: r.date, time: r.time, guests: String(r.guests), tableNumber: r.tableNumber });
  };

  const generatePublicLink = async () => {
    try {
      const headers = buildAuthHeaders();
      if (!headers) {
        goToLogin("Please login to continue.");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/reservations/public/generate`, {
        method: "POST",
        headers,
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data?.error || "Failed to generate link");
        return;
      }

      const baseUrl = window.location.origin;
      const fullLink = `${baseUrl}/book/${data.token}`;
      setPublicLink(fullLink);
      setShowLinkModal(true);
    } catch (err) {
      toast.error("Failed to generate public link");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(publicLink);
    toast.success("Link copied to clipboard!");
  };

  const saveEdit = async () => {
    if (!editReservation) return;
    const headers = buildAuthHeaders();
    if (!headers) return;
    const response = await fetch(`${API_BASE_URL}/reservations/${editReservation.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        customer_name: editForm.name.trim(),
        customer_phone: editForm.phone.trim(),
        reservation_date: editForm.date,
        reservation_time: editForm.time,
        guests: Number(editForm.guests),
        table_number: editForm.tableNumber.trim().toUpperCase(),
      }),
    });
    if (response.ok) {
      const data = await response.json();
      setReservations(prev => prev.map(r => r.id === editReservation.id ? toUiReservation(data) : r));
      setEditReservation(null);
      toast.success("Reservation updated");
    } else {
      toast.error("Unable to update reservation");
    }
  };

  const deleteReservation = async (id: number) => {
    if (!confirm("Delete this reservation?")) return;
    const headers = buildAuthHeaders();
    if (!headers) return;
    const response = await fetch(`${API_BASE_URL}/reservations/${id}`, { method: "DELETE", headers });
    if (response.ok) {
      setReservations(prev => prev.filter(r => r.id !== id));
      toast.success("Reservation deleted");
    } else {
      toast.error("Unable to delete reservation");
    }
  };

  const filteredReservations = useMemo(
    () => reservations.filter((reservation) => filterStatus === "all" || reservation.status === filterStatus),
    [reservations, filterStatus],
  );

  const toUiReservation = (item: ApiReservation): Reservation => ({
    id: item.id,
    name: item.customer_name,
    phone: item.customer_phone,
    date: item.reservation_date,
    time: item.reservation_time,
    guests: Number(item.guests),
    tableNumber: item.table_number,
    status: item.status,
  });

  const loadReservations = async () => {
    try {
      setError("");
      const headers = buildAuthHeaders();
      if (!headers) {
        goToLogin("Please login to continue.");
        return;
      }
      const response = await fetch(`${API_BASE_URL}/reservations`, { headers });
      const data = await response.json();
      if (isAuthError(response.status)) {
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }
      if (!response.ok) {
        setError(data?.error || "Unable to load reservations.");
        return;
      }
      setReservations((Array.isArray(data) ? data : []).map(toUiReservation));
    } catch {
      setError("Unable to connect to backend.");
    }
  };

  useEffect(() => {
    loadReservations();
  }, []);

  const addReservation = async () => {
    // Validation
    if (!form.name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (form.name.trim().length < 2) {
      toast.error("Customer name must be at least 2 characters");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) {
      toast.error("Phone must be 10 digits");
      return;
    }
    if (!form.date) {
      toast.error("Reservation date is required");
      return;
    }
    // Check if date is in future
    const selectedDate = new Date(form.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      toast.error("Reservation date must be in the future");
      return;
    }
    if (!form.time) {
      toast.error("Reservation time is required");
      return;
    }
    if (!form.tableNumber.trim()) {
      toast.error("Table number is required");
      return;
    }
    const guests = Number(form.guests);
    if (guests < 1 || guests > 20) {
      toast.error("Guest count must be between 1 and 20");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const headers = buildAuthHeaders();
      if (!headers) {
        goToLogin("Please login to continue.");
        return;
      }
      const response = await fetch(`${API_BASE_URL}/reservations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customer_name: form.name.trim(),
          customer_phone: form.phone.trim(),
          reservation_date: form.date,
          reservation_time: form.time,
          guests: Number(form.guests),
          table_number: form.tableNumber.trim().toUpperCase(),
          status: "pending",
        }),
      });
      const data = await response.json();
      if (isAuthError(response.status)) {
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }
      if (!response.ok) {
        setError(data?.error || "Unable to create reservation.");
        return;
      }

      // Update table status to reserved
      try {
        const tableNumber = Number(form.tableNumber.trim().replace(/\D/g, ""));
        if (Number.isFinite(tableNumber)) {
          // Fetch tables to find the table ID
          const tablesResponse = await fetch(`${API_BASE_URL}/tables`, { headers });
          const tables = await tablesResponse.json();
          const table = Array.isArray(tables) ? tables.find((t: any) => t.table_number === tableNumber || t.number === tableNumber) : null;
          
          if (table) {
            await fetch(`${API_BASE_URL}/tables/${table.id}`, {
              method: "PUT",
              headers,
              body: JSON.stringify({
                status: "reserved",
                reserved_by: form.name.trim(),
                estimated_time: form.time,
              }),
            });
          }
        }
      } catch (err) {
        // Don't fail the reservation if table update fails
      }

      setReservations((prev) => [toUiReservation(data), ...prev]);
      setForm({ name: "", phone: "", date: "", time: "", guests: "2", tableNumber: "" });
      toast.success("Reservation created and table marked as reserved");
    } catch {
      setError("Unable to connect to backend.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: number, status: ReservationStatus) => {
    const previous = reservations;
    const reservation = reservations.find(r => r.id === id);
    
    setReservations((prev) => prev.map((reservation) => (reservation.id === id ? { ...reservation, status } : reservation)));

    try {
      const headers = buildAuthHeaders();
      if (!headers) {
        goToLogin("Please login to continue.");
        return;
      }
      const response = await fetch(`${API_BASE_URL}/reservations/${id}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (isAuthError(response.status)) {
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }
      if (!response.ok) {
        setReservations(previous);
        setError(data?.error || "Unable to update reservation status.");
        return;
      }

      // Update table status based on reservation status
      if (reservation) {
        try {
          const tableNumber = Number(reservation.tableNumber.replace(/\D/g, ""));
          if (Number.isFinite(tableNumber)) {
            // Fetch tables to find the table ID
            const tablesResponse = await fetch(`${API_BASE_URL}/tables`, { headers });
            const tables = await tablesResponse.json();
            const table = Array.isArray(tables) ? tables.find((t: any) => t.table_number === tableNumber || t.number === tableNumber) : null;
            
            if (table) {
              let tableStatus = "available";
              let tableData: any = { status: tableStatus };
              
              if (status === "seated") {
                tableStatus = "occupied";
                tableData = { status: tableStatus, reserved_by: null };
              } else if (status === "cancelled") {
                tableStatus = "available";
                tableData = { status: tableStatus, reserved_by: null, estimated_time: null };
              } else if (status === "confirmed" || status === "pending") {
                tableStatus = "reserved";
                tableData = { status: tableStatus, reserved_by: reservation.name, estimated_time: reservation.time };
              }
              
              await fetch(`${API_BASE_URL}/tables/${table.id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify(tableData),
              });
            }
          }
        } catch (err) {
          // Don't fail the status update if table update fails
        }
      }

      toast.success("Reservation status updated");
    } catch {
      setReservations(previous);
      setError("Unable to connect to backend.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-emerald-600">Reservations</h1>
          <p className="text-muted-foreground">Create and manage table reservations</p>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex gap-2">
          <Button 
            onClick={generatePublicLink}
            className="bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2"
          >
            <LinkIcon size={16} /> Generate Booking Link
          </Button>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Add Reservation</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Customer name" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Phone number" />
            </div>
            <div>
              <Label>Table</Label>
              <Input value={form.tableNumber} onChange={(e) => setForm((prev) => ({ ...prev, tableNumber: e.target.value }))} placeholder="T5" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={form.time} onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))} />
            </div>
            <div>
              <Label>Guests</Label>
              <Input type="number" min={1} value={form.guests} onChange={(e) => setForm((prev) => ({ ...prev, guests: e.target.value }))} />
            </div>
            <div className="md:col-span-3">
              <Button className="gradient-warm text-primary-foreground" disabled={saving} onClick={addReservation}>
                {saving ? "Saving..." : "Add Reservation"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Reservation List</CardTitle>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as "all" | ReservationStatus)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="seated">Seated</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredReservations.length === 0 && <p className="text-sm text-muted-foreground">No reservations found.</p>}
            {filteredReservations.map((reservation) => {
              const formattedDate = new Date(reservation.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
              return (
              <div key={reservation.id} className="border rounded-lg p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold">{reservation.name}</p>
                  <p className="text-xs text-muted-foreground">R-{reservation.id} | {reservation.phone}</p>
                  <p className="text-sm">{formattedDate} at {reservation.time} | Guests: {reservation.guests} | Table: {reservation.tableNumber}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={statusColor[reservation.status]}>{reservation.status}</Badge>
                  <Select value={reservation.status} onValueChange={(value) => updateStatus(reservation.id, value as ReservationStatus)}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="seated">Seated</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => openEdit(reservation)}>Edit</Button>
                  <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => void deleteReservation(reservation.id)}>Delete</Button>
                </div>
              </div>
            );
            })}
          </CardContent>
        </Card>
      </div>

      {editReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-500 hover:text-black text-xl" onClick={() => setEditReservation(null)}>x</button>
            <h2 className="text-lg font-bold mb-4">Edit Reservation</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={editForm.name} onChange={e => setEditForm(p => ({...p, name: e.target.value}))} /></div>
              <div><Label>Phone</Label><Input value={editForm.phone} onChange={e => setEditForm(p => ({...p, phone: e.target.value}))} /></div>
              <div><Label>Table</Label><Input value={editForm.tableNumber} onChange={e => setEditForm(p => ({...p, tableNumber: e.target.value}))} /></div>
              <div><Label>Guests</Label><Input type="number" min={1} value={editForm.guests} onChange={e => setEditForm(p => ({...p, guests: e.target.value}))} /></div>
              <div><Label>Date</Label><Input type="date" value={editForm.date} onChange={e => setEditForm(p => ({...p, date: e.target.value}))} /></div>
              <div><Label>Time</Label><Input type="time" value={editForm.time} onChange={e => setEditForm(p => ({...p, time: e.target.value}))} /></div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button className="flex-1 gradient-warm text-primary-foreground" onClick={() => void saveEdit()}>Save Changes</Button>
              <Button variant="outline" className="flex-1" onClick={() => setEditReservation(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-2 text-gray-500 hover:text-black text-xl" onClick={() => setShowLinkModal(false)}>x</button>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <LinkIcon size={20} /> Public Booking Link
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Share this link with customers so they can book a table directly:
            </p>
            <div className="bg-gray-50 p-3 rounded-lg mb-4 flex items-center gap-2">
              <Input 
                value={publicLink} 
                readOnly 
                className="flex-1 bg-white"
              />
              <Button 
                onClick={copyToClipboard}
                className="bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2"
              >
                <Copy size={16} /> Copy
              </Button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Customers can use this link to fill out their reservation details without needing to log in.
            </p>
            <Button 
              onClick={() => setShowLinkModal(false)}
              className="w-full"
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}