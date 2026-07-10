import React, { useEffect, useMemo, useState } from "react";
import SuperAdminLayout from "../components/SuperAdminLayout";
import { Settings, Bell, Shield, Globe, Database, Mail } from "lucide-react";
import { apiRequest } from "@/lib/api";

type SystemSetting = {
  id: number;
  key: string;
  description: string;
  enabled: boolean;
};

const iconMap: Record<string, JSX.Element> = {
  Notifications: <Bell className="h-6 w-6 text-blue-500" />,
  "Two-Factor Authentication": <Shield className="h-6 w-6 text-blue-500" />,
  "Multi-Language Support": <Globe className="h-6 w-6 text-blue-500" />,
  "Auto Backups": <Database className="h-6 w-6 text-blue-500" />,
  "Email Reports": <Mail className="h-6 w-6 text-blue-500" />,
};

export default function SuperAdminSettings() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<SystemSetting[]>("/superadmin/settings");
      setSettings(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const decoratedSettings = useMemo(
    () => settings.map((setting) => ({ ...setting, icon: iconMap[setting.key] || <Settings className="h-6 w-6 text-blue-500" /> })),
    [settings],
  );

  const handleToggle = async (setting: SystemSetting) => {
    setError("");
    try {
      await apiRequest(`/superadmin/settings/${setting.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !setting.enabled }),
      });
      setSettings((current) => current.map((row) => (row.id === setting.id ? { ...row, enabled: !row.enabled } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update setting");
    }
  };

  return (
    <SuperAdminLayout>
      <div className="flex-1 p-2 sm:p-6 md:p-10">
        <h1 className="text-3xl font-extrabold text-emerald-600 mb-2">System Settings</h1>
        <p className="text-gray-500 mb-8">Configure platform-wide settings</p>
        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {loading && <p className="mb-4 text-sm text-slate-500">Loading settings...</p>}
        <div className="flex flex-col gap-4 w-full">
          {decoratedSettings.map((setting) => (
            <div key={setting.key} className="bg-white rounded-xl shadow flex items-center justify-between p-6 border w-full">
              <div className="flex items-center gap-4">
                {setting.icon}
                <div>
                  <div className="font-bold text-emerald-600">{setting.key}</div>
                  <div className="text-gray-500 text-sm">{setting.description}</div>
                </div>
              </div>
              <button
                className={`w-12 h-7 flex items-center rounded-full border-2 transition ${setting.enabled ? "bg-red-500 border-red-500" : "bg-gray-100 border-gray-300"}`}
                onClick={() => void handleToggle(setting)}
                aria-label="Toggle setting"
              >
                <span
                  className={`w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${setting.enabled ? "translate-x-5" : "translate-x-0"}`}
                  style={{ border: setting.enabled ? "2px solid #ef4444" : "2px solid #d1d5db" }}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
