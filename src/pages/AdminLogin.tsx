import React, { useState, useEffect } from "react";
import { saveAuthSession } from "@/lib/session";
import { Eye, EyeOff } from "lucide-react";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || "http://localhost:5000";
})();

const foodItems = [
  { emoji: "🍔", size: 44, left: 4,  delay: 0,   duration: 7,   wobble: 1 },
  { emoji: "🍕", size: 40, left: 11, delay: 1.5, duration: 8,   wobble: 2 },
  { emoji: "🍟", size: 38, left: 19, delay: 0.8, duration: 6.5, wobble: 1 },
  { emoji: "🧃", size: 34, left: 27, delay: 2.2, duration: 7.5, wobble: 3 },
  { emoji: "🍜", size: 42, left: 35, delay: 0.3, duration: 6,   wobble: 2 },
  { emoji: "🍰", size: 38, left: 44, delay: 3,   duration: 8.5, wobble: 1 },
  { emoji: "🍣", size: 40, left: 53, delay: 1.8, duration: 7,   wobble: 3 },
  { emoji: "🥤", size: 36, left: 61, delay: 0.6, duration: 6.5, wobble: 2 },
  { emoji: "🍩", size: 42, left: 69, delay: 2.5, duration: 7.5, wobble: 1 },
  { emoji: "🌮", size: 38, left: 77, delay: 1.2, duration: 6,   wobble: 3 },
  { emoji: "🍦", size: 34, left: 85, delay: 0.4, duration: 8,   wobble: 2 },
  { emoji: "🍟", size: 40, left: 8,  delay: 4,   duration: 9,   wobble: 2 },
  { emoji: "🥗", size: 38, left: 48, delay: 2.8, duration: 7.5, wobble: 3 },
  { emoji: "🍪", size: 36, left: 73, delay: 1,   duration: 6.5, wobble: 1 },
  { emoji: "🍷", size: 34, left: 16, delay: 3.2, duration: 8,   wobble: 2 },
  { emoji: "🥩", size: 40, left: 58, delay: 0.9, duration: 7,   wobble: 3 },
  { emoji: "🍟", size: 42, left: 88, delay: 2,   duration: 6,   wobble: 1 },
];

const stars = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  top: Math.random() * 100,
  size: Math.random() * 3 + 1,
  delay: Math.random() * 4,
  duration: Math.random() * 3 + 2,
}));

const AdminLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 100); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true); setError("");

      // Try login with email
      let response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username.trim(), password: password.trim() }),
      });
      let data = await response.json();onst mustChangePassword = Boolean(data?.user?.mustChangePassword);
      saveAuthSession(data.token, data.user.role, data.user.name,
        String(data?.user?.restaurantName || ""),
        typeof data?.user?.restaurantId === "number" ? data.user.restaurantId : null,
        mustChangePassword);
      if (mustChangePassword) { window.location.href = "/change-password"; return; }
      window.location.href = data.user.role === "superadmin" ? "/superadmin-dashboard" : "/";
    } catch {
      setError("Unable to connect to server.");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", background: "linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)" }}>

      {stars.map(star => (
        <div key={star.id} style={{
          position: "fixed", left: `${star.left}%`, top: `${star.top}%`,
          width: star.size, height: star.size, borderRadius: "50%",
          background: "white", zIndex: 0, pointerEvents: "none",
          animation: `twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
        }} />
      ))}

      {foodItems.map((item, i) => (
        <div key={i} className="food-item" style={{
          position: "fixed", left: `${item.left}%`, top: "-80px",
          fontSize: item.size, zIndex: 2, pointerEvents: "none", userSelect: "none",
          animation: `fall${item.wobble} ${item.duration}s ease-in ${item.delay}s infinite`,
          filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.4))",
        }}>
          {item.emoji}
        </div>
      ))}

      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse at center, rgba(229,57,53,0.12) 0%, transparent 65%)", zIndex: 1, pointerEvents: "none" }} />

      <div style={{
        position: "relative", zIndex: 10, width: "100%", maxWidth: 430, margin: "0 20px",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0) scale(1)" : "translateY(60px) scale(0.88)",
        transition: shake ? "none" : "all 0.9s cubic-bezier(0.34,1.56,0.64,1)",
        animation: shake ? "shake 0.5s ease" : "none",
      }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 28, zIndex: 20, pointerEvents: "none", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: "-100%", width: "60%", height: "100%", background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)", animation: "shimmer 4s ease-in-out infinite" }} />
        </div>

        <div style={{ borderRadius: 28, overflow: "hidden", background: "rgba(255,255,255,0.97)", boxShadow: "0 40px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.15)" }}>
          <div style={{ height: 5, background: "linear-gradient(90deg,#e53935,#ff6f00,#fdd835,#43a047,#1e88e5,#8e24aa,#e53935)", backgroundSize: "200% 100%", animation: "rainbowSlide 4s linear infinite" }} />

          <div style={{ padding: "40px 44px 44px" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ width: 82, height: 82, borderRadius: 24, margin: "0 auto 16px", background: "linear-gradient(135deg,#e53935,#ff6f00)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 40px rgba(229,57,53,0.45)", animation: "logoPulse 2.5s ease-in-out infinite" }}>
                  <img
                    src="/ordernest-logo.png"
                    alt="OrderNest"
                    style={{ width: 90, height: 90, margin: "0 auto 20px", borderRadius: 15, display: "block" }}
                  />
              </div>
              <h1 style={{ fontSize: 30, fontWeight: 900, color: "#1a1a2e", margin: "0 0 4px", letterSpacing: "-0.5px" }}>OrderNest</h1>
              <p style={{ color: "#aaa", fontSize: 13, margin: 0 }}>Your kitchen, your control</p>
            </div>

            {error && (
              <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 12, background: "#fff5f5", border: "1.5px solid #fed7d7", color: "#c53030", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>Email or Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required placeholder="you@restaurant.com"
                  style={{ width: "100%", paddingLeft: 16, paddingRight: 16, paddingTop: 14, paddingBottom: 14, borderRadius: 12, border: "2px solid #f0f0f0", background: "#fafafa", fontSize: 14, color: "#1a1a2e", outline: "none", boxSizing: "border-box", transition: "all 0.25s" }}
                  onFocus={e => { e.target.style.borderColor = "#e53935"; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 4px rgba(229,57,53,0.1)"; }}
                  onBlur={e => { e.target.style.borderColor = "#f0f0f0"; e.target.style.background = "#fafafa"; e.target.style.boxShadow = "none"; }} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>Password</label>
                <div style={{ position: "relative" }}>
                  <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                    style={{ width: "100%", paddingLeft: 16, paddingRight: 48, paddingTop: 14, paddingBottom: 14, borderRadius: 12, border: "2px solid #f0f0f0", background: "#fafafa", fontSize: 14, color: "#1a1a2e", outline: "none", boxSizing: "border-box", transition: "all 0.25s" }}
                    onFocus={e => { e.target.style.borderColor = "#e53935"; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 4px rgba(229,57,53,0.1)"; }}
                    onBlur={e => { e.target.style.borderColor = "#f0f0f0"; e.target.style.background = "#fafafa"; e.target.style.boxShadow = "none"; }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#e53935", padding: 0, display: "flex" }}>
                    {showPassword ? <EyeOff style={{ width: 17, height: 17 }} /> : <Eye style={{ width: 17, height: 17 }} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                style={{ marginTop: 8, padding: "15px", borderRadius: 14, background: loading ? "#ffb3b3" : "linear-gradient(135deg,#e53935,#ff6f00)", border: "none", color: "white", fontWeight: 800, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 10px 30px rgba(229,57,53,0.45)", transition: "all 0.3s" }}
                onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 16px 40px rgba(229,57,53,0.55)"; }}}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 10px 30px rgba(229,57,53,0.45)"; }}>
                {loading
                  ? <><div style={{ width: 20, height: 20, border: "2.5px solid white", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><span>Signing in...</span></>
                  : <span>Sign In →</span>}
              </button>
            </form>

            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 24 }}>
              {["🔒 Secure", "⚡ Fast", "📱 Mobile Ready"].map(tag => (
                <span key={tag} style={{ fontSize: 11, color: "#bbb", fontWeight: 500 }}>{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes twinkle { 0%,100%{opacity:0.1;transform:scale(1)} 50%{opacity:1;transform:scale(1.5)} }
        @keyframes fall1 { 0%{transform:translateY(-80px) rotate(0deg) scale(1);opacity:0} 5%{opacity:1} 30%{transform:translateY(30vh) rotate(120deg) scale(1.1) translateX(15px)} 60%{transform:translateY(60vh) rotate(240deg) scale(0.9) translateX(-10px)} 90%{opacity:0.7} 100%{transform:translateY(110vh) rotate(360deg) scale(1);opacity:0} }
        @keyframes fall2 { 0%{transform:translateY(-80px) rotate(0deg) scale(1);opacity:0} 5%{opacity:1} 25%{transform:translateY(25vh) rotate(90deg) scale(1.15) translateX(-20px)} 55%{transform:translateY(55vh) rotate(200deg) scale(0.85) translateX(18px)} 90%{opacity:0.7} 100%{transform:translateY(110vh) rotate(360deg) scale(1);opacity:0} }
      <style>{`
        @keyframes twinkle { 0%,100%{opacity:0.1;transform:scale(1)} 50%{opacity:1;transform:scale(1.5)} }
        @keyframes fall1 { 0%{transform:translateY(-80px) rotate(0deg) scale(1);opacity:0} 5%{opacity:1} 30%{transform:translateY(30vh) rotate(120deg) scale(1.1) translateX(15px)} 60%{transform:translateY(60vh) rotate(240deg) scale(0.9) translateX(-10px)} 90%{opacity:0.7} 100%{transform:translateY(110vh) rotate(360deg) scale(1);opacity:0} }
        @keyframes fall2 { 0%{transform:translateY(-80px) rotate(0deg) scale(1);opacity:0} 5%{opacity:1} 25%{transform:translateY(25vh) rotate(90deg) scale(1.15) translateX(-20px)} 55%{transform:translateY(55vh) rotate(200deg) scale(0.85) translateX(18px)} 90%{opacity:0.7} 100%{transform:translateY(110vh) rotate(360deg) scale(1);opacity:0} }
        @keyframes fall3 { 0%{transform:translateY(-80px) rotate(0deg) scale(1);opacity:0} 5%{opacity:1} 20%{transform:translateY(20vh) rotate(60deg) scale(1.2) translateX(25px)} 45%{transform:translateY(45vh) rotate(160deg) scale(0.8) translateX(-22px)} 70%{transform:translateY(70vh) rotate(270deg) scale(1.1) translateX(12px)} 90%{opacity:0.7} 100%{transform:translateY(110vh) rotate(360deg) scale(1);opacity:0} }
        @keyframes shimmer { 0%{left:-100%} 50%{left:150%} 100%{left:150%} }
        @keyframes rainbowSlide { 0%{background-position:0% 0%} 100%{background-position:200% 0%} }
        @keyframes logoPulse { 0%,100%{box-shadow:0 16px 40px rgba(229,57,53,0.45);transform:scale(1)} 50%{box-shadow:0 20px 60px rgba(229,57,53,0.7);transform:scale(1.04)} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-10px)} 30%{transform:translateX(10px)} 45%{transform:translateX(-8px)} 60%{transform:translateX(8px)} 75%{transform:translateX(-4px)} 90%{transform:translateX(4px)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        input::placeholder { color:#ccc; }
        input[type="password"]::-webkit-credentials-auto-fill-button { display: none !important; }
        input[type="password"]::-webkit-outer-spin-button,
        input[type="password"]::-webkit-inner-spin-button { display: none !important; }
        @media (max-width:480px) { .food-item{font-size:24px !important;} }
      `}</style>
export default AdminLogin;
