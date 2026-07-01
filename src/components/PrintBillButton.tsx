import { useState } from "react";
import type { MouseEvent } from "react";
import { Printer } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { isAndroidDevice, openBluetoothPrint } from "@/services/printService";

type PrintBillButtonProps = {
  orderId: number | string;
  className?: string;
  onFallbackPrint?: () => void;
};

export function PrintBillButton({ orderId, className, onFallbackPrint }: PrintBillButtonProps) {
  const [loading, setLoading] = useState(false);

  const handlePrint = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (!isAndroidDevice()) {
      toast.info("Bluetooth printing is supported on Android using Bluetooth Print app.");
      onFallbackPrint?.();
      return;
    }

    setLoading(true);
    try {
      await openBluetoothPrint(orderId);
    } catch (err: any) {
      toast.error(err?.message || "Failed to open Bluetooth Print");
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={handlePrint}
      disabled={loading}
    >
      <Printer size={16} className="mr-2" />
      {loading ? "Opening..." : "Print Bill"}
    </Button>
  );
}
