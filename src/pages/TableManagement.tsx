import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Users, Clock, Trash2, Receipt, QrCode } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";
import { generateTableQRCode } from "@/lib/qrcode";

interface Table {
  id: number;
  number: number;
  capacity: number;
  status: "available" | "occupied" | "reserved" | "maintenance";
  section: string;
  currentOrder?: string;
  reservedBy?: string;
  estimatedTime?: string;
  occupiedSince?: string;
}

type ReservationStatus = "pending" | "confirmed" | "seated" | "completed" | "cancelled";

type Reservation = {
  id: number;
  customerName: string;
  tableNumber: string;
  status: ReservationStatus;
};

type ApiReservation = {
  id: number;
  customer_name: string;
  table_number: string;
  status: ReservationStatus;
};

type ApiOrder = {
  id: number;
  table_number?: number | null;
  total: number | string;
  status: "pending" | "preparing" | "ready" | "served";
  items?: string[];
  created_at?: string;
  paymentStatus?: string;
  paymentMethod?: string;
};

type ApiTable = {
  id: number;
  table_number: number;
  capacity: number;
  status: Table["status"];
  section: string;
  current_order?: string | null;
  reserved_by?: string | null;
  estimated_time?: string | null;
  occupied_since?: string | null;
};

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

export default function TableManagement() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [clockTick, setClockTick] = useState(Date.now());

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [selectedOrderForView, setSelectedOrderForView] = useState<ApiOrder | null>(null);
  const [selectedTableForQR, setSelectedTableForQR] = useState<Table | null>(null);
  const [filterSection, setFilterSection] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [seatingReservationId, setSeatingReservationId] = useState<number | null>(null);

  const [newTable, setNewTable] = useState({
    number: "",
    capacity: "",
    section: "",
  });

  // Derive sections dynamically from existing tables + settings + common suggestions
  const SECTION_SUGGESTIONS = ["Main Hall", "Outdoor", "Private Room", "Bar Area", "VIP Section"];
  const existingSections = Array.from(new Set(tables.map(t => t.section).filter(Boolean)));
  const [settingsSections, setSettingsSections] = useState<string[]>([]);

  useEffect(() => {
    const headers = buildAuthHeaders();
    if (!headers) return;
    fetch(`${API_BASE_URL}/settings`, { headers })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.table_sections)) setSettingsSections(d.table_sections); })
      .catch(() => {});
  }, []);

  const allSectionSuggestions = Array.from(new Set([...existingSections, ...settingsSections, ...SECTION_SUGGESTIONS]));

  const goToLogin = (message = "Session expired. Please login again.") => {
    setError(message);
    clearAuthSession();
    setTimeout(() => navigate("/admin-login"), 300);
  };

  const toUiTable = (table: ApiTable): Table => ({
    id: table.id,
    number: table.table_number,
    capacity: table.capacity,
    status: table.status,
    section: table.section,
    currentOrder: table.current_order || undefined,
    reservedBy: table.reserved_by || undefined,
    estimatedTime: table.estimated_time || undefined,
    occupiedSince: table.occupied_since || undefined,
  });

  const toUiReservation = (reservation: ApiReservation): Reservation => ({
    id: reservation.id,
    customerName: reservation.customer_name,
    tableNumber: reservation.table_number,
    status: reservation.status,
  });

  const loadTableContext = async (silent = false) => {
    try {
      if (!silent) setError("");
      const headers = buildAuthHeaders();
      if (!headers) {
        goToLogin("Please login to continue.");
        return;
      }

      const [tablesResponse, reservationsResponse, ordersResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/tables`, { headers }),
        fetch(`${API_BASE_URL}/reservations`, { headers }),
        fetch(`${API_BASE_URL}/orders`, { headers }),
      ]);

      const tablesData = await tablesResponse.json();
      const reservationsData = await reservationsResponse.json();
      const ordersData = await ordersResponse.json();

      if (isAuthError(tablesResponse.status) || isAuthError(reservationsResponse.status) || isAuthError(ordersResponse.status)) {
        goToLogin(tablesData?.error || reservationsData?.error || ordersData?.error || "Session expired. Please login again.");
        return;
      }

      if (!tablesResponse.ok || !reservationsResponse.ok || !ordersResponse.ok) {
        if (!silent) setError("Unable to load table context.");
        return;
      }

      setTables((Array.isArray(tablesData) ? tablesData : []).map(toUiTable));
      setReservations((Array.isArray(reservationsData) ? reservationsData : []).map(toUiReservation));
      setOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch {
      if (!silent) setError("Unable to connect to backend.");
    }
  };

  useEffect(() => {
    loadTableContext();

    const refreshInterval = setInterval(() => loadTableContext(true), 15000);
    const clockInterval = setInterval(() => setClockTick(Date.now()), 30000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const handleAddTable = async () => {
    // Validate required fields
    if (!newTable.number || !newTable.capacity) {
      toast.error("Please fill all required fields");
      return;
    }
    // Validate positive capacity and number
    if (Number(newTable.number) <= 0 || Number(newTable.capacity) <= 0) {
      toast.error("Table number and capacity must be positive");
      return;
    }
    // Validate unique table number
    if (tables.some(t => t.number === Number(newTable.number))) {
      toast.error(`Table ${newTable.number} already exists. Please use a different number.`);
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
      const response = await fetch(`${API_BASE_URL}/tables`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          table_number: Number(newTable.number),
          capacity: Number(newTable.capacity),
          section: newTable.section.trim() || "General",
        }),
      });
      const data = await response.json();
      if (isAuthError(response.status)) {
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }
      if (!response.ok) {
        setError(data?.error || "Unable to add table.");
        toast.error(data?.error || "Unable to add table.");
        return;
      }

      await loadTableContext(true);
      setNewTable({ number: "", capacity: "", section: "" });
      setIsAddDialogOpen(false);
      toast.success("Table added successfully");
    } catch {
      setError("Unable to connect to backend.");
      toast.error("Unable to connect to backend.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (tableId: number, newStatus: Table["status"]) => {
    const previous = tables;
    setTables((prev) => prev.map((table) => (table.id === tableId ? { ...table, status: newStatus } : table)));

    try {
      const headers = buildAuthHeaders();
      if (!headers) {
        goToLogin("Please login to continue.");
        return;
      }
      const response = await fetch(`${API_BASE_URL}/tables/${tableId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await response.json();
      if (isAuthError(response.status)) {
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }
      if (!response.ok) {
        setTables(previous);
        setError(data?.error || "Unable to update status.");
        toast.error(data?.error || "Unable to update status.");
        return;
      }
      await loadTableContext(true);
      toast.success("Table status updated");
    } catch {
      setTables(previous);
      setError("Unable to connect to backend.");
      toast.error("Unable to connect to backend.");
    }
  };

  const handleDeleteTable = async (tableId: number) => {
    const previous = tables;
    setTables((prev) => prev.filter((table) => table.id !== tableId));
    try {
      const headers = buildAuthHeaders();
      if (!headers) {
        goToLogin("Please login to continue.");
        return;
      }
      const response = await fetch(`${API_BASE_URL}/tables/${tableId}`, { method: "DELETE", headers });
      const data = await response.json();
      if (isAuthError(response.status)) {
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }
      if (!response.ok) {
        setTables(previous);
        setError(data?.error || "Unable to delete table.");
        toast.error(data?.error || "Unable to delete table.");
        return;
      }
      await loadTableContext(true);
      toast.success("Table deleted");
    } catch {
      setTables(previous);
      setError("Unable to connect to backend.");
      toast.error("Unable to connect to backend.");
    }
  };

  const seatGuest = async (table: Table, reservation: Reservation) => {
    setSeatingReservationId(reservation.id);
    try {
      setError("");
      const headers = buildAuthHeaders();
      if (!headers) {
        goToLogin("Please login to continue.");
        return;
      }

      const [reservationResponse, tableResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/reservations/${reservation.id}/status`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "seated" }),
        }),
        fetch(`${API_BASE_URL}/tables/${table.id}/status`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "occupied" }),
        }),
      ]);

      const reservationData = await reservationResponse.json();
      const tableData = await tableResponse.json();

      if (isAuthError(reservationResponse.status) || isAuthError(tableResponse.status)) {
        goToLogin(reservationData?.error || tableData?.error || "Session expired. Please login again.");
        return;
      }

      if (!reservationResponse.ok || !tableResponse.ok) {
        setError(reservationData?.error || tableData?.error || "Unable to seat guest.");
        return;
      }

      toast.success(`Guest seated at Table ${table.number}`);
      await loadTableContext(true);
    } catch {
      setError("Unable to connect to backend.");
    } finally {
      setSeatingReservationId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-green-500";
      case "occupied": return "bg-red-500";
      case "reserved": return "bg-yellow-500";
      case "maintenance": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available": return <Badge className="bg-green-500">Available</Badge>;
      case "occupied": return <Badge className="bg-red-500">Occupied</Badge>;
      case "reserved": return <Badge className="bg-yellow-500">Reserved</Badge>;
      case "maintenance": return <Badge className="bg-gray-500">Maintenance</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const filteredTables = tables.filter(table => {
    const sectionMatch = filterSection === "all" || table.section === filterSection;
    const statusMatch = filterStatus === "all" || table.status === filterStatus;
    return sectionMatch && statusMatch;
  });

  const stats = {
    total: tables.length,
    available: tables.filter(t => t.status === "available").length,
    occupied: tables.filter(t => t.status === "occupied").length,
    reserved: tables.filter(t => t.status === "reserved").length,
  };

  const openBillsByTable = useMemo(() => {
    const map = new Map<number, number>();
    for (const order of orders) {
      if (order.table_number === null || order.table_number === undefined) continue;
      if (order.status === "served") continue;
      const current = map.get(order.table_number) || 0;
      map.set(order.table_number, current + Number(order.total));
    }
    return map;
  }, [orders]);

  const reservationByTable = useMemo(() => {
    const map = new Map<number, Reservation>();
    for (const reservation of reservations) {
      if (!reservation.status || !["pending", "confirmed"].includes(reservation.status)) continue;
      const parsed = Number(String(reservation.tableNumber).replace(/\D/g, ""));
      if (!Number.isFinite(parsed)) continue;
      if (!map.has(parsed)) map.set(parsed, reservation);
    }
    return map;
  }, [reservations]);

  const getOccupancyMinutes = (table: Table) => {
    if (!table.occupiedSince || table.status !== "occupied") return null;
    const started = new Date(table.occupiedSince).getTime();
    if (!Number.isFinite(started)) return null;
    return Math.max(0, Math.floor((clockTick - started) / 60000));
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Order Details Dialog */}
        <Dialog open={isOrderDialogOpen} onOpenChange={setIsOrderDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Order Details</DialogTitle>
              <DialogDescription>Order #{selectedOrderForView?.id}</DialogDescription>
            </DialogHeader>
            {selectedOrderForView && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 font-semibold">Order ID</p>
                    <p className="text-sm font-bold">ORD-{selectedOrderForView.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-semibold">Table</p>
                    <p className="text-sm font-bold">Table {selectedOrderForView.table_number}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-600 font-semibold mb-2">Status</p>
                  <Badge className={`${
                    selectedOrderForView.status === "pending" ? "bg-yellow-500" :
                    selectedOrderForView.status === "preparing" ? "bg-blue-500" :
                    selectedOrderForView.status === "ready" ? "bg-green-600" :
                    "bg-gray-500"
                  }`}>
                    {selectedOrderForView.status.toUpperCase()}
                  </Badge>
                </div>

                <div>
                  <p className="text-xs text-gray-600 font-semibold mb-2">Items</p>
                  <div className="bg-gray-50 rounded p-3 max-h-40 overflow-y-auto">
                    {selectedOrderForView.items && selectedOrderForView.items.length > 0 ? (
                      <ul className="space-y-1">
                        {selectedOrderForView.items.map((item, idx) => (
                          <li key={idx} className="text-sm text-gray-800">• {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500">No items</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 font-semibold">Total Amount</p>
                    <p className="text-lg font-bold text-green-600">Rs. {Number(selectedOrderForView.total).toLocaleString("en-IN")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-semibold">Payment Status</p>
                    <Badge className={selectedOrderForView.paymentStatus === "paid" ? "bg-green-100 text-green-800" : "bg-primary-100 text-primary-800"}>
                      {selectedOrderForView.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                    </Badge>
                  </div>
                </div>

                {selectedOrderForView.paymentMethod && (
                  <div>
                    <p className="text-xs text-gray-600 font-semibold">Payment Method</p>
                    <p className="text-sm font-medium">{selectedOrderForView.paymentMethod.toUpperCase()}</p>
                  </div>
                )}

                {selectedOrderForView.created_at && (
                  <div>
                    <p className="text-xs text-gray-600 font-semibold">Order Time</p>
                    <p className="text-sm">{new Date(selectedOrderForView.created_at).toLocaleString()}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOrderDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* QR Code Dialog */}
        <Dialog open={isQRDialogOpen} onOpenChange={setIsQRDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Table {selectedTableForQR?.number} - QR Code</DialogTitle>
              <DialogDescription>Scan this QR code to start ordering</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              {selectedTableForQR && (
                <>
                  <img
                    src={generateTableQRCode(selectedTableForQR.id)}
                    alt={`QR Code for Table ${selectedTableForQR.number}`}
                    className="w-64 h-64 border-2 border-gray-200 rounded-lg p-2"
                  />
                  <p className="text-sm text-gray-600 text-center">
                    Customers can scan this QR code to view the menu and place orders for Table {selectedTableForQR.number}
                  </p>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsQRDialogOpen(false)}>Close</Button>
              {selectedTableForQR && (
                <Button onClick={() => navigate(`/table-qr/${selectedTableForQR.id}`)}>
                  <QrCode className="h-4 w-4 mr-2" />
                  Scan to Order
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-primary-600">Table Management</h1>
            <p className="text-gray-800 font-semibold mt-1">Manage restaurant seating and table availability</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) setNewTable({ number: "", capacity: "", section: "" });
            }}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add Table
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Table</DialogTitle>
                <DialogDescription>Create a new table in your restaurant</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="number">Table Number *</Label>
                  <Input
                    id="number"
                    type="number"
                    placeholder="1"
                    value={newTable.number}
                    onChange={(e) => setNewTable({ ...newTable, number: e.target.value })}
                  />
                  {tables.length > 0 && (
                    <p className="text-xs text-gray-700 font-medium">
                      Existing: {tables.map(t => t.number).sort((a,b) => a-b).join(", ")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacity">Seating Capacity *</Label>
                  <Input
                    id="capacity"
                    type="number"
                    placeholder="4"
                    value={newTable.capacity}
                    onChange={(e) => setNewTable({ ...newTable, capacity: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="section">Section <span className="text-xs text-gray-700">(optional)</span></Label>
                  <Input
                    id="section"
                    list="section-suggestions"
                    placeholder="e.g. Main Hall, Rooftop, Garden..."
                    value={newTable.section}
                    onChange={(e) => setNewTable({ ...newTable, section: e.target.value })}
                  />
                  <datalist id="section-suggestions">
                    {allSectionSuggestions.map(s => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <p className="text-xs text-gray-700 font-medium">Type any section name or pick a suggestion.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddTable} disabled={saving}>{saving ? "Saving..." : "Add Table"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-gray-900">Total Tables</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-green-700">Available</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.available}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-red-700">Occupied</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.occupied}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-yellow-700">Reserved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.reserved}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filter Tables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Section</Label>
                <Select value={filterSection} onValueChange={setFilterSection}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {existingSections.map(section => (
                      <SelectItem key={section} value={section}>{section}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                    <SelectItem value="reserved">Reserved</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tables Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTables.map(table => (
            <Card key={table.id} className="relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-1 ${getStatusColor(table.status)}`} />
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl">Table {table.number}</CardTitle>
                    <CardDescription className="text-xs mt-1">{table.section}</CardDescription>
                  </div>
                  {getStatusBadge(table.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-gray-500" />
                  <span>{table.capacity} seats</span>
                </div>
                {(() => {
                  const minutes = getOccupancyMinutes(table);
                  if (minutes === null) return null;
                  const overdue = minutes >= 90;
                  return (
                    <div className={`flex items-center gap-2 text-sm ${overdue ? "text-red-600 font-medium" : "text-gray-700"}`}>
                      <Clock className="h-4 w-4" />
                      <span>{minutes} min occupied {overdue ? "(overdue)" : ""}</span>
                    </div>
                  );
                })()}
                {table.currentOrder && (
                  <div className="text-sm">
                    <span className="font-medium">Order: </span>
                    <span className="text-blue-600">{table.currentOrder}</span>
                  </div>
                )}
                {openBillsByTable.get(table.number) ? (
                  <div className="text-sm">
                    <span className="font-medium">Open bill: </span>
                    <span className="text-secondary-700">Rs. {(openBillsByTable.get(table.number) || 0).toLocaleString("en-IN")}</span>
                  </div>
                ) : null}
                {reservationByTable.get(table.number) ? (
                  <div className="text-sm">
                    <span className="font-medium">Upcoming: </span>
                    <span>{reservationByTable.get(table.number)?.customerName}</span>
                  </div>
                ) : null}
                {table.reservedBy && (
                  <div className="text-sm">
                    <span className="font-medium">Reserved by: </span>
                    <span>{table.reservedBy}</span>
                  </div>
                )}
                {table.estimatedTime && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span>{table.estimatedTime}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate(`/billing?table=${table.number}`)}
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    Open Bill
                  </Button>
                  {openBillsByTable.get(table.number) && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const tableOrder = orders.find(o => o.table_number === table.number && o.status !== "served");
                        if (tableOrder) {
                          setSelectedOrderForView(tableOrder);
                          setIsOrderDialogOpen(true);
                        }
                      }}
                      title="View Order Details"
                    >
                      <Receipt className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setSelectedTableForQR(table);
                      setIsQRDialogOpen(true);
                    }}
                    title="Show QR Code"
                  >
                    <QrCode className="h-4 w-4" />
                  </Button>
                  {reservationByTable.get(table.number) && (
                    <Button
                      className="flex-1"
                      disabled={seatingReservationId === reservationByTable.get(table.number)?.id}
                      onClick={() => seatGuest(table, reservationByTable.get(table.number) as Reservation)}
                    >
                      {seatingReservationId === reservationByTable.get(table.number)?.id ? "Seating..." : "Seat Guest"}
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Select onValueChange={(value) => handleUpdateStatus(table.id, value as Table["status"])}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Change Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="occupied">Occupied</SelectItem>
                      <SelectItem value="reserved">Reserved</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDeleteTable(table.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredTables.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">No tables found matching your filters</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

