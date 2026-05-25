import { ReactNode, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: ReactNode;
  className?: string;
}

export function StatCard({ title, value, change, changeType = "neutral", icon, className }: StatCardProps) {
  return (
    <div className={cn(
      "bg-gradient-to-br from-orange-100 via-white to-orange-200 rounded-lg p-5 shadow-lg shadow-orange-100/40 animate-scale-in border transition-all duration-300 ease-in-out",
      "w-full max-w-full sm:max-w-xs mx-auto mb-4",
      className
    )}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
        <div className="w-full">
          <p className="text-sm text-muted-foreground transition-all duration-300 ease-in-out">{title}</p>
          <p className="text-2xl font-bold mt-1 transition-all duration-300 ease-in-out">{value}</p>
          {change && (
            <p
              className={cn(
                "text-xs mt-1 font-medium transition-all duration-300 ease-in-out",
                changeType === "positive" && "text-success",
                changeType === "negative" && "text-destructive",
                changeType === "neutral" && "text-muted-foreground"
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div className="gradient-warm rounded-lg p-2.5 text-primary-foreground transition-all duration-300 ease-in-out mt-4 sm:mt-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

// Support StatCard example
export function SupportStatCard() {
  return (
    <div className="bg-gradient-to-br from-orange-100 via-white to-orange-200 rounded-lg p-5 shadow-lg shadow-orange-100/40 animate-scale-in border transition-all duration-300 ease-in-out w-full max-w-full sm:max-w-xs mx-auto mb-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
        <div className="w-full">
          <p className="text-sm text-muted-foreground transition-all duration-300 ease-in-out">Support</p>
          <p className="text-2xl font-bold mt-1 transition-all duration-300 ease-in-out">24/7 multiple language support</p>
        </div>
        <div className="gradient-warm rounded-lg p-2.5 text-primary-foreground transition-all duration-300 ease-in-out mt-4 sm:mt-0">
          <img src="/placeholder.svg" alt="Support Icon" width={32} height={32} />
        </div>
      </div>
    </div>
  );
}

// Real-Time Notification Dropdown
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const notifications = [
    { icon: "<span class='text-lg'>🔔</span>", text: "New order received!", onClick: () => { navigate("/orders"); setOpen(false); } },
    { icon: "<span class='text-lg'>⚠️</span>", text: "Low stock warning!", onClick: () => { navigate("/inventory"); setOpen(false); } },
    { icon: "<span class='text-lg'>💰</span>", text: "High revenue milestone!", onClick: () => { navigate("/reports"); setOpen(false); } },
  ];

  return (
    <div className="relative">
      <button
        className="relative w-10 h-10 rounded-full flex items-center justify-center bg-card hover:bg-orange-100 transition-all"
        onClick={() => setOpen((o) => !o)}
        aria-label="Show notifications"
      >
        <span className="text-xl">🔔</span>
        {notifications.length > 0 && (
          <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-orange-500" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border p-3 z-50">
          <div className="font-bold mb-2 text-orange-700">Notifications</div>
          <ul className="space-y-2">
            {notifications.map((n, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-orange-50 rounded px-2 py-1 font-semibold text-orange-700 transition-colors"
                onClick={n.onClick}
              >
                <span dangerouslySetInnerHTML={{ __html: n.icon }} />
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
