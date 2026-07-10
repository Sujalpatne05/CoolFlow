import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CreditCard, Banknote, QrCode, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

type PaymentMethod = "card" | "cash" | "upi";

export default function TablePayment() {
  const { tableId, orderId } = useParams<{ tableId: string; orderId: string }>();
  const navigate = useNavigate();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [processing, setProcessing] = useState(false);
  const [orderTotal, setOrderTotal] = useState(0);

  useEffect(() => {
    // In a real app, fetch order details
    // For now, using a placeholder
    setOrderTotal(Math.random() * 1000 + 100);
  }, [orderId]);

  const handlePayment = async () => {
    setProcessing(true);
    try {
      // Simulate payment processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast.success("Payment successful!");
      
      // Redirect to order confirmation
      setTimeout(() => {
        navigate(`/table-confirmation/${tableId}/${orderId}`);
      }, 1000);
    } catch (error) {
      toast.error("Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Payment</h1>
          <p className="text-gray-600 mt-2">Table {tableId} • Order #{orderId}</p>
        </div>

        {/* Amount */}
        <div className="bg-gradient-to-r from-emerald-100 to-yellow-100 rounded-lg p-6 mb-8 text-center">
          <p className="text-gray-600 mb-2">Total Amount</p>
          <p className="text-4xl font-bold text-emerald-600">Rs. {Math.round(orderTotal)}</p>
        </div>

        {/* Payment Methods */}
        <div className="space-y-3 mb-8">
          <label className="flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-500 transition" style={{ borderColor: paymentMethod === "card" ? "#3b82f6" : "#e5e7eb" }}>
            <input
              type="radio"
              name="payment"
              value="card"
              checked={paymentMethod === "card"}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-4 h-4"
            />
            <CreditCard className="h-5 w-5 ml-3 text-blue-600" />
            <span className="ml-3 font-semibold">Credit/Debit Card</span>
          </label>

          <label className="flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-green-500 transition" style={{ borderColor: paymentMethod === "upi" ? "#10b981" : "#e5e7eb" }}>
            <input
              type="radio"
              name="payment"
              value="upi"
              checked={paymentMethod === "upi"}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-4 h-4"
            />
            <QrCode className="h-5 w-5 ml-3 text-green-600" />
            <span className="ml-3 font-semibold">UPI / QR Code</span>
          </label>

          <label className="flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-purple-500 transition" style={{ borderColor: paymentMethod === "cash" ? "#a855f7" : "#e5e7eb" }}>
            <input
              type="radio"
              name="payment"
              value="cash"
              checked={paymentMethod === "cash"}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-4 h-4"
            />
            <Banknote className="h-5 w-5 ml-3 text-purple-600" />
            <span className="ml-3 font-semibold">Cash</span>
          </label>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            {paymentMethod === "card" && "Enter your card details to complete payment."}
            {paymentMethod === "upi" && "Scan the QR code with your UPI app to pay."}
            {paymentMethod === "cash" && "Please pay the amount to the staff member."}
          </p>
        </div>

        {/* Payment Button */}
        <button
          onClick={handlePayment}
          disabled={processing}
          className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-4 rounded-lg transition flex items-center justify-center gap-2 text-lg"
        >
          <Check className="h-5 w-5" />
          {processing ? "Processing..." : "Confirm Payment"}
        </button>

        {/* Cancel */}
        <button
          onClick={() => navigate(-1)}
          disabled={processing}
          className="w-full mt-3 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-800 font-semibold py-3 rounded-lg transition"
        >
          Back
        </button>
      </div>
    </div>
  );
}
