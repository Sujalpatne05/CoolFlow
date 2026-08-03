import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ShoppingCart, Plus, Minus, MapPin, Phone, Mail, User, 
  Truck, CreditCard, Wallet, Clock, CheckCircle, Package, QrCode, Smartphone, AlertCircle 
} from "lucide-react";
import { generateUPILink } from "@/lib/payment";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

interface MenuItem {
  id: number;
  name: string;
  category: string;
  price: number;
  description: string;
  image_url: string;
  available: boolean;
}

interface Restaurant {
  id: number;
  name: string;
  logo: string;
  taxRate: number;
  city: string;
}

interface CartItem extends MenuItem {
  quantity: number;
}

interface PaymentSettings {
  razorpayEnabled: boolean;
  razorpayKeyId: string;
  upiEnabled: boolean;
  upiId: string;
  upiName: string;
  upiQrCode: string;
}

export default function PublicOnlineOrder() {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<'menu' | 'details' | 'payment' | 'success'>('menu');
  const [orderNumber, setOrderNumber] = useState('');
  
  // Customer details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('');
  const [instructions, setInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'upi' | 'razorpay'>('cod');
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Payment settings
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);

  const DELIVERY_FEE = 40;

  useEffect(() => {
    const loadRestaurantAndMenu = async () => {
      try {
        // Get restaurant info and menu from public endpoint
        const res = await fetch(`${API_BASE_URL}/public/restaurant-menu`);
        if (!res.ok) throw new Error('Failed to load menu');
        const data = await res.json();
        setRestaurant(data.restaurant);
        setMenu(data.menu);
        
        // Load payment settings
        const paymentRes = await fetch(`${API_BASE_URL}/public/payment-settings`);
        if (paymentRes.ok) {
          const paymentData = await paymentRes.json();
          setPaymentSettings(paymentData);
          
          // Set default payment method based on what's available
          if (paymentData.upiEnabled) {
            setPaymentMethod('upi');
          } else if (paymentData.razorpayEnabled) {
            setPaymentMethod('razorpay');
          } else {
            setPaymentMethod('cod');
          }
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load menu');
      } finally {
        setLoading(false);
      }
    };
    loadRestaurantAndMenu();
  }, []);

  const categories = Array.from(new Set(menu.map(item => item.category)));

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) {
        return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: number) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map(c => c.id === itemId ? { ...c, quantity: c.quantity - 1 } : c);
      }
      return prev.filter(c => c.id !== itemId);
    });
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * (restaurant?.taxRate || 5) / 100;
  const total = subtotal + DELIVERY_FEE + tax;

  const handlePlaceOrder = async () => {
    if (!customerName || !customerPhone || !address || cart.length === 0) {
      setError('Please fill all required fields and add items to cart');
      return;
    }

    // If payment method is UPI or Razorpay, go to payment step first
    if (paymentMethod === 'upi' || paymentMethod === 'razorpay') {
      setStep('payment');
      return;
    }

    // For COD, place order directly
    await submitOrder('pending');
  };

  const submitOrder = async (paymentStatus: string) => {
    setSubmitting(true);
    setError('');

    try {
      const orderData = {
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        delivery_address: address,
        landmark,
        pincode,
        items: cart.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        })),
        subtotal,
        delivery_fee: DELIVERY_FEE,
        tax,
        total,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        special_instructions: instructions
      };

      const res = await fetch(`${API_BASE_URL}/public/place-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (!res.ok) throw new Error('Failed to place order');
      
      const result = await res.json();
      setOrderNumber(result.order.order_number);
      setStep('success');
    } catch (e: any) {
      setError(e.message || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUPIPayment = () => {
    // UPI direct payment cannot be verified automatically
    // Customer should use Razorpay for verified UPI payments
    setError('Direct UPI payment verification not available. Please use Razorpay for secure online payment or choose Cash on Delivery.');
    setStep('details');
  };

  const handleRazorpayPayment = async () => {
    if (!paymentSettings?.razorpayEnabled) return;
    
    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      const options = {
        key: paymentSettings.razorpayKeyId,
        amount: total * 100, // Amount in paise
        currency: 'INR',
        name: restaurant?.name || 'Restaurant',
        description: `Food Order`,
        handler: function (response: any) {
          // Payment successful
          submitOrder('completed');
        },
        prefill: {
          name: customerName,
          email: customerEmail,
          contact: customerPhone,
        },
        theme: {
          color: '#F97316',
        },
        modal: {
          ondismiss: function () {
            setError('Payment cancelled. Please try again.');
            setStep('details');
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    };

    script.onerror = () => {
      setError('Failed to load payment gateway');
      setStep('details');
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-secondary/5 flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && !restaurant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-secondary/5 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Package className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Service Unavailable</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-secondary/5 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full animate-scale-in">
          <CardContent className="p-8 text-center">
            <div className="h-20 w-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6 animate-pulse-glow">
              <CheckCircle className="h-12 w-12 text-success" />
            </div>
            <h2 className="text-3xl font-bold mb-3">Order Placed Successfully!</h2>
            <p className="text-lg text-muted-foreground mb-6">
              Your order <span className="font-bold text-primary">#{orderNumber}</span> has been received
            </p>
            
            <div className="bg-primary/5 rounded-xl p-6 mb-6 text-left space-y-3">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Estimated Delivery</p>
                  <p className="text-sm text-muted-foreground">45 minutes</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Delivery Address</p>
                  <p className="text-sm text-muted-foreground">{address}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Total Amount</p>
                  <p className="text-sm text-muted-foreground">₹{total.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              We'll start preparing your order shortly. You'll receive updates on your phone.
            </p>

            <Button 
              onClick={() => navigate(`/track-delivery/${orderNumber}`)} 
              className="gradient-brand text-white w-full"
            >
              Track Your Order
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-secondary/5 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full animate-scale-in">
          <CardHeader>
            <CardTitle className="text-2xl">Complete Payment</CardTitle>
            <CardDescription>Total Amount: ₹{total.toFixed(2)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* UPI Payment - Not supported for verification */}
            {paymentMethod === 'upi' && paymentSettings?.upiEnabled && (
              <div className="text-center space-y-4">
                <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-6">
                  <AlertCircle className="h-16 w-16 text-yellow-600 mx-auto mb-4" />
                  <p className="font-semibold text-lg mb-2 text-yellow-800">Payment Verification Required</p>
                  <p className="text-sm text-yellow-700 mb-4">
                    Direct UPI payments cannot be verified automatically. This prevents customers from claiming payment without actually paying.
                  </p>
                  <div className="bg-white rounded-lg p-4 space-y-2 text-left">
                    <p className="text-sm font-semibold text-gray-800">✅ Recommended Options:</p>
                    <ul className="text-sm text-gray-600 space-y-1 ml-4">
                      <li>• Use <strong>Razorpay</strong> for verified online payments (UPI, Cards, Wallets)</li>
                      <li>• Choose <strong>Cash on Delivery</strong> for manual payment</li>
                    </ul>
                  </div>
                </div>
                
                <Button 
                  onClick={() => setStep('details')} 
                  variant="outline" 
                  className="w-full"
                >
                  Back to Payment Options
                </Button>
              </div>
            )}

            {/* Razorpay Payment - Verified */}
            {paymentMethod === 'razorpay' && paymentSettings?.razorpayEnabled && (
              <div className="text-center space-y-4">
                <div className="bg-primary/10 rounded-xl p-6">
                  <CreditCard className="h-16 w-16 text-primary mx-auto mb-4" />
                  <p className="font-semibold text-lg mb-2">Secure Payment Gateway</p>
                  <p className="text-3xl font-bold text-primary mb-2">₹{total.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Cards • UPI • Wallets • Net Banking</p>
                </div>
                <Button 
                  onClick={handleRazorpayPayment}
                  size="lg"
                  className="gradient-brand text-white w-full"
                  disabled={submitting}
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  {submitting ? 'Processing...' : 'Proceed to Payment'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  🔒 Powered by Razorpay - 100% Secure & Verified
                </p>
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <Button 
              onClick={() => setStep('details')} 
              variant="outline" 
              className="w-full"
            >
              Back to Details
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-secondary/5">
      {/* Header */}
      <div className="bg-white border-b-2 border-border shadow-soft sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {restaurant?.logo && (
              <img src={restaurant.logo} alt="Logo" className="h-12 w-12 rounded-xl object-cover shadow-soft ring-2 ring-primary/20" />
            )}
            <div>
              <h1 className="text-xl font-bold text-foreground">{restaurant?.name}</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {restaurant?.city}
              </p>
            </div>
          </div>
          <Button 
            onClick={() => setStep('details')} 
            disabled={cart.length === 0}
            className="gradient-brand text-white relative"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Cart ({cart.length})
            {cart.length > 0 && (
              <Badge className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center p-0">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {step === 'menu' ? (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Order Food for Delivery</h2>
              <p className="text-muted-foreground">Browse our menu and add items to your cart</p>
            </div>

            <Tabs defaultValue={categories[0]} className="space-y-6">
              <TabsList className="w-full overflow-x-auto flex-nowrap justify-start">
                {categories.map(cat => (
                  <TabsTrigger key={cat} value={cat} className="capitalize whitespace-nowrap">
                    {cat}
                  </TabsTrigger>
                ))}
              </TabsList>

              {categories.map(category => (
                <TabsContent key={category} value={category} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {menu.filter(item => item.category === category).map(item => {
                      const inCart = cart.find(c => c.id === item.id);
                      return (
                        <Card key={item.id} className="hover-lift">
                          <CardContent className="p-4">
                            {item.image_url && (
                              <img 
                                src={item.image_url} 
                                alt={item.name} 
                                className="w-full h-40 object-cover rounded-lg mb-3"
                              />
                            )}
                            <h3 className="font-bold text-lg mb-1">{item.name}</h3>
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{item.description}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-xl font-bold text-primary">₹{item.price}</span>
                              {inCart ? (
                                <div className="flex items-center gap-2 bg-primary/10 rounded-xl px-2 py-1">
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-8 w-8" 
                                    onClick={() => removeFromCart(item.id)}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <span className="font-bold w-8 text-center">{inCart.quantity}</span>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-8 w-8" 
                                    onClick={() => addToCart(item)}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button onClick={() => addToCart(item)} className="gradient-brand text-white">
                                  <Plus className="h-4 w-4 mr-1" /> Add
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </>
        ) : (
          <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Delivery Details</CardTitle>
                  <CardDescription>Enter your delivery information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <User className="h-4 w-4" /> Name *
                      </label>
                      <Input 
                        value={customerName} 
                        onChange={(e) => setCustomerName(e.target.value)} 
                        placeholder="Your full name" 
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Phone className="h-4 w-4" /> Phone *
                      </label>
                      <Input 
                        value={customerPhone} 
                        onChange={(e) => setCustomerPhone(e.target.value)} 
                        placeholder="10-digit mobile number" 
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Email (Optional)
                    </label>
                    <Input 
                      type="email" 
                      value={customerEmail} 
                      onChange={(e) => setCustomerEmail(e.target.value)} 
                      placeholder="your.email@example.com" 
                    />
                  </div>

                  <div>
                    <label className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> Delivery Address *
                    </label>
                    <Input 
                      value={address} 
                      onChange={(e) => setAddress(e.target.value)} 
                      placeholder="House no, Street, Area" 
                      className="mb-2"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input 
                        value={landmark} 
                        onChange={(e) => setLandmark(e.target.value)} 
                        placeholder="Landmark (optional)" 
                      />
                      <Input 
                        value={pincode} 
                        onChange={(e) => setPincode(e.target.value)} 
                        placeholder="Pincode" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold mb-2">Special Instructions</label>
                    <Input 
                      value={instructions} 
                      onChange={(e) => setInstructions(e.target.value)} 
                      placeholder="Any special requests? (optional)" 
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payment Method</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Cash on Delivery - Always available */}
                  <button
                    onClick={() => setPaymentMethod('cod')}
                    className={`w-full p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${
                      paymentMethod === 'cod' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <Wallet className="h-5 w-5 text-primary" />
                    <div className="text-left">
                      <p className="font-semibold">Cash on Delivery</p>
                      <p className="text-xs text-muted-foreground">Pay when you receive your order</p>
                    </div>
                  </button>

                  {/* UPI Payment - if configured */}
                  {paymentSettings?.upiEnabled && (paymentSettings.upiId || paymentSettings.upiQrCode) && (
                    <button
                      onClick={() => setPaymentMethod('upi')}
                      className={`w-full p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${
                        paymentMethod === 'upi' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <Smartphone className="h-5 w-5 text-primary" />
                      <div className="text-left flex-1">
                        <p className="font-semibold flex items-center gap-2">
                          Pay via UPI
                          <Badge variant="outline" className="text-[10px] bg-success/10 text-success">INSTANT</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {paymentSettings.upiQrCode ? 'Scan QR Code to pay' : 'GPay, PhonePe, Paytm & more'}
                        </p>
                      </div>
                    </button>
                  )}

                  {/* Razorpay - if configured */}
                  {paymentSettings?.razorpayEnabled && paymentSettings.razorpayKeyId && (
                    <button
                      onClick={() => setPaymentMethod('razorpay')}
                      className={`w-full p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${
                        paymentMethod === 'razorpay' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <CreditCard className="h-5 w-5 text-primary" />
                      <div className="text-left">
                        <p className="font-semibold">Pay Online</p>
                        <p className="text-xs text-muted-foreground">Cards, UPI, Wallets & Net Banking</p>
                      </div>
                    </button>
                  )}

                  {/* No online payment configured message */}
                  {!paymentSettings?.upiEnabled && !paymentSettings?.razorpayEnabled && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-muted-foreground">
                      💡 Online payment coming soon! Pay with cash for now.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {cart.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.name} x{item.quantity}</span>
                        <span className="font-semibold">₹{(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="border-t pt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delivery Fee</span>
                      <span>₹{DELIVERY_FEE.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax ({restaurant?.taxRate || 5}%)</span>
                      <span>₹{tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Total</span>
                      <span className="text-primary">₹{total.toFixed(2)}</span>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

                  <Button 
                    onClick={handlePlaceOrder} 
                    disabled={submitting || cart.length === 0} 
                    className="w-full gradient-brand text-white"
                    size="lg"
                  >
                    {submitting ? 'Processing...' : 
                     paymentMethod === 'cod' ? `Place Order • ₹${total.toFixed(2)}` :
                     `Proceed to Payment • ₹${total.toFixed(2)}`}
                  </Button>
                  
                  <Button 
                    onClick={() => setStep('menu')} 
                    variant="outline" 
                    className="w-full"
                  >
                    Back to Menu
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
