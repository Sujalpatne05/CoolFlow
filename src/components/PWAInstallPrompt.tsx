import React, { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if ((window.navigator as any).standalone) return;

    // Don't show if user dismissed it
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show after 10 seconds
      setTimeout(() => setShow(true), 10000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShow(false);
    setDeferredPrompt(null);
  };

  const handleLater = () => {
    localStorage.setItem("pwa-install-dismissed", "true");
    setShow(false);
  };

  if (!show || !deferredPrompt) return null;

  return (
    <div style={{
      position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: "white", borderRadius: 16, padding: "16px 20px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)", display: "flex", alignItems: "center",
      gap: 14, maxWidth: 360, width: "calc(100% - 32px)",
      border: "1px solid #f0f0f0", animation: "slideUp 0.3s ease"
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg,#e53935,#ff6f00)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ color: "white", fontWeight: 900, fontSize: 20 }}>R</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e" }}>Install Logdine</div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Add to home screen for quick access</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button onClick={handleLater} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e0e0e0", background: "white", fontSize: 12, cursor: "pointer", color: "#666" }}>
          Later
        </button>
        <button onClick={handleInstall} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#e53935,#ff6f00)", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Install
        </button>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateX(-50%) translateY(80px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}`}</style>
    </div>
  );
};

export default PWAInstallPrompt;
