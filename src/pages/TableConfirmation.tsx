import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CheckCircle, Home, Clock } from "lucide-react";

export default function TableConfirmation() {
  const { tableId, orderId } = useParams<{ tableId: string; orderId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    // Auto redirect after 5 seconds
    const timer = setTimeout(() => {
      navigate("/");
    }, 5000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        {/* Success Icon */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
        </div>

        {/* Message */}
        <h1 className="text-3xl font-bold text-emerald-600 mb-2">Order Confirmed!</h1>
        <p className="text-gray-600 mb-6">Your order has been sent to the kitchen</p>

        {/* Order Details */}
        <div className="bg-gray-50 rounded-lg p-6 mb-8 space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Table Number:</span>
            <span className="font-bold text-lg">Table {tableId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Order ID:</span>
            <span className="font-bold text-lg">ORD-{orderId}</span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t">
            <span className="text-gray-600 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Estimated Time:
            </span>
            <span className="font-bold text-lg">15-20 min</span>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
          <p className="text-sm text-blue-800">
            Your order is being prepared in the kitchen. A staff member will bring your food to your table shortly.
          </p>
        </div>

        {/* Buttons */}
        <button
          onClick={() => navigate("/")}
          className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
        >
          <Home className="h-5 w-5" />
          Back to Home
        </button>

        {/* Auto redirect message */}
        <p className="text-xs text-gray-500 mt-4">Redirecting in 5 seconds...</p>
      </div>
    </div>
  );
}
