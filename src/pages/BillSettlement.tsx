import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import React, { useState, useEffect } from "react";
import { apiRequest } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { CreditCard, Check, Printer } from "lucide-react";
import { printBill } from "@/lib/printBill";
import { getStoredRestaurantName } from "@/lib/session";

type Order = {
  id: number;
  table_number: number;
  items: string[];
  total: number;
  status: string;
  orderType: string;
  paymentStatus: string;
  paymentMethod: string | null;
};

type Table = {
  id: number;
  number: number;
  capacity: number;
  status: string;
  section?: string;
};

const PAYMENT_METHODS = ["upi", "card", "cash"] as const;

const BillSettlement: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>("cash");
  const [processingOrderId, setProcessingOrderId] = useState<number | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [taxRate, setTaxRate] = useState<number>(5);
  const [serviceCharge, setServiceCharge] = useState<number>(0);
  const [menuItems, setMenuItems] = useState<Array<{id: number, name: string, price: number}>>([]);

  // Fetch orders and tables
  useEffect(() => {
    fetchOrders();
    fetchTables();
    fetchSettings();
    fetchMenu();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchOrders();
      fetchTables();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const data = await apiRequest<Order[]>("/orders", { method: "GET" }, true);
      // Filter for dine-in orders that are not paid yet
      const dineInOrders = data.filter(
        (o) => o.orderType === "dine-in" && o.paymentStatus === "unpaid"
      );
      
      // Group orders by table number to show all unpaid orders for each table
      const groupedByTable = new Map<number, Order[]>();
      dineInOrders.forEach(order => {
        if (order.table_number) {
          if (!groupedByTable.has(order.table_number)) {
            groupedByTable.set(order.table_number, []);
          }
          groupedByTable.get(order.table_number)!.push(order);
        }
      });
      
      // Flatten back to array but keep grouped structure in mind
      setOrders(dineInOrders);
    } catch (err) {
      toast.error("Failed to load orders");
    } finally {
      setLoadingOrders(false);
    }
  };

  const fetchTables = async () => {
    try {
      const data = await apiRequest<any[]>("/tables", { method: "GET" }, true);
      setTables(
        data.map((t) => ({
          id: t.id,
          number: t.number ?? t.table_number,
          capacity: t.capacity,
          status: t.status,
          section: t.section || "",
        }))
      );
    } catch (err) {
      toast.error("Failed to load tables");
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await apiRequest<{ tax_rate: number; service_charge: number }>("/settings", { method: "GET" }, true);
      setTaxRate(Number(data.tax_rate ?? 5));
      setServiceCharge(Number(data.service_charge ?? 0));
    } catch (err) {
      // Use defaults on error
    }
  };

  const fetchMenu = async () => {
    try {
      const data = await apiRequest<Array<{id: number, name: string, price: number}>>("/menu", { method: "GET" }, true);
      setMenuItems(data);
    } catch (err) {
      // Menu not critical for bill settlement
    }
  };

  const getItemPrice = (itemName: string): number => {
    const menuItem = menuItems.find(m => m.name.toLowerCase() === itemName.toLowerCase());
    return menuItem?.price || 0;
  };

  const handlePayment = async (orderId: number, tableNumber: number) => {
    setProcessingOrderId(orderId);
    try {
      // Get all unpaid orders for this table
      const tableOrders = orders.filter(o => o.table_number === tableNumber);
      
      // Update ALL unpaid orders for this table to paid
      for (const order of tableOrders) {
        await apiRequest(`/orders/${order.id}`, {
          method: "PUT",
          body: JSON.stringify({
            paymentStatus: "paid",
            paymentMethod: selectedPaymentMethod,
            status: "completed",
          }),
        });
      }

      // Update table status to available
      const table = tables.find((t) => t.number === tableNumber);
      if (table) {
        await apiRequest(`/tables/${table.id}`, {
          method: "PUT",
          body: JSON.stringify({
            status: "available",
            current_order: null,
          }),
        });
      }

      toast.success(`Payment collected for Table ${tableNumber} (${tableOrders.length} order${tableOrders.length > 1 ? 's' : ''})`);
      setOrders((prev) => prev.filter((o) => o.table_number !== tableNumber));
    } catch (err: any) {
      toast.error(err.message || "Failed to process payment");
    } finally {
      setProcessingOrderId(null);
    }
  };

  const getTableInfo = (tableNumber: number) => {
    return tables.find((t) => t.number === tableNumber);
  };

  const handlePrintBill = (tableNumber: number, tableOrders: Order[]) => {
    const subtotal = tableOrders.reduce((sum, o) => sum + Number(o.total), 0) / (1 + taxRate / 100);
    const tax = subtotal * (taxRate / 100);
    const svc = subtotal * (serviceCharge / 100);
    const totalAmount = subtotal + tax + svc;
    
    printBill({
      orderId: tableOrders[0].id,
      orderType: "dine-in",
      tableNumber,
      items: tableOrders.flatMap(order => 
        order.items.map((itemStr: string | any) => {
          let itemName = '';
          let qty = 1;
          let note = '';
          
          if (typeof itemStr === 'object' && itemStr !== null) {
            itemName = itemStr.name || '';
            qty = itemStr.qty || 1;
            note = itemStr.note || '';
          } else {
            const match = itemStr.match(/^(.+?)\s+x(\d+)$/);
            if (match) {
              itemName = match[1];
              qty = Number(match[2]);
            } else {
              itemName = itemStr;
            }
          }
          
          return { name: itemName, price: 0, qty, note };
        })
      ),
      subtotal: Math.round(subtotal),
      tax: Math.round(tax),
      serviceCharge: Math.round(svc),
      total: Math.round(totalAmount),
      restaurantName: getStoredRestaurantName() || "OrderNest",
      timestamp: new Date(),
    });
  };

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-primary-50 via-white to-primary-100 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-primary-700 flex items-center gap-2 mb-2">
              <CreditCard className="text-primary-500" /> Bill Settlement
            </h1>
            <p className="text-gray-800 font-semibold">Collect payments from completed dine-in orders</p>
          </div>

          {/* Orders List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loadingOrders ? (
              <div className="col-span-full text-center py-8 text-muted-foreground">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <Check className="text-green-500" size={40} />
                </div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">All Settled!</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                  No pending payments right now. All dine-in tables have been cleared.
                </p>
                <p className="text-xs text-muted-foreground mt-4 bg-primary-50 px-4 py-2 rounded-full">
                  New orders will appear here automatically
                </p>
              </div>
            ) : (
              // Group orders by table
              Array.from(
                orders.reduce((map, order) => {
                  const key = order.table_number;
                  if (!map.has(key)) map.set(key, []);
                  map.get(key)!.push(order);
                  return map;
                }, new Map<number, Order[]>())
              ).map(([tableNumber, tableOrders]) => {
                const tableInfo = getTableInfo(tableNumber);
                const totalAmount = tableOrders.reduce((sum, o) => sum + Number(o.total), 0);
                const isExpanded = expandedOrderId === tableNumber;
                
                return (
                  <Card 
                    key={tableNumber} 
                    className="bg-white/90 shadow-lg border-primary-100 hover:shadow-xl transition-all cursor-pointer"
                    onClick={() => setExpandedOrderId(isExpanded ? null : tableNumber)}
                  >
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-xl text-primary-700">
                            Table {tableNumber}
                          </CardTitle>
                          {tableInfo && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {tableInfo.section} • {tableInfo.capacity} seats
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {tableOrders.length} order{tableOrders.length > 1 ? 's' : ''}
                          </p>
                        </div>
                        <Badge className={tableOrders[0]?.status === 'served' ? 'bg-green-500' : 'bg-blue-500'}>
                          {tableOrders[0]?.status ? tableOrders[0].status.charAt(0).toUpperCase() + tableOrders[0].status.slice(1) : 'Pending'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* All Orders for this Table */}
                      <div className="mb-4 pb-4 border-b">
                        <p className="font-semibold text-sm mb-2">Orders:</p>
                        {tableOrders.map((order, idx) => (
                          <div key={order.id} className="text-sm mb-3">
                            <p className="font-medium mb-1">Order #{order.id}</p>
                            <div className="space-y-1 ml-2">
                              {order.items.map((item, i) => {
                                let itemName = '';
                                let qty = 1;
                                
                                if (typeof item === 'object' && item !== null) {
                                  itemName = item.name || '';
                                  qty = item.qty || 1;
                                } else {
                                  const match = String(item).match(/^(.+?)\s+x(\d+)$/);
                                  if (match) {
                                    itemName = match[1];
                                    qty = Number(match[2]);
                                  } else {
                                    itemName = String(item);
                                  }
                                }
                                
                                const itemPrice = getItemPrice(itemName);
                                const totalItemPrice = itemPrice * qty;
                                
                                return (
                                  <div key={i} className="flex justify-between items-center text-xs">
                                    <span className="text-muted-foreground">• {itemName} x{qty}</span>
                                    <span className="font-medium">₹{totalItemPrice.toFixed(2)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Price Breakdown with Tax */}
                      <div className="mb-4 pb-4 border-b space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">Subtotal</span>
                          <span className="font-semibold">₹{(totalAmount / (1 + taxRate / 100)).toFixed(2)}</span>
                        </div>
                        {taxRate > 0 && (
                          <div className="bg-white rounded-lg p-2 border-2 border-primary-300">
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="text-primary-700 font-bold text-sm">Tax Applied</span>
                                <p className="text-xs text-primary-600">({taxRate}%)</p>
                              </div>
                              <span className="font-bold text-primary-600">₹{(totalAmount * taxRate / (100 + taxRate)).toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                        {serviceCharge > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-700">Service Charge ({serviceCharge}%)</span>
                            <span className="font-semibold">₹{(totalAmount * serviceCharge / (100 + serviceCharge)).toFixed(2)}</span>
                          </div>
                        )}
                      </div>

                      {/* Total */}
                      <div className="mb-4 pb-4 border-b">
                        <div className="flex justify-between items-center bg-gradient-to-r from-primary-50 to-primary-100 p-3 rounded-lg">
                          <span className="font-bold text-lg">Total Amount:</span>
                          <span className="text-2xl font-bold text-primary-600">
                            ₹{totalAmount.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Payment Method Selection - Shows when expanded */}
                      {isExpanded && (
                        <div className="mb-4 pb-4 border-t pt-4">
                          <p className="font-semibold text-sm mb-3">Select Payment Method:</p>
                          <div className="flex gap-2 mb-4">
                            {PAYMENT_METHODS.map((method) => (
                              <Button
                                key={method}
                                size="sm"
                                variant={selectedPaymentMethod === method ? "default" : "outline"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPaymentMethod(method);
                                }}
                                className="capitalize flex-1"
                              >
                                {method.toUpperCase()}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Buttons */}
                      <div className="flex flex-col gap-2">
                        <Button
                          className="w-full bg-green-500 hover:bg-green-600 disabled:bg-green-100 disabled:text-gray-900"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePayment(tableOrders[0].id, tableNumber);
                          }}
                          disabled={processingOrderId === tableNumber || !isExpanded}
                        >
                          {processingOrderId === tableNumber ? (
                            "Processing..."
                          ) : !isExpanded ? (
                            <>
                              <Check size={16} className="mr-2" /> Select Payment Method First
                            </>
                          ) : (
                            <>
                              <Check size={16} className="mr-2" /> Collect Payment
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full border-primary-300 text-primary-700 hover:bg-primary-50 hover:text-gray-950 disabled:bg-primary-50 disabled:text-gray-900"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintBill(tableNumber, tableOrders);
                          }}
                        >
                          <Printer size={16} className="mr-2" /> Print Bill
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BillSettlement;
