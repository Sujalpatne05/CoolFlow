import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Edit, Trash2, Star, Upload, Download, X, CheckCircle, AlertCircle } from "lucide-react";
import React, { Fragment, useEffect, useState } from "react";
import { Transition, Dialog } from "@headlessui/react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { toast } from "@/components/ui/sonner";

const DEFAULT_CATEGORIES = ["Starters", "Main Course", "Breads", "Rice", "Desserts", "Beverages"];
const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

type MenuItem = {
  id: number;
  name: string;
  category: string;
  price: number;
  available: boolean;
  popular: boolean;
  image_url: string;
};

type MenuItemForm = {
  name: string;
  category: string;
  price: string;
  available: boolean;
  image_url: string;
};

const MenuManagement = () => {
  const navigate = useNavigate();
  // Add missing state for image upload and preview
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newItem, setNewItem] = useState<MenuItemForm>({ name: "", category: "", price: "", available: true, image_url: "" });
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; errors: any[] } | null>(null);
  const [importing, setImporting] = useState(false);

  // Dynamic categories — only show categories that have actual menu items
  // DEFAULT_CATEGORIES are only used as autocomplete suggestions, not as tabs
  const dynamicCategories = React.useMemo(() => {
    const fromItems = menuItems.map(i => i.category).filter(Boolean);
    const unique = Array.from(new Set(fromItems));
    return ["All", ...unique];
  }, [menuItems]);

  const goToLogin = (message = "Session expired. Please login again.") => {
    setError(message);
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("isSuperAdmin");
    setTimeout(() => navigate("/admin-login"), 300);
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem("authToken");
    if (!token) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const toUiItem = (item: { id: number; name: string; price: number; available: boolean; category?: string; image_url?: string }, fallback?: Partial<MenuItem>): MenuItem => ({
    id: item.id,
    name: item.name,
    category: item.category || fallback?.category || "Beverages",
    price: Number(item.price),
    available: item.available,
    popular: fallback?.popular ?? false,
    image_url: item.image_url || fallback?.image_url || "",
  });

  const loadMenuItems = async () => {
    try {
      setError("");
      const headers = getAuthHeaders();
      if (!headers) {
        goToLogin("Please login to manage menu items.");
        return;
      }
      const response = await fetch(`${API_BASE_URL}/menu`, {
        method: "GET",
        headers,
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) {
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }
      if (!response.ok) {
        setError(data?.error || "Unable to load menu items.");
        return;
      }
      setMenuItems((data || []).map((item: { id: number; name: string; price: number; available: boolean }) => toUiItem(item)));
    } catch {
      setError("Unable to connect to backend.");
    }
  };

  useEffect(() => {
    loadMenuItems();
  }, []);

  const handleOpenModal = (item?: MenuItem) => {
    if (item) {
      setEditItemId(item.id);
      setNewItem({
        name: item.name,
        category: item.category,
        price: String(item.price),
        available: item.available,
        image_url: item.image_url || "",
      });
      setImagePreview(item.image_url || "");
    } else {
      setEditItemId(null);
      setNewItem({ name: "", category: "", price: "", available: true, image_url: "" });
      setImagePreview("");
    }
    setImageFile(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => setIsModalOpen(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : false;
    const newValue = type === "checkbox" ? checked : value;
    setNewItem((prev) => {
      const updated = { ...prev, [name]: newValue };
      return updated;
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate category is selected
    if (!newItem.category || newItem.category.trim() === "") {
      setError("Please select a category");
      return;
    }
    
    // Validate name
    if (!newItem.name.trim()) {
      setError("Item name is required");
      return;
    }
    if (newItem.name.trim().length < 2 || newItem.name.trim().length > 100) {
      setError("Item name must be 2-100 characters");
      return;
    }
    
    // Validate price
    const price = Number(newItem.price);
    if (!newItem.price || isNaN(price)) {
      setError("Price is required and must be a number");
      return;
    }
    if (price <= 0) {
      setError("Price must be greater than 0");
      return;
    }
    if (price > 10000) {
      setError("Price seems unrealistic (max: 10,000)");
      return;
    }
    
    let imageUrl = newItem.image_url || "";
    // If a file was selected, convert to base64 and let the backend upload to Cloudinary
    if (imageFile) {
      try {
        setSaving(true);
        imageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(imageFile);
        });
      } catch (err: any) {
        setError(err?.message || "Failed to read image file");
        setSaving(false);
        return;
      }
    }
    const payload: any = {
      name: newItem.name.trim(),
      category: newItem.category.trim(),
      price: Number(newItem.price),
      available: newItem.available,
    };
    // Only include image_url if a new image was uploaded or a URL was manually set
    if (imageUrl) {
      payload.image_url = imageUrl;
    }

    try {
      setSaving(true);
      setError("");
      const headers = getAuthHeaders();
      if (!headers) {
        goToLogin("Please login to manage menu items.");
        setSaving(false);
        return;
      }
      const isEdit = editItemId !== null;
      const response = await fetch(
        isEdit ? `${API_BASE_URL}/menu/${editItemId}` : `${API_BASE_URL}/menu`,
        {
          method: isEdit ? "PUT" : "POST",
          headers,
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();
      if (response.status === 401 || response.status === 403) {
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }
      if (!response.ok) {
        setError(data?.error || "Unable to save menu item.");
        setSaving(false);
        return;
      }

      const savedItem = toUiItem(data);
      if (isEdit) {
        setMenuItems((prev) => prev.map((item) => (item.id === savedItem.id ? { ...item, ...savedItem } : item)));
      } else {
        setMenuItems((prev) => [...prev, savedItem]);
      }
      setNewItem({ name: "", category: "", price: "", available: true, image_url: "" });
      setImageFile(null);
      setImagePreview("");
      setEditItemId(null);
      handleCloseModal();
    } catch {
      setError("Unable to connect to backend.");
    } finally {
      setSaving(false);
    }
  };

  // CSV template download
  const downloadTemplate = () => {
    const csv = `name,category,price,description,available,image_url\nButter Chicken,Main Course,350,Creamy tomato gravy,true,\nGarlic Naan,Breads,60,,true,\nGulab Jamun,Desserts,120,,true,`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse CSV or Excel file
  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      // Parse Excel
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          // Normalize keys to lowercase
          const normalized = rows.map(row => {
            const obj: any = {};
            Object.keys(row).forEach(k => { obj[k.toLowerCase().trim()] = row[k]; });
            return obj;
          }).filter(row => row.name && row.name.toString().trim());
          setImportPreview(normalized);
          setImportResult(null);
          if (normalized.length === 0) {
            toast.error('No valid items found in the file');
          }
        } catch (error) {
          toast.error('Error parsing Excel file');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Parse CSV with proper quote handling
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.trim().split('\n');
          
          // Parse CSV header
          const headerLine = lines[0];
          const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().trim());
          
          // Parse CSV rows
          const rows = lines.slice(1)
            .filter(line => line.trim())
            .map(line => {
              const values = parseCSVLine(line);
              const obj: any = {};
              headers.forEach((h, i) => { obj[h] = values[i] || ''; });
              return obj;
            })
            .filter(row => row.name && row.name.toString().trim());
          
          setImportPreview(rows);
          setImportResult(null);
          if (rows.length === 0) {
            toast.error('No valid items found in the file');
          }
        } catch (error) {
          toast.error('Error parsing CSV file');
        }
      };
      reader.readAsText(file);
    }
  };

  // Helper function to parse CSV line with proper quote handling
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote state
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current.trim());
    return result;
  };

  // Submit bulk import
  const handleBulkImport = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
    try {
      const headers = getAuthHeaders();
      if (!headers) return;
      const response = await fetch(`${API_BASE_URL}/menu/bulk`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ items: importPreview }),
      });
      const data = await response.json();
      if (response.ok) {
        setImportResult({ inserted: data.inserted, skipped: data.skipped, errors: data.errors });
        setImportPreview([]);
        await loadMenuItems();
      } else {
        setError(data?.error || 'Import failed');
      }
    } catch {
      setError('Unable to connect to backend');
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (itemId: number) => {
    try {
      setError("");
      const headers = getAuthHeaders();
      if (!headers) {
        goToLogin("Please login to manage menu items.");
        return;
      }
      const response = await fetch(`${API_BASE_URL}/menu/${itemId}`, {
        method: "DELETE",
        headers,
      });

      if (response.status === 401 || response.status === 403) {
        const data = await response.json();
        goToLogin(data?.error || "Session expired. Please login again.");
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setError(data?.error || "Unable to delete menu item.");
        return;
      }

      setMenuItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch {
      setError("Unable to connect to backend.");
    }
  };
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Menu Management</h1>
            <p className="text-muted-foreground">{menuItems.length} items across {dynamicCategories.length - 1} categories</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => { setShowImportModal(true); setImportPreview([]); setImportResult(null); }}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button className="gradient-warm text-primary-foreground gap-2" onClick={() => handleOpenModal()}>
              <Plus className="h-4 w-4" /> Add Item
            </Button>
          </div>
          <Transition appear show={isModalOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={handleCloseModal}>
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <div className="fixed inset-0 bg-black bg-opacity-25" />
              </Transition.Child>
              <div className="fixed inset-0 flex items-center justify-center p-4">
                <Transition.Child
                  as={Fragment}
                  enter="ease-out duration-300"
                  enterFrom="opacity-0 scale-95"
                  enterTo="opacity-100 scale-100"
                  leave="ease-in duration-200"
                  leaveFrom="opacity-100 scale-100"
                  leaveTo="opacity-0 scale-95"
                >
                  <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                    <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-4">
                      {editItemId ? "Edit Menu Item" : "Add New Menu Item"}
                    </Dialog.Title>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Name</label>
                        <input type="text" name="name" value={newItem.name} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Category</label>
                        <input
                          type="text"
                          name="category"
                          value={newItem.category}
                          onChange={handleChange}
                          required
                          placeholder="e.g. Starters, Main Course, or type custom..."
                          list="category-suggestions"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2"
                        />
                        <datalist id="category-suggestions">
                          {dynamicCategories.filter(c => c !== "All").map(cat => (
                            <option key={cat} value={cat} />
                          ))}
                        </datalist>
                        <p className="text-xs text-gray-400 mt-1">Select from suggestions or type a new category</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Price</label>
                        <input type="number" name="price" value={newItem.price} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Food Image</label>
                        <input type="file" accept="image/*" onChange={handleImageChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm" />
                        {imagePreview && (
                          <img src={imagePreview} alt="Preview" className="mt-2 rounded w-full h-32 object-cover" />
                        )}
                        {!imagePreview && newItem.image_url && (
                          <img src={newItem.image_url} alt="Preview" className="mt-2 rounded w-full h-32 object-cover" />
                        )}
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" name="available" checked={newItem.available} onChange={handleChange} className="mr-2" />
                        <label className="text-sm">Available</label>
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                        <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white rounded disabled:opacity-60">
                          {saving ? (imageFile ? "Uploading..." : "Saving...") : (editItemId ? "Update Item" : "Add Item")}
                        </button>
                      </div>
                    </form>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </Dialog>
          </Transition>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search menu items..." className="pl-9" />
        </div>

        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="flex-wrap h-auto gap-1">
            {dynamicCategories.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="text-xs">
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>

          {dynamicCategories.map((cat) => (
            <TabsContent key={cat} value={cat}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {menuItems
                  .filter((item) => cat === "All" || item.category === cat)
                  .map((item) => (
                    <Card key={item.id} className="shadow-card hover:shadow-elevated transition-shadow animate-scale-in">
                      <CardContent className="p-4">
                        {item.image_url && (item.image_url.startsWith('http') || item.image_url.startsWith('data:')) && (
                          <img src={item.image_url} alt={item.name} className="rounded-lg w-full h-40 object-cover mb-2" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-lg">{item.name}</h3>
                              {item.popular && (
                                <Badge className="gradient-warm text-primary-foreground text-[10px] border-0">
                                  Popular
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{item.category}</p>
                            {/* No rating, only image, name, price, and availability */}
                          </div>
                          <p className="text-lg font-bold">₹{item.price}</p>
                        </div>
                        <div className="flex items-center justify-between mt-4 pt-3 border-t">
                          <Badge variant={item.available ? "outline" : "secondary"} className={item.available ? "text-success border-success/30" : ""}>
                            {item.available ? "Available" : "Unavailable"}
                          </Badge>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenModal(item)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">Import Menu from CSV</h2>
              <button onClick={() => setShowImportModal(false)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Step 1: Download template */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-800 mb-2">Step 1: Download the template</p>
                <p className="text-xs text-blue-600 mb-3">Fill in your menu items in the CSV. Columns: name, category, price, description, available, image_url</p>
                <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-2">
                  <Download size={14} /> Download Template
                </Button>
              </div>

              {/* Step 2: Upload CSV */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Step 2: Upload your filled CSV or Excel file</p>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleCSVFile} className="text-sm" />
                <p className="text-xs text-gray-400 mt-1">Supports .csv, .xlsx, .xls</p>
              </div>

              {/* Preview */}
              {importPreview.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">{importPreview.length} items ready to import:</p>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Name</th>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-left">Price</th>
                          <th className="px-3 py-2 text-left">Available</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 10).map((row, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2">{row.name}</td>
                            <td className="px-3 py-2">{row.category}</td>
                            <td className="px-3 py-2">₹{row.price}</td>
                            <td className="px-3 py-2">{row.available !== 'false' ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                        {importPreview.length > 10 && (
                          <tr><td colSpan={4} className="px-3 py-2 text-gray-400">...and {importPreview.length - 10} more</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Button className="mt-3 w-full gradient-warm text-primary-foreground" onClick={handleBulkImport} disabled={importing}>
                    {importing ? 'Importing...' : `Import ${importPreview.length} Items`}
                  </Button>
                </div>
              )}

              {/* Result */}
              {importResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                    <CheckCircle size={16} />
                    <span className="text-sm font-semibold">{importResult.inserted} items imported successfully</span>
                  </div>
                  {importResult.skipped > 0 && (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <AlertCircle size={16} />
                      <span className="text-sm">{importResult.skipped} rows skipped (missing name or invalid price)</span>
                    </div>
                  )}
                  <Button className="w-full" onClick={() => setShowImportModal(false)}>Done</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default MenuManagement;

// Upload image to backend and return URL
const uploadImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64String = reader.result as string;
        const token = localStorage.getItem('authToken');
        const { API_BASE_URL } = await import('@/lib/api');
        const res = await fetch(`${API_BASE_URL}/menu/image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ image: base64String }),
        });
        if (!res.ok) throw new Error('Image upload failed');
        const data = await res.json();
        if (!data.url || !data.url.startsWith('http')) throw new Error('Image upload failed — invalid URL returned');
        resolve(data.url);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

