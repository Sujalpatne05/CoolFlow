import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, Smartphone, QrCode, Save, Eye, EyeOff, CheckCircle } from "lucide-react";
import { buildAuthHeaders, clearAuthSession } from "@/lib/session";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { validateUPIId, generateUPIQRData } from "@/lib/payment";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || "").trim();
  if (typeof window !== "undefined" && window.location.protocol === "https:" && configured.startsWith("http://")) return "/api";
  return configured || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5001" : "/api");
})();

export default function PaymentSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Razorpay settings
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  
  // UPI settings
  const [upiEnabled, setUpiEnabled] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');
  const [upiQrCode, setUpiQrCode] = useState('');
  const [upiQrFile, setUpiQrFile] = useState<File | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const headers = buildAuthHeaders();
      if (!headers) {
        clearAuthSession();
        navigate("/admin-login");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/payment-settings`, { headers });
      
      if (res.status === 401) {
        clearAuthSession();
        navigate("/admin-login");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setRazorpayEnabled(data.razorpayEnabled || false);
        setRazorpayKeyId(data.razorpayKeyId || '');
        setRazorpayKeySecret(data.razorpayKeySecret || '');
        setUpiEnabled(data.upiEnabled || false);
        setUpiId(data.upiId || '');
        setUpiName(data.upiName || '');
        setUpiQrCode(data.upiQrCode || '');
      }
    } catch (e) {
      console.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // If QR is being uploaded, clear UPI ID
      setUpiId('');
      setUpiQrFile(file);
      // Convert to base64 for preview and storage
      const reader = new FileReader();
      reader.onloadend = () => {
        setUpiQrCode(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearQrCode = () => {
    setUpiQrCode('');
    setUpiQrFile(null);
  };

  const clearUpiId = () => {
    setUpiId('');
  };

  const saveSettings = async () => {
    // Validate UPI if enabled
    if (upiEnabled && upiId && !validateUPIId(upiId)) {
      toast.error('Invalid UPI ID format');
      return;
    }

    setSaving(true);
    try {
      const headers = buildAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/payment-settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          razorpayEnabled,
          razorpayKeyId,
          razorpayKeySecret,
          upiEnabled,
          upiId,
          upiName,
          upiQrCode
        })
      });

      if (!res.ok) throw new Error('Failed to save settings');
      
      toast.success('Payment settings saved successfully!');
      loadSettings();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
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
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Payment Settings</h1>
          <p className="text-muted-foreground mt-1">Configure online payment options for your customers</p>
        </div>

        <Tabs defaultValue="upi" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="upi">UPI Payment</TabsTrigger>
            <TabsTrigger value="razorpay">Razorpay Gateway</TabsTrigger>
          </TabsList>

          {/* UPI Settings */}
          <TabsContent value="upi" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5" />
                      UPI Payment Settings
                    </CardTitle>
                    <CardDescription>Accept payments directly to your UPI ID - No fees!</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Enable UPI</span>
                    <button
                      onClick={() => setUpiEnabled(!upiEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        upiEnabled ? 'bg-primary' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          upiEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-sm mb-2">💡 Choose ONE method:</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground ml-4 list-disc">
                    <li><strong>UPI ID</strong> - Customers click a button, their UPI app opens</li>
                    <li><strong>QR Code</strong> - Customers scan with their phone camera</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    ⚠️ You can only enable one at a time
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upiId">UPI ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="upiId"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="yourname@paytm / 9876543210@ybl"
                      disabled={!upiEnabled || !!upiQrCode}
                      className="flex-1"
                    />
                    {upiId && !upiQrCode && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearUpiId}
                        disabled={!upiEnabled}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {upiQrCode && (
                    <p className="text-xs text-warning flex items-center gap-1">
                      ⚠️ QR Code is uploaded. Remove QR to use UPI ID
                    </p>
                  )}
                  {!upiQrCode && (
                    <p className="text-xs text-muted-foreground">
                      Your UPI ID for direct payment link
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-center my-4">
                  <div className="flex-1 border-t border-border" />
                  <span className="px-4 text-sm font-semibold text-muted-foreground">OR</span>
                  <div className="flex-1 border-t border-border" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upiQr">UPI QR Code</Label>
                  <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                    {upiQrCode ? (
                      <div className="space-y-3">
                        <img src={upiQrCode} alt="UPI QR Code" className="max-w-xs mx-auto rounded-lg border-2 border-border" />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={clearQrCode}
                          disabled={!upiEnabled}
                        >
                          Remove QR Code
                        </Button>
                        <p className="text-xs text-success">
                          ✅ QR Code uploaded successfully
                        </p>
                      </div>
                    ) : (
                      <>
                        <QrCode className={`h-12 w-12 mx-auto mb-3 ${upiId ? 'text-muted-foreground/30' : 'text-muted-foreground'}`} />
                        <p className={`text-sm font-semibold mb-2 ${upiId ? 'text-muted-foreground/50' : ''}`}>
                          Upload your UPI QR Code
                        </p>
                        <p className={`text-xs mb-4 ${upiId ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                          Customers can scan this code to pay directly
                        </p>
                        <Input
                          id="upiQr"
                          type="file"
                          accept="image/*"
                          disabled={!upiEnabled || !!upiId}
                          onChange={handleQrUpload}
                          className="max-w-xs mx-auto"
                        />
                        {upiId && (
                          <p className="text-xs text-warning mt-3 flex items-center justify-center gap-1">
                            ⚠️ UPI ID is set. Clear UPI ID to upload QR
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {!upiId && (
                    <p className="text-xs text-muted-foreground">
                      💡 Open GPay/PhonePe/Paytm → My QR → Screenshot → Upload
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upiName">Account Holder Name *</Label>
                  <Input
                    id="upiName"
                    value={upiName}
                    onChange={(e) => setUpiName(e.target.value)}
                    placeholder="Sujal Cafe"
                    disabled={!upiEnabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    Name that appears on payment screen
                  </p>
                </div>

                {upiEnabled && (upiId || upiQrCode) && validateUPIId(upiId) !== false && (
                  <div className="bg-success/10 border border-success/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-success mb-2">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-semibold">UPI Configured!</span>
                    </div>
                    {upiQrCode ? (
                      <p className="text-sm text-muted-foreground">
                        ✅ Customers will scan your QR code to pay <strong>{upiName}</strong>
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        ✅ Customers will click to pay <strong>{upiName}</strong> ({upiId})
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Benefits */}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6">
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-primary" />
                  Why use UPI Payment?
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-primary">✓</span>
                    <span><strong>Zero Fees</strong> - No payment gateway charges</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-primary">✓</span>
                    <span><strong>Instant</strong> - Money directly in your account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-primary">✓</span>
                    <span><strong>Popular</strong> - Every Indian uses UPI (PhonePe, GPay, Paytm)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-primary">✓</span>
                    <span><strong>Two Options</strong> - Choose UPI ID (click to pay) OR QR Code (scan to pay)</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Razorpay Settings */}
          <TabsContent value="razorpay" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Razorpay Payment Gateway
                    </CardTitle>
                    <CardDescription>Accept cards, UPI, wallets & more via Razorpay</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Enable Razorpay</span>
                    <button
                      onClick={() => setRazorpayEnabled(!razorpayEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        razorpayEnabled ? 'bg-primary' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          razorpayEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-sm mb-2">📝 How to get Razorpay credentials:</h4>
                  <ol className="text-xs space-y-1 text-muted-foreground ml-4 list-decimal">
                    <li>Create account at <a href="https://razorpay.com" target="_blank" className="text-primary underline">razorpay.com</a></li>
                    <li>Complete KYC verification</li>
                    <li>Go to Settings → API Keys</li>
                    <li>Generate new keys and copy them here</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="razorpayKeyId">Key ID *</Label>
                  <Input
                    id="razorpayKeyId"
                    value={razorpayKeyId}
                    onChange={(e) => setRazorpayKeyId(e.target.value)}
                    placeholder="rzp_test_xxxxxxxxxxxxx"
                    disabled={!razorpayEnabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="razorpayKeySecret">Key Secret *</Label>
                  <div className="relative">
                    <Input
                      id="razorpayKeySecret"
                      type={showSecret ? 'text' : 'password'}
                      value={razorpayKeySecret}
                      onChange={(e) => setRazorpayKeySecret(e.target.value)}
                      placeholder="••••••••••••••••"
                      disabled={!razorpayEnabled}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-destructive">
                    ⚠️ Keep this secret! Never share publicly
                  </p>
                </div>

                {razorpayEnabled && razorpayKeyId && razorpayKeySecret && (
                  <div className="bg-success/10 border border-success/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-success mb-2">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-semibold">Razorpay Configured!</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Customers can pay via Cards, UPI, Wallets & Net Banking
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Info */}
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-6">
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                  About Razorpay
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">•</span>
                    <span><strong>Fees:</strong> 2% per transaction</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">•</span>
                    <span><strong>Settlement:</strong> T+2 days (2 days after payment)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">•</span>
                    <span><strong>Accepts:</strong> Cards, UPI, Wallets, Net Banking</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">•</span>
                    <span><strong>Required:</strong> GST & KYC verification</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => navigate('/settings')}>
            Cancel
          </Button>
          <Button 
            onClick={saveSettings} 
            disabled={saving}
            className="gradient-brand text-white"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
