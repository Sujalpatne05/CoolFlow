import React, { useState } from "react";
import { saveAuthSession } from "@/lib/session";
import { Eye, EyeOff, ArrowRight, ShieldCheck, Zap, UtensilsCrossed } from "lucide-react";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  if (configured) return configured;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:5001";
    return "/api";
  }
  return "http://localhost:5001";
})();

const LoginFixed = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");

      const payload = { email: username.trim(), password: password.trim() };
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Invalid credentials");
        return;
      }

      const mustChangePassword = Boolean(data?.user?.mustChangePassword);
      localStorage.clear();
      sessionStorage.clear();
      saveAuthSession(
        data.token,
        data.user.role,
        data.user.name,
        String(data?.user?.restaurantName || ""),
        typeof data?.user?.restaurantId === "number" ? data.user.restaurantId : null,
        mustChangePassword,
        typeof data?.user?.id === "number" ? data.user.id : null,
      );

      if (mustChangePassword) {
        window.location.href = "/change-password";
        return;
      }
      window.location.href = data.user.role === "superadmin" ? "/superadmin-dashboard" : "/";
    } catch (err) {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left: brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-card border-r border-border">
        <div className="absolute inset-0 bg-primary/[0.04]" />
        <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <UtensilsCrossed className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-foreground">OrderNest</p>
              <p className="text-xs text-muted-foreground">Restaurant Platform</p>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-4xl xl:text-5xl font-extrabold leading-[1.1] tracking-tight text-foreground">
              Run your restaurant with clarity.
            </h1>
            <p className="mt-5 text-base text-muted-foreground leading-relaxed">
              POS, kitchen display, inventory, reservations, and analytics — unified in one fast, modern workspace built for hospitality teams.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-3">
              {[
                { icon: Zap, label: "Real-time POS" },
                { icon: ShieldCheck, label: "Role-based access" },
                { icon: UtensilsCrossed, label: "Multi-tenant" },
              ].map((f) => (
                <div key={f.label} className="rounded-lg border border-border bg-card px-3 py-3">
                  <f.icon className="h-5 w-5 mb-2 text-primary" />
                  <p className="text-xs font-medium leading-snug text-foreground/80">{f.label}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} OrderNest. All rights reserved.</p>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <UtensilsCrossed className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">OrderNest</p>
              <p className="text-[11px] text-muted-foreground">Restaurant Platform</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-1.5">Sign in to your workspace to continue.</p>
          </div>

          {error && (
            <div className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Email or Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="you@restaurant.com"
                className="w-full h-11 rounded-md border border-input bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full h-11 rounded-md border border-input bg-card px-3.5 pr-11 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-md bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Secure access · Protected by role-based permissions
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginFixed;
