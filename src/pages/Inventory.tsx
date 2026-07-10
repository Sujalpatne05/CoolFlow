import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Plus, Search, AlertTriangle, Package } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

type InventoryItem = {
  id: number;
  name: string;
  unit: string;
  stock?: number;
  quantity?: number;
  min_stock: number;
  max_stock: number;
  category: string;
  updated_at?: string;
};

const formatUpdatedLabel = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
};

const CATEGORIES = ["Meat", "Dairy", "Grains", "Vegetables", "Spices", "Oils", "Other"];
const UNITS = ["kg", "L", "pieces", "boxes", "packets"];

const Inventory = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [restockModal, setRestockModal] = useState<{ open: boolean; itemId: number | null }>({ open: false, itemId: null });
  const [restockQty, setRestockQty] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState({
    name: "",
    unit: "kg",
    stock: 0,
    minStock: 0,
    maxStock: 0,
    category: "Other",
  });

  const loadItems = useCallback(async () => {
    const headers = buildAuthHeaders();
    if (!headers) {
      clearAuthSession();
      window.location.href = "/admin-login";
      return;
    }

    const response = await fetch(`${API_BASE_URL}/inventory`, { headers });
    if (isAuthError(response.status)) {
      clearAuthSession();
      window.location.href = "/admin-login";
      return;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Failed to load inventory");
    }

    // Normalize data: backend returns 'quantity', frontend uses 'stock'
    const normalizedData = Array.isArray(data) ? data.map(item => ({
      ...item,
      stock: item.stock || item.quantity || 0,
      updated_at: item.updated_at || new Date().toISOString()
    })) : [];
    setItems(normalizedData);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await loadItems();
      } catch (error) {
        // Inventory load error
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [loadItems]);

  const handleModalClose = () => {
    setShowAddModal(false);
    setNewItem({ name: "", unit: "kg", stock: 0, minStock: 0, maxStock: 0, category: "Other" });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewItem((prev) => ({
      ...prev,
      [name]: name === "stock" || name === "minStock" || name === "maxStock" ? Number(value) : value,
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Validation
    if (!newItem.name.trim()) {
      alert("Item name is required");
      return;
    }
    if (newItem.name.trim().length < 2 || newItem.name.trim().length > 100) {
      alert("Item name must be 2-100 characters");
      return;
    }
    if (newItem.stock < 0) {
      alert("Stock cannot be negative");
      return;
    }
    if (newItem.minStock < 0) {
      alert("Minimum stock cannot be negative");
      return;
    }
    if (newItem.maxStock < 0) {
      alert("Maximum stock cannot be negative");
      return;
    }
    if (newItem.minStock >= newItem.maxStock) {
      alert("Minimum stock must be less than maximum stock");
      return;
    }
    if (newItem.stock > newItem.maxStock) {
      alert("Current stock cannot exceed maximum stock");
      return;
    }
    if (newItem.stock < newItem.minStock) {
      alert("Current stock should be at least minimum stock");
      return;
    }
    
    const headers = buildAuthHeaders();
    if (!headers) return;

    const response = await fetch(`${API_BASE_URL}/inventory`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: newItem.name.trim(),
        unit: newItem.unit,
        stock: Number(newItem.stock),
        min_stock: Number(newItem.minStock),
        max_stock: Number(newItem.maxStock),
        category: newItem.category,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data?.error || "Unable to add inventory item");
      return;
    }

    await loadItems();
    handleModalClose();
  };

  const handleRestockOpen = (item: InventoryItem) => {
    setRestockModal({ open: true, itemId: item.id });
    setRestockQty(item.stock);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this inventory item?")) return;
    const headers = buildAuthHeaders();
    if (!headers) return;
    const response = await fetch(`${API_BASE_URL}/inventory/${id}`, { method: "DELETE", headers });
    if (response.ok) {
      setItems(prev => prev.filter(i => i.id !== id));
    } else {
      alert("Unable to delete item");
    }
  };

  const handleRestockClose = () => {
    setRestockModal({ open: false, itemId: null });
    setRestockQty(0);
  };

  const handleRestockSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!restockModal.itemId) return;
    
    // Validation
    if (restockQty < 0) {
      alert("Stock cannot be negative");
      return;
    }
    if (restockQty > 999999) {
      alert("Stock quantity seems unrealistic (max: 999,999)");
      return;
    }
    
    const headers = buildAuthHeaders();
    if (!headers) return;

    const response = await fetch(`${API_BASE_URL}/inventory/${restockModal.itemId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ quantity: Number(restockQty) }),
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data?.error || "Unable to update stock");
      return;
    }

    await loadItems();
    handleRestockClose();
  };

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const query = search.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query));
  }, [items, search]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-emerald-600">Inventory</h1>
            <p className="text-muted-foreground">Track stock levels and supplies</p>
          </div>
          <Button className="gradient-warm text-primary-foreground gap-2" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" /> Add Stock
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Total Items" value={`${filteredItems.length}`} icon={<Package className="h-5 w-5" />} />
          <StatCard
            title="Low Stock Items"
            value={`${filteredItems.filter((item) => item.stock <= item.min_stock).length}`}
            change="Needs attention"
            changeType="negative"
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <StatCard title="Categories" value={String([...new Set(filteredItems.map((item) => item.category))].length)} icon={<Package className="h-5 w-5" />} />
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search inventory..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="grid gap-3">
          {!loading && filteredItems.length === 0 && (
            <Card className="shadow-card">
              <CardContent className="p-4 text-sm text-muted-foreground">No inventory items found for this restaurant.</CardContent>
            </Card>
          )}
          {filteredItems.map((item) => {
            const denominator = item.max_stock > 0 ? item.max_stock : Math.max(item.stock, 1);
            const percentage = Math.min((item.stock / denominator) * 100, 100);
            const isLow = item.stock <= item.min_stock;
            return (
              <Card key={item.id} className="shadow-card animate-fade-in">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{item.name}</h3>
                        {isLow && (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
                            Low Stock
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.category} - Updated {formatUpdatedLabel(item.updated_at)}</p>
                    </div>
                    <div className="flex items-center gap-6 sm:w-1/2">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Stock Level</span>
                          <span className="font-medium">
                            {item.stock} / {item.max_stock} {item.unit}
                          </span>
                        </div>
                        <Progress
                          value={percentage}
                          className={`h-2 ${isLow ? "[&>div]:bg-destructive" : "[&>div]:gradient-warm"}`}
                        />
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleRestockOpen(item)}>
                        Restock
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDelete(item.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Add Stock Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Stock Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {/* Item Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
              <Input
                name="name"
                value={newItem.name}
                onChange={handleInputChange}
                placeholder="e.g., Chicken, Paneer, Rice"
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                name="category"
                value={newItem.category}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                required
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Unit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
              <select
                name="unit"
                value={newItem.unit}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                required
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>

            {/* Current Stock */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Stock *</label>
              <Input
                name="stock"
                type="number"
                min="0"
                step="1"
                value={newItem.stock || ""}
                onChange={handleInputChange}
                placeholder="0"
                required
              />
            </div>

            {/* Min Stock */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Stock Level *</label>
              <Input
                name="minStock"
                type="number"
                min="0"
                step="1"
                value={newItem.minStock || ""}
                onChange={handleInputChange}
                placeholder="Alert when stock falls below this"
                required
              />
            </div>

            {/* Max Stock */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Stock Level *</label>
              <Input
                name="maxStock"
                type="number"
                min="0"
                step="1"
                value={newItem.maxStock || ""}
                onChange={handleInputChange}
                placeholder="Target stock level"
                required
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={handleModalClose}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 gradient-warm text-primary-foreground">
                Add Item
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Restock Modal */}
      <Dialog open={restockModal.open} onOpenChange={handleRestockClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restock Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRestockSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Stock Quantity *</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={restockQty || ""}
                onChange={(e) => setRestockQty(Number(e.target.value))}
                placeholder="Enter new stock quantity"
                required
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={handleRestockClose}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 gradient-warm text-primary-foreground">
                Update Stock
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Inventory;
