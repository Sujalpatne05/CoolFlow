import React, { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { apiRequest } from "@/lib/api";
import { Settings2, Building2, Receipt, Truck, Upload, X, LayoutGrid, Plus, Printer } from "lucide-react";
import { saveAuthSession, getAuthToken, getStoredRole, getStoredUserId, getStoredRestaurantId } from "@/lib/session";

type SettingsData = {
  name: string;
  owner: string;
  city: string;
  logo_url: string;
  tax_rate: number;
  service_charge: number;
  default_delivery_partner: string;
  table_sections: string[];
  kitchen_printer_ip: string;
  kitchen_printer_port: number;
  counter_printer_ip: string;
  counter_printer_port: number;
};

const DELIVERY_PARTNERS = ["in-house", "swiggy", "zomato"] as const;

const Settings: React.FC = () => {
  const [data, setData] = useState<SettingsData>({
    name: "", owner: "", city: "", logo_url: "",
    tax_rate: 5, service_charge: 0, default_delivery_partner: "in-house",
    table_sections: [],
    kitchen_printer_ip: "", kitchen_printer_port: 9100,
    counter_printer_ip: "", counter_printer_port: 9100,
  });
  const [newSection, setNewSection] = useState("");
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [logoBase64, setLogoBase64] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiRequest<SettingsData>("/settings", { method: "GET" }, true)
      .then(d => {
        setData(current => ({
          ...current,
          ...d,
          kitchen_printer_ip: d.kitchen_printer_ip || "",
          kitchen_printer_port: Number(d.kitchen_printer_port ?? 9100),
          counter_printer_ip: d.counter_printer_ip || "",
          counter_printer_port: Number(d.counter_printer_port ?? 9100),
        }));
        setLogoPreview(d.logo_url || "");
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target?.result as string;
      setLogoBase64(b64);
      setLogoPreview(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const taxRate = Number(data.tax_rate);
    const svcCharge = Number(data.service_charge);
    if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
      toast.error("Tax rate must be 0–100");
      return;
    }
    if (isNaN(svcCharge) || svcCharge < 0 || svcCharge > 100) {
      toast.error("Service charge must be 0–100");
      return;
    }
    if (!data.name.trim()) {
      toast.error("Restaurant name is required");
      return;
    }
    const kitchenPrinterPort = Number(data.kitchen_printer_port);
    const counterPrinterPort = Number(data.counter_printer_port);
    if (!Number.isInteger(kitchenPrinterPort) || kitchenPrinterPort < 1 || kitchenPrinterPort > 65535) {
      toast.error("Kitchen printer port must be between 1 and 65535");
      return;
    }
    if (!Number.isInteger(counterPrinterPort) || counterPrinterPort < 1 || counterPrinterPort > 65535) {
      toast.error("Counter printer port must be between 1 and 65535");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        name: data.name.trim(),
        owner: data.owner.trim(),
        city: data.city.trim(),
        tax_rate: taxRate,
        service_charge: svcCharge,
        default_delivery_partner: data.default_delivery_partner,
        table_sections: data.table_sections,
        kitchen_printer_ip: data.kitchen_printer_ip.trim(),
        kitchen_printer_port: kitchenPrinterPort,
        counter_printer_ip: data.counter_printer_ip.trim(),
        counter_printer_port: counterPrinterPort,
      };
      if (logoBase64) payload.logo_url = logoBase64;

      const updated = await apiRequest<SettingsData>("/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setData(updated);
      setLogoPreview(updated.logo_url || "");
      setLogoBase64("");

      // Update restaurant name in localStorage so sidebar reflects it immediately
      const token = getAuthToken() || "";
      const role = getStoredRole() || "";
      const userId = getStoredUserId();
      const restaurantId = getStoredRestaurantId();
      saveAuthSession(token, role, updated.owner || "", updated.name, restaurantId, false, userId);

      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading settings...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
        <h1 className="text-2xl font-bold text-orange-700 flex items-center gap-2">
          <Settings2 className="text-orange-500" /> Restaurant Settings
        </h1>

        {/* Restaurant Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 size={16} className="text-orange-500" /> Restaurant Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logo */}
            <div>
              <label className="block text-sm font-medium mb-2">Logo</label>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative">
                    <img src={logoPreview} alt="Logo" className="h-16 w-16 rounded-lg object-cover border" />
                    <button
                      onClick={() => { setLogoPreview(""); setLogoBase64(""); setData(d => ({ ...d, logo_url: "" })); }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-lg border-2 border-dashed border-orange-200 flex items-center justify-center text-orange-300">
                    <Upload size={20} />
                  </div>
                )}
                <div>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="text-xs">
                    <Upload size={12} className="mr-1" /> Upload Logo
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 2MB</p>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Restaurant Name</label>
                <Input
                  value={data.name}
                  onChange={e => setData(d => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Sujal Cafe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Owner Name</label>
                <Input
                  value={data.owner}
                  onChange={e => setData(d => ({ ...d, owner: e.target.value }))}
                  placeholder="e.g. Sujal Patne"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <Input
                  value={data.city}
                  onChange={e => setData(d => ({ ...d, city: e.target.value }))}
                  placeholder="e.g. Mumbai"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Billing & Tax */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt size={16} className="text-orange-500" /> Billing & Tax
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tax Rate (%)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={0} max={100} step={0.5}
                    value={data.tax_rate}
                    onChange={e => setData(d => ({ ...d, tax_rate: Number(e.target.value) }))}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Applied on subtotal in POS Billing.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Service Charge (%)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={0} max={100} step={0.5}
                    value={data.service_charge}
                    onChange={e => setData(d => ({ ...d, service_charge: Number(e.target.value) }))}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Added separately on top of tax.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivery */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck size={16} className="text-orange-500" /> Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label className="block text-sm font-medium mb-2">Default Delivery Partner</label>
            <div className="flex gap-2 flex-wrap">
              {DELIVERY_PARTNERS.map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant={data.default_delivery_partner === p ? "default" : "outline"}
                  onClick={() => setData(d => ({ ...d, default_delivery_partner: p }))}
                  className={data.default_delivery_partner === p ? "bg-orange-500 hover:bg-orange-600" : ""}
                >
                  {p === "in-house" ? "In-House" : p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Pre-selected when placing delivery orders in POS.</p>
          </CardContent>
        </Card>

        {/* Printers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Printer size={16} className="text-orange-500" /> Printers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Kitchen Printer IP</label>
                <Input
                  value={data.kitchen_printer_ip}
                  onChange={e => setData(d => ({ ...d, kitchen_printer_ip: e.target.value }))}
                  placeholder="e.g. 192.168.1.50"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Port</label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={data.kitchen_printer_port}
                  onChange={e => setData(d => ({ ...d, kitchen_printer_port: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Counter Printer IP</label>
                <Input
                  value={data.counter_printer_ip}
                  onChange={e => setData(d => ({ ...d, counter_printer_ip: e.target.value }))}
                  placeholder="e.g. 192.168.1.51"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Port</label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={data.counter_printer_port}
                  onChange={e => setData(d => ({ ...d, counter_printer_port: Number(e.target.value) }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Most thermal printers use port 9100.</p>
          </CardContent>
        </Card>

        {/* Table Sections */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutGrid size={16} className="text-orange-500" /> Table Sections
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Define sections for your restaurant (e.g. Rooftop, Garden). These appear as suggestions when adding tables.
            </p>
            <div className="flex flex-wrap gap-2">
              {data.table_sections.length === 0 && (
                <span className="text-xs text-muted-foreground italic">No sections added yet.</span>
              )}
              {data.table_sections.map((s, i) => (
                <span key={i} className="flex items-center gap-1 bg-orange-100 text-orange-700 text-xs px-3 py-1 rounded-full font-medium">
                  {s}
                  <button
                    onClick={() => setData(d => ({ ...d, table_sections: d.table_sections.filter((_, idx) => idx !== i) }))}
                    className="ml-1 hover:text-red-500"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Rooftop, Garden, Terrace..."
                value={newSection}
                onChange={e => setNewSection(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const trimmed = newSection.trim();
                    if (!trimmed) return;
                    if (data.table_sections.includes(trimmed)) { toast.error("Section already exists"); return; }
                    setData(d => ({ ...d, table_sections: [...d.table_sections, trimmed] }));
                    setNewSection("");
                  }
                }}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const trimmed = newSection.trim();
                  if (!trimmed) return;
                  if (data.table_sections.includes(trimmed)) { toast.error("Section already exists"); return; }
                  setData(d => ({ ...d, table_sections: [...d.table_sections, trimmed] }));
                  setNewSection("");
                }}
              >
                <Plus size={14} className="mr-1" /> Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-orange-500 hover:bg-orange-600"
        >
          {saving ? "Saving..." : "Save All Settings"}
        </Button>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
