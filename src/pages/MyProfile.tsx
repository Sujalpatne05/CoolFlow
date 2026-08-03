import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { buildAuthHeaders } from "@/lib/session";
import { UserCog } from "lucide-react";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

const MyProfile: React.FC = () => {
  const [profile, setProfile] = useState({ name: "", email: "", role: "", restaurantName: "" });
  const [editName, setEditName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const headers = buildAuthHeaders();
    if (!headers) return;
    fetch(`${API_BASE_URL}/profile`, { headers })
      .then(r => r.json())
      .then(d => {
        setProfile({ name: d.name || "", email: d.email || "", role: d.role || "", restaurantName: d.restaurantName || "" });
        setEditName(d.name || "");
      })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) { toast.error("Name cannot be empty"); return; }
    setSavingName(true);
    try {
      const headers = buildAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/profile`, {
        method: "PUT",
        headers: headers!,
        body: JSON.stringify({ name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfile(p => ({ ...p, name: data.name }));
      toast.success("Name updated successfully");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update name");
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) { toast.error("Fill in all password fields"); return; }
    if (newPassword.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords don't match"); return; }
    setSavingPassword(true);
    try {
      const headers = buildAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/profile/change-password`, {
        method: "POST",
        headers: headers!,
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      toast.success("Password changed successfully");
    } catch (err: any) {
      toast.error(err?.message || "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64 text-muted-foreground">Loading profile...</div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto py-8 px-4 space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="text-primary-500" /> My Profile
        </h1>

        {/* Profile Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Account Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{profile.email}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span className="font-medium capitalize">{profile.role}</span></div>
            {profile.restaurantName && <div className="flex justify-between"><span className="text-muted-foreground">Restaurant</span><span className="font-medium">{profile.restaurantName}</span></div>}
          </CardContent>
        </Card>

        {/* Edit Name */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Edit Name</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveName} className="flex gap-2">
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Your name" className="flex-1" />
              <Button type="submit" disabled={savingName} className="bg-primary-500 hover:bg-primary-600">
                {savingName ? "Saving..." : "Save"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Change Password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Current Password</label>
                <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">New Password</label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Confirm New Password</label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
              </div>
              <Button type="submit" disabled={savingPassword} className="w-full bg-primary-500 hover:bg-primary-600">
                {savingPassword ? "Changing..." : "Change Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default MyProfile;
