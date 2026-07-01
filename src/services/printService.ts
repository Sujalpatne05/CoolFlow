import { apiRequest } from "@/lib/api";

type BluetoothPrintUrlResponse = {
  success: boolean;
  printUrl: string;
};

export const isAndroidDevice = () => (
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "")
);

export const getBluetoothPrintUrl = async (orderId: number | string) => {
  const data = await apiRequest<BluetoothPrintUrlResponse>(
    `/api/print/orders/${orderId}/bluetooth-url`,
    { method: "POST" },
    true,
  );

  if (!data.success || !data.printUrl) {
    throw new Error("Unable to create Bluetooth print URL");
  }

  return data.printUrl;
};

export const openBluetoothPrint = async (orderId: number | string) => {
  const printUrl = await getBluetoothPrintUrl(orderId);
  window.location.href = printUrl;
};
