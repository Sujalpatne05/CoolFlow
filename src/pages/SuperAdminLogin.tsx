
import React, { useState } from "react";
import { saveAuthSession } from "@/lib/session";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  if (configured) return configured;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:5001";
    return "/api";
  }
  return "http://localhost:5001";
})();

const foodItems = [
  { emoji: "🍔", size: 40, left: 5, delay: 0, duration: 6 },
  { emoji: "🍕", size: 38, left: 12, delay: 0.5, duration: 7 },
  { emoji: "🍟", size: 36, left: 20, delay: 1, duration: 6.5 },
  { emoji: "🍜", size: 42, left: 28, delay: 1.5, duration: 7.5 },
  { emoji: "🍰", size: 38, left: 35, delay: 0.2, duration: 6 },
  { emoji: "🍣", size: 40, left: 42, delay: 0.8, duration: 7 },
  { emoji: "🥤", size: 34, left: 50, delay: 1.2, duration: 6.5 },
  { emoji: "🍩", size: 40, left: 58, delay: 0.3, duration: 7 },
  { emoji: "🌮", size: 36, left: 65, delay: 1.8, duration: 6.5 },
  { emoji: "🍦", size: 34, left: 72, delay: 0.6, duration: 7 },
  { emoji: "🥗", size: 38, left: 80, delay: 1.3, duration: 6 },
  { emoji: "🍪", size: 36, left: 88, delay: 0.9, duration: 7.5 },
];

export default function SuperAdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username.trim(), password: password.trim(), role: "superadmin" }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Invalid credentials");
        return;
      }
      saveAuthSession(data.token, data.user.role, data.user.name, String(data?.user?.restaurantName || ""), typeof data?.user?.restaurantId === "number" ? data.user.restaurantId : null, false);
      window.location.href = "/superadmin-dashboard";
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)", position: "relative", overflow: "hidden" }}>
      {foodItems.map((item, i) => (
        <div key={i} style={{ position: "fixed", left: `${item.left}%`, top: "-60px", fontSize: item.size, zIndex: 1, pointerEvents: "none", userSelect: "none", animation: `fall ${item.duration}s ease-in ${item.delay}s infinite`, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.2))" }}>
          {item.emoji}
        </div>
      ))}
      {Array.from({ length: 40 }).map((_, i) => (
        <div key={`star-${i}`} style={{ position: "fixed", left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, width: Math.random() * 2 + 1, height: Math.random() * 2 + 1, borderRadius: "50%", background: "white", zIndex: 0, pointerEvents: "none", animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out ${Math.random() * 4}s infinite` }} />
      ))}

      <div style={{ width: "100%", maxWidth: 500, padding: "0 20px", position: "relative", zIndex: 10 }}>
        <div style={{ borderRadius: 20, background: "white", padding: "50px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} className="login-card">
          <div style={{ textAlign: "center", marginBottom: 35 }}>
            <div style={{ width: 90, height: 90, borderRadius: 15, margin: "0 auto 20px", background: "linear-gradient(135deg,#1a1a2e,#0f3460)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img
                    src="/logdine-restro-logo.png"
                    alt="LogDine Restro"
                    style={{ width: 90, height: 90, margin: "0 auto 20px", borderRadius: 15, display: "block" }}
                  />
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: "#1a1a2e", margin: "0 0 8px" }}>Logdine</h1>
            <p style={{ color: "#999", fontSize: 14, margin: 0 }}>Super Admin Portal</p>
          </div>

          {error && (
            <div style={{ marginBottom: 20, padding: "12px", borderRadius: 10, background: "#fff5f5", border: "1px solid #fed7d7", color: "#c53030", fontSize: 14 }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#666", marginBottom: 10 }}>Email</label>
              <div style={{ position: "relative" }}>
                <Mail style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, color: "#0f3460" }} />
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required placeholder="superadmin@logdine.com" style={{ width: "100%", paddingLeft: 48, paddingRight: 12, paddingTop: 14, paddingBottom: 14, borderRadius: 10, border: "2px solid #f0f0f0", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#666", marginBottom: 10 }}>Password</label>
              <div style={{ position: "relative" }}>
                <Lock style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, color: "#0f3460" }} />
                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Enter password" style={{ width: "100%", paddingLeft: 48, paddingRight: 48, paddingTop: 14, paddingBottom: 14, borderRadius: 10, border: "2px solid #f0f0f0", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  {showPassword ? <EyeOff style={{ width: 20, height: 20, color: "#0f3460" }} /> : <Eye style={{ width: 20, height: 20, color: "#0f3460" }} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "16px", borderRadius: 10, background: loading ? "#aaa" : "linear-gradient(135deg,#1a1a2e,#0f3460)", border: "none", color: "white", fontWeight: 700, fontSize: 16, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "#999" }}>For authorized Super Admin users only.</div>
        </div>
      </div>

      <style>{`
        @keyframes fall { 0% { transform: translateY(-60px) rotate(0deg) scale(1); opacity: 0; } 5% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(100vh) rotate(360deg) scale(0.8); opacity: 0; } }
        @keyframes twinkle { 0%, 100% { opacity: 0.2; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }
        .login-card { animation: slideIn 0.6s ease-out; }
        @keyframes slideIn { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        input::placeholder { color: #ccc; }
      `}</style>
    </div>
  );
}
