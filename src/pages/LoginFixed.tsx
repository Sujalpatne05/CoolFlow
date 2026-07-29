import React, { useState } from "react";
import { saveAuthSession } from "@/lib/session";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

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
  { emoji: "🍔", size: 40, left: 8, delay: 2, duration: 6.8 },
  { emoji: "🍕", size: 38, left: 15, delay: 2.5, duration: 7.2 },
  { emoji: "🍟", size: 36, left: 25, delay: 2.1, duration: 6.3 },
  { emoji: "🍜", size: 42, left: 32, delay: 2.8, duration: 7.8 },
  { emoji: "🍰", size: 38, left: 40, delay: 2.3, duration: 6.5 },
  { emoji: "🍣", size: 40, left: 48, delay: 2.7, duration: 7.1 },
  { emoji: "🥤", size: 34, left: 55, delay: 2.4, duration: 6.7 },
  { emoji: "🍩", size: 40, left: 62, delay: 2.9, duration: 7.4 },
  { emoji: "🌮", size: 36, left: 70, delay: 2.2, duration: 6.6 },
  { emoji: "🍦", size: 34, left: 78, delay: 2.6, duration: 7.3 },
  { emoji: "🥗", size: 38, left: 85, delay: 2.1, duration: 6.4 },
  { emoji: "🍪", size: 36, left: 92, delay: 2.5, duration: 7.6 },
];

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
      // Clear old session first to prevent stale data from previous login
      localStorage.clear();
      sessionStorage.clear();
      saveAuthSession(
        data.token,
        data.user.role,
        data.user.name,
        String(data?.user?.restaurantName || ""),
        typeof data?.user?.restaurantId === "number" ? data.user.restaurantId : null,
        mustChangePassword,
        typeof data?.user?.id === "number" ? data.user.id : null
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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#0f172a,#111827,#1f2937)", position: "relative", overflow: "hidden" }}>
      {/* Animated food items */}
      {foodItems.map((item, i) => (
        <div
          key={i}
          style={{
            position: "fixed",
            left: `${item.left}%`,
            top: "-60px",
            fontSize: item.size,
            zIndex: 1,
            pointerEvents: "none",
            userSelect: "none",
            animation: `fall ${item.duration}s ease-in ${item.delay}s infinite`,
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.2))",
          }}
        >
          {item.emoji}
        </div>
      ))}

      {/* Twinkling stars background */}
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={`star-${i}`}
          style={{
            position: "fixed",
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            width: Math.random() * 2 + 1,
            height: Math.random() * 2 + 1,
            borderRadius: "50%",
            background: "white",
            zIndex: 0,
            pointerEvents: "none",
            animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out ${Math.random() * 4}s infinite`,
          }}
        />
      ))}

      <div style={{ width: "100%", maxWidth: 500, padding: "0 20px", position: "relative", zIndex: 10 }}>
        <div style={{ borderRadius: 20, background: "rgba(255,255,255,0.98)", padding: "50px", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }} className="login-card">
          <div style={{ textAlign: "center", marginBottom: 35 }}>
            <div style={{ marginBottom: 20 }}>
              <img 
                src="/ordernest-logo.png" 
                alt="OrderNest" 
                style={{ width: 100, height: 100, margin: "0 auto", borderRadius: 15 }}
              />
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: "#1f2937", margin: "0 0 8px" }}>OrderNest</h1>
            <p style={{ color: "#10b981", fontSize: 18, margin: 0, fontWeight: 700, letterSpacing: "0.01em" }}>Restaurant Management System</p>
          </div>

          {error && (
            <div style={{ marginBottom: 20, padding: "12px", borderRadius: 10, background: "#fff5f5", border: "1px solid #fed7d7", color: "#c53030", fontSize: 14 }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Email or Username</label>
              <div style={{ position: "relative" }}>
                <Mail style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, color: "#10b981" }} />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  placeholder="Enter your email"
                  style={{ width: "100%", paddingLeft: 48, paddingRight: 12, paddingTop: 14, paddingBottom: 14, borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 15, outline: "none", boxSizing: "border-box", background: "#f8fafc", color: "#111827" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Password</label>
              <div style={{ position: "relative" }}>
                <Lock style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, color: "#10b981" }} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  style={{ width: "100%", paddingLeft: 48, paddingRight: 48, paddingTop: 14, paddingBottom: 14, borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 15, outline: "none", boxSizing: "border-box", background: "#f8fafc", color: "#111827" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {showPassword ? <EyeOff style={{ width: 20, height: 20, color: "#10b981" }} /> : <Eye style={{ width: 20, height: 20, color: "#10b981" }} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ width: "100%", padding: "16px", borderRadius: 10, background: loading ? "#a7f3d0" : "linear-gradient(135deg,#10b981,#2c3e50)", border: "none", color: "white", fontWeight: 700, fontSize: 16, cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 12px 28px rgba(16,185,129,0.28)" }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "#6b7280" }}>
            Complete POS & Restaurant Management Solution
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fall {
          0% {
            transform: translateY(-60px) rotate(0deg) scale(1);
            opacity: 0;
          }
          5% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(360deg) scale(0.8);
            opacity: 0;
          }
        }

        @keyframes twinkle {
          0%, 100% {
            opacity: 0.2;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.5);
          }
        }

        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 16px 40px rgba(0, 137, 123, 0.45);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 20px 60px rgba(0, 137, 123, 0.7);
            transform: scale(1.05);
          }
        }

        @keyframes slideIn {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .login-card {
          animation: slideIn 0.6s ease-out;
        }

        input::placeholder {
          color: #ccc;
        }
      `}</style>
    </div>
  );
};

export default LoginFixed;
