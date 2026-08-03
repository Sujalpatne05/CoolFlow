import { ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Bell } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: ReactNode;
  className?: string;
}

export function StatCard({ title, value, change, changeType = "neutral", icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5 transition-colors duration-150 hover:border-input animate-fade-in",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">{value}</p>
          {change && (
            <p
              className={cn(
                "text-xs mt-2 font-medium",
                changeType === "positive" && "text-success",
                changeType === "negative" && "text-destructive",
                changeType === "neutral" && "text-gray-800",
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const notifications = [
    { text: "New order received", tone: "info", onClick: () => { navigate("/orders"); setOpen(false); } },
    { text: "Low stock warning", tone: "warning", onClick: () => { navigate("/inventory"); setOpen(false); } },
    { text: "High revenue milestone", tone: "success", onClick: () => { navigate("/reports"); setOpen(false); } },
  ];

  const dotColor: Record<string, string> = {
    info: "bg-info",
    warning: "bg-warning",
    success: "bg-success",
  };

  return (
    <div className="relative">
      <button
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-label="Show notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {notifications.length > 0 && (
          <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-card" />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden animate-fade-in">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold">Notifications</p>
            </div>
            <ul className="py-1.5">
              {notifications.map((n, i) => (
                <li key={i}>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-secondary transition-colors"
                    onClick={n.onClick}
                  >
                    <span className={cn("h-2 w-2 rounded-full shrink-0", dotColor[n.tone])} />
                    <span className="text-foreground/90">{n.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export function SupportStatCard() {
  return null;
}
