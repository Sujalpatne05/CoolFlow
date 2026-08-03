import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Package, Truck, CheckCircle, MapPin, Phone } from "lucide-react";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

export default function TrackDelivery() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadOrder = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/delivery/public/track/${orderNumber}`);
        if (!res.ok) throw new Error('Order not found');
        const data = await res.json();
        setOrder(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    loadOrder();
    const interval = setInterval(loadOrder, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [orderNumber]);

  const getStatusSteps = () => {
    const steps = [
      { key: 'pending', label: 'Order Received', icon: Package },
      { key: 'preparing', label: 'Preparing', icon: Clock },
      { key: 'out_for_delivery', label: 'Out for Delivery', icon: Truck },
      { key: 'delivered', label: 'Delivered', icon: CheckCircle },
    ];

    const statusIndex = {
      pending: 0,
      preparing: 1,
      out_for_delivery: 2,
      delivered: 3,
    }[order?.delivery_status || 'pending'] || 0;

    return steps.map((step, idx) => ({
      ...step,
      completed: idx <= statusIndex,
      active: idx === statusIndex,
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-secondary/5 flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-secondary/5 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Package className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Order Not Found</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const steps = getStatusSteps();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-secondary/5 p-4 py-12">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold mb-1">Track Your Order</h1>
                <p className="text-muted-foreground">Order #{order.order_number}</p>
              </div>
              <Badge variant={order.delivery_status === 'delivered' ? 'default' : 'outline'} className="text-sm">
                {order.delivery_status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Customer</p>
                <p className="font-semibold">{order.customer_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Estimated Time</p>
                <p className="font-semibold">{order.estimated_delivery_time || '45 mins'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Timeline */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-6">Delivery Status</h2>
            <div className="space-y-6">
              {steps.map((step, idx) => (
                <div key={step.key} className="flex items-start gap-4">
                  <div className={`flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center border-2 ${
                    step.completed 
                      ? 'bg-primary border-primary text-white' 
                      : 'border-border bg-muted text-muted-foreground'
                  } ${step.active ? 'animate-pulse-glow' : ''}`}>
                    <step.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 pb-6">
                    <p className={`font-semibold ${step.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {step.label}
                    </p>
                    {step.active && (
                      <p className="text-sm text-primary font-medium mt-1">In Progress...</p>
                    )}
                    {step.completed && !step.active && (
                      <p className="text-sm text-muted-foreground mt-1">Completed</p>
                    )}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`absolute left-6 top-16 w-0.5 h-12 ${
                      step.completed ? 'bg-primary' : 'bg-border'
                    }`} style={{ marginTop: idx * 88 + 'px' }} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Delivery Details */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Delivery Address</p>
                <p className="text-sm text-muted-foreground">{order.delivery_address}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Contact</p>
                <p className="text-sm text-muted-foreground">{order.customer_phone}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Items */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-bold mb-4">Your Order</h3>
            <div className="space-y-3 mb-4">
              {JSON.parse(order.items || '[]').map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span>{item.name} x{item.quantity}</span>
                  <span className="font-semibold">₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Fee</span>
                <span>₹{order.delivery_fee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>₹{order.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total</span>
                <span className="text-primary">₹{order.total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
