import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Link as LinkIcon, Copy, Truck, Package, Clock, CheckCircle, 
  MapPin, Phone, Mail, ExternalLink, RefreshCw 
} from "lucide-react";
import { buildAuthHeaders, clearAuthSession, isAuthError } from "@/lib/session";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

export default function OnlineOrders() {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadData = async () => {
    try {
      const headers = buildAuthHeaders();
      if (!headers) {
        clearAuthSession();
        navigate("/admin-login");
        return;
      }

      const [tokensRes, ordersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/delivery/tokens`, { headers }),
        fetch(`${API_BASE_URL}/delivery/orders`, { headers })
      ]);

      if (isAuthError(tokensRes.status)) {
        clearAuthSession();
        navigate("/admin-login");
        return;
      }

      const tokensData = await tokensRes.json();
      const ordersData = await ordersRes.json();

      setTokens(Array.isArray(tokensData) ? tokensData : []);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (e) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const generateLink = async () => {
    setGenerating(true);
    try {
      const headers = buildAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/delivery/public/generate`, {
        method: 'POST',
        headers
      });

      if (!res.ok) throw new Error('Failed to generate link');
      
      const data = await res.json();
      toast.success("Delivery link generated!");
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/order/${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard!");
  };

  const updateOrderStatus = async (orderId: number, status: string) => {
    try {
      const headers = buildAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/delivery/orders/${orderId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ delivery_status: status })
      });

      if (!res.ok) throw new Error('Failed to update status');
      
      toast.success("Status updated!");
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'border-warning/30 bg-warning/10 text-warning';
      case 'preparing': return 'border-info/30 bg-info/10 text-info';
      case 'out_for_delivery': return 'border-primary/30 bg-primary/10 text-primary';
      case 'delivered': return 'border-success/30 bg-success/10 text-success';
      default: return 'border-border bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'preparing': return <Package className="h-4 w-4" />;
      case 'out_for_delivery': return <Truck className="h-4 w-4" />;
      case 'delivered': return <CheckCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.delivery_status === 'pending').length,
    preparing: orders.filter(o => o.delivery_status === 'preparing').length,
    outForDelivery: orders.filter(o => o.delivery_status === 'out_for_delivery').length,
    delivered: orders.filter(o => o.delivery_status === 'delivered').length,
    revenue: orders.reduce((sum, o) => sum + Number(o.total || 0), 0)
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold">Online Delivery Orders</h1>
            <p className="text-muted-foreground mt-1">Manage customer orders from your delivery link</p>
          </div>
          <Button 
            onClick={loadData} 
            variant="outline"
            className="w-fit"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <Card className="hover-lift">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">Total Orders</p>
              <p className="text-2xl font-bold mt-1">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="hover-lift">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">Pending</p>
              <p className="text-2xl font-bold mt-1 text-warning">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card className="hover-lift">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">Preparing</p>
              <p className="text-2xl font-bold mt-1 text-info">{stats.preparing}</p>
            </CardContent>
          </Card>
          <Card className="hover-lift">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">Out</p>
              <p className="text-2xl font-bold mt-1 text-primary">{stats.outForDelivery}</p>
            </CardContent>
          </Card>
          <Card className="hover-lift">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">Delivered</p>
              <p className="text-2xl font-bold mt-1 text-success">{stats.delivered}</p>
            </CardContent>
          </Card>
          <Card className="hover-lift">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">Revenue</p>
              <p className="text-2xl font-bold mt-1 text-primary">₹{stats.revenue.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="orders" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
            <TabsTrigger value="links">Ordering Link</TabsTrigger>
          </TabsList>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            {orders.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Package className="h-16 w-16 text-muted-foreground/40 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Share your online ordering link with customers to start receiving orders
                  </p>
                  <Button onClick={() => window.open(`${window.location.origin}/onlineorder`, '_blank')}>
                    View Ordering Link
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {orders.map(order => (
                  <Card key={order.id} className="hover-lift">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                        <div className="flex-1 space-y-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-lg font-bold">Order #{order.order_number}</h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                {new Date(order.created_at).toLocaleString('en-IN')}
                              </p>
                            </div>
                            <Badge className={`${getStatusColor(order.delivery_status)} flex items-center gap-1`}>
                              {getStatusIcon(order.delivery_status)}
                              {order.delivery_status.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div className="flex items-start gap-2">
                              <Phone className="h-4 w-4 text-primary mt-0.5" />
                              <div>
                                <p className="font-semibold">{order.customer_name}</p>
                                <p className="text-muted-foreground">{order.customer_phone}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 text-primary mt-0.5" />
                              <div>
                                <p className="font-semibold">Delivery Address</p>
                                <p className="text-muted-foreground">{order.delivery_address}</p>
                                {order.landmark && (
                                  <p className="text-xs text-muted-foreground">Near: {order.landmark}</p>
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="font-semibold mb-2">Order Items</p>
                              {(typeof order.items === 'string' ? JSON.parse(order.items || '[]') : order.items || []).map((item: any, idx: number) => (
                                <p key={idx} className="text-xs text-muted-foreground">
                                  {item.name} x{item.quantity}
                                </p>
                              ))}
                            </div>
                          </div>

                          {order.special_instructions && (
                            <div className="bg-muted/50 rounded-lg p-3 text-sm">
                              <p className="font-semibold mb-1">Special Instructions:</p>
                              <p className="text-muted-foreground">{order.special_instructions}</p>
                            </div>
                          )}
                        </div>

                        <div className="lg:w-64 space-y-3">
                          <div className="bg-primary/5 rounded-xl p-4">
                            <p className="text-sm text-muted-foreground mb-1">Total Amount</p>
                            <p className="text-2xl font-bold text-primary">₹{Number(order.total).toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              Payment: {order.payment_method === 'cod' ? 'Cash on Delivery' : 'Online'}
                            </p>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Update Status</p>
                            <div className="grid grid-cols-2 gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => updateOrderStatus(order.id, 'preparing')}
                                disabled={order.delivery_status !== 'pending'}
                              >
                                Preparing
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => updateOrderStatus(order.id, 'out_for_delivery')}
                                disabled={order.delivery_status === 'pending' || order.delivery_status === 'delivered'}
                              >
                                Out
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => updateOrderStatus(order.id, 'delivered')}
                                disabled={order.delivery_status === 'delivered'}
                                className="col-span-2"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Mark Delivered
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Links Tab */}
          <TabsContent value="links" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Public Delivery Link</CardTitle>
                    <CardDescription>Share this simple link with customers to order online</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-6 border-2 border-primary/30 bg-primary/5 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold text-primary mb-1">{window.location.origin}/onlineorder</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Share this link on WhatsApp, Instagram, Facebook, or anywhere else
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/onlineorder`);
                          toast.success("Link copied!");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => window.open(`${window.location.origin}/onlineorder`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6">
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-primary" />
                  How to use your online ordering link
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-primary">1.</span>
                    Copy your online ordering link from above
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-primary">2.</span>
                    Share it with customers via WhatsApp, SMS, social media, or your website
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-primary">3.</span>
                    Customers can browse your menu, add items, and place orders directly
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-primary">4.</span>
                    All orders appear in the "Orders" tab with customer details and delivery address
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-primary">5.</span>
                    Update order status as you prepare and deliver food
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
