import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ShoppingCart, Plus, Minus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) {
    return "/api";
  }
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

type MenuItem = {
  id: number;
  name: string;
  price: number;
  available: boolean;
  image_url?: string;
};

type CartItem = MenuItem & { quantity: number };

export default function TableQROrdering() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);

  useEffect(() => {
    const loadMenu = async () => {
      try {
        const data = await fetch(`${API_BASE_URL}/menu/public/${tableId}`).then(r => r.json());
        setMenu(Array.isArray(data) ? data : []);
      } catch (error) {
        toast.error("Unable to load menu");
      } finally {
        setLoading(false);
      }
    };
    loadMenu();
  }, [tableId]);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    toast.success(`${item.name} added to cart`);
  };

  const updateQuantity = (itemId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) => prev.map((c) => (c.id === itemId ? { ...c, quantity } : c)));
  };

  const removeFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((c) => c.id !== itemId));
    toast.success("Item removed from cart");
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    setSubmitting(true);
    try {
      const items = cart.map((item) => `${item.name} x${item.quantity}`);
      const total = calculateTotal();

      const response = await fetch(`${API_BASE_URL}/orders/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          total,
          table_number: Number(tableId),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data?.error || "Unable to place order");
        return;
      }

      toast.success("Order placed successfully!");
      setOrderPlaced(true);
    } catch (error) {
      toast.error("Unable to place order");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-yellow-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading menu...</p>
        </div>
      </div>
    );
  }

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-yellow-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="text-green-600" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Order Placed!</h2>
          <p className="text-lg font-semibold text-emerald-600 mb-4">
            Table {tableId}
          </p>
          <p className="text-gray-600 mb-4">
            Your order has been sent to the kitchen. Please wait for your food to be prepared.
          </p>
          <p className="text-sm text-gray-500">
            Payment will be collected at the counter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-yellow-50 pb-20">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Table {tableId}</h1>
              <p className="text-sm text-gray-600">Scan & Order</p>
            </div>
            <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg font-semibold">
              {cart.length} items
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Menu */}
          <div className="md:col-span-2">
            <h2 className="text-xl font-bold mb-4">Menu</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {menu.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition"
                >
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-40 object-cover"
                    />
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900">{item.name}</h3>
                    <p className="text-lg font-bold text-emerald-600 mt-2">Rs. {item.price}</p>
                    <button
                      onClick={() => addToCart(item)}
                      disabled={!item.available}
                      className="w-full mt-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white disabled:text-gray-900 font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add to Cart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4 sticky top-20">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Cart
              </h2>

              {cart.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Cart is empty</p>
              ) : (
                <>
                  <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                        <div className="flex-1">
                          <p className="font-semibold text-sm">{item.name}</p>
                          <p className="text-emerald-600 font-bold">Rs. {item.price * item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="bg-gray-200 hover:bg-gray-300 p-1 rounded"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-6 text-center font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="bg-gray-200 hover:bg-gray-300 p-1 rounded"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="bg-red-100 hover:bg-red-200 text-red-600 p-1 rounded ml-2"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between mb-4">
                      <span className="font-semibold">Total:</span>
                      <span className="text-2xl font-bold text-emerald-600">Rs. {calculateTotal()}</span>
                    </div>
                    <button
                      onClick={handlePlaceOrder}
                      disabled={submitting}
                      className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white disabled:text-gray-900 font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <Check className="h-5 w-5" />
                      {submitting ? "Placing Order..." : "Place Order"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
