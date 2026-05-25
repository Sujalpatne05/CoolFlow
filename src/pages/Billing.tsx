


import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import React, { useState, useEffect } from "react";
import { apiRequest, API_BASE_URL } from "@/lib/api";
import { getAuthToken, getStoredRole, getStoredUserId, buildAuthHeaders, getStoredRestaurantName } from "@/lib/session";
import { toast } from "@/components/ui/sonner";
import { useLocation } from "react-router-dom";
import { Monitor, ShoppingCart, UtensilsCrossed, Printer, Minus, Plus } from "lucide-react";
import { printBill } from "@/lib/printBill";

const ORDER_TYPES = ["dine-in", "take-away", "delivery"] as const;
const PAYMENT_METHODS = ["upi", "card", "cash"] as const;
type Table = { id: number; number: number; capacity: number; status: string; section?: string };
type MenuItem = { id: number; name: string; price: number; category: string; available: boolean; image_url?: string };

const MENU_CATEGORIES_DEFAULT = ["All"];
type OrderItem = { id: number; name: string; price: number; qty: number };




const Billing: React.FC = () => {
	const location = useLocation();
	const [orderType, setOrderType] = useState<typeof ORDER_TYPES[number]>("dine-in");
	const [selectedTable, setSelectedTable] = useState<number | null>(null);
	const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
	const [customer, setCustomer] = useState({ name: "", phone: "", address: "" });
	const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>("cash");
	const [deliveryPartner, setDeliveryPartner] = useState<"in-house" | "swiggy" | "zomato">("in-house");
	const [menuCategory, setMenuCategory] = useState<string>("All");
	const [menuSearch, setMenuSearch] = useState<string>("");
	const [menu, setMenu] = useState<MenuItem[]>([]);
	const [menuCategories, setMenuCategories] = useState<string[]>(MENU_CATEGORIES_DEFAULT);
	const [loadingMenu, setLoadingMenu] = useState(false);
	const [tables, setTables] = useState<Table[]>([]);
	const [loadingTables, setLoadingTables] = useState(false);
	const [existingOrder, setExistingOrder] = useState<any>(null);
	const [loadingOrder, setLoadingOrder] = useState(false);
	const [recentOrders, setRecentOrders] = useState<any[]>([]);
	const [loadingRecentOrders, setLoadingRecentOrders] = useState(false);
	const [taxRate, setTaxRate] = useState<number>(5);
	const [serviceCharge, setServiceCharge] = useState<number>(0);
	const [notes, setNotes] = useState<string>("");

	// Fetch settings (tax rate, service charge, default delivery partner)
	useEffect(() => {
		apiRequest<{ tax_rate: number; service_charge: number; default_delivery_partner: string }>("/settings", { method: "GET" }, true)
			.then(d => {
				setTaxRate(Number(d.tax_rate ?? 5));
				setServiceCharge(Number(d.service_charge ?? 0));
				if (d.default_delivery_partner) {
					setDeliveryPartner(d.default_delivery_partner as "in-house" | "swiggy" | "zomato");
				}
			})
			.catch(() => {}); // fallback to defaults on error
	}, []);

	// Fetch menu from backend
	useEffect(() => {
		setLoadingMenu(true);
		apiRequest<MenuItem[]>("/menu", { method: "GET" }, true)
			.then(data => {
				if (!Array.isArray(data) || data.length === 0) {
					toast.error("No menu items available");
					setMenu([]);
					return;
				}
				setMenu(data);
				// Generate categories from menu
				const cats = Array.from(new Set(data.map(item => item.category)));
				setMenuCategories(["All", ...cats]);
			})
			.catch((err: any) => {
				const errorMsg = err?.message || "Failed to load menu. Please refresh the page.";
				toast.error(errorMsg);
				setMenu([]);
			})
			.finally(() => setLoadingMenu(false));
	}, []);

	// Fetch tables from backend
	useEffect(() => {
		setLoadingTables(true);
		apiRequest<any[]>("/tables", { method: "GET" }, true)
			.then(data => {
				if (!Array.isArray(data)) {
					toast.error("Invalid table data received");
					setTables([]);
					return;
				}
				setTables(data.map(t => ({
					id: t.id,
					number: t.number ?? t.table_number, // support both
					capacity: t.capacity,
					status: t.status,
					section: t.section || ""
				})));
			})
			.catch((err: any) => {
				setTables([]);
				const errorMsg = err?.message || "Failed to load tables. Please refresh the page.";
				toast.error(errorMsg);
			})
			.finally(() => setLoadingTables(false));
	}, []);

	// Fetch recent orders
	useEffect(() => {
		setLoadingRecentOrders(true);
		apiRequest<any[]>("/orders", { method: "GET" }, true)
			.then(data => {
				if (!Array.isArray(data)) {
					setRecentOrders([]);
					return;
				}
				// Get last 5 orders
				const recent = data.slice(0, 5);
				setRecentOrders(recent);
			})
			.catch((err: any) => {
				setRecentOrders([]);
				// Don't show error for recent orders - it's not critical
			})
			.finally(() => setLoadingRecentOrders(false));
	}, []);

	// Auto-select table from query string and switch to dine-in
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const tableParam = params.get("table");
		if (tableParam && !selectedTable) {
			const tableNum = Number(tableParam);
			if (!isNaN(tableNum)) {
				setSelectedTable(tableNum);
				setOrderType("dine-in"); // always dine-in when opening from table management
			}
		}
	}, [location.search, selectedTable]);

	// Fetch existing order when table is selected (depends on menu being loaded)
	useEffect(() => {
		if (selectedTable && orderType === "dine-in" && menu.length > 0) {
			setLoadingOrder(true);
			const headers = buildAuthHeaders();
			fetch(`${API_BASE_URL}/orders/table/${selectedTable}`, { headers: headers || {} })
				.then(res => {
					if (res.status === 404) {
						// No existing order for this table
						setExistingOrder(null);
						setOrderItems([]);
						setNotes("");
						setLoadingOrder(false);
						return null;
					}
					if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
					return res.json();
				})
				.then(data => {
					if (!data || data.error) {
						setExistingOrder(null);
						setOrderItems([]);
						setNotes("");
						setLoadingOrder(false);
						return;
					}
					setExistingOrder(data);
					setNotes(data.notes || "");
					// Only pre-fill items if order is still active (not served/completed)
					if (data.status === 'served' || data.status === 'completed') {
						setOrderItems([]);
						return;
					}
					// Parse items from existing order
					const parsedItems: OrderItem[] = data.items.map((itemStr: string) => {
						// Parse format like "Butter Chicken x1"
						const match = itemStr.match(/^(.+?)\s+x(\d+)$/);
						if (match) {
							const itemName = match[1];
							const qty = Number(match[2]);
							const menuItem = menu.find(m => m.name === itemName);
							if (menuItem) {
								return { id: menuItem.id, name: menuItem.name, price: menuItem.price, qty };
							}
							return { id: Date.now() + Math.random(), name: itemName, price: 0, qty };
						}
						return { id: Date.now() + Math.random(), name: itemStr, price: 0, qty: 1 };
					}).filter(Boolean);
					setOrderItems(parsedItems);
				})
				.catch(() => {
					setExistingOrder(null);
					setOrderItems([]);
					setNotes("");
				})
				.finally(() => setLoadingOrder(false));
		} else {
			setExistingOrder(null);
			setOrderItems([]);
			setNotes("");
		}
	}, [selectedTable, orderType, menu]);

	const addItem = (item: { id: number; name: string; price: number }, e?: React.MouseEvent) => {
		if (e) {
			e.stopPropagation();
			e.preventDefault();
		}
		setOrderItems((prev) => {
			const found = prev.find((i) => i.id === item.id);
			if (found) {
				return prev.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i));
			}
			return [...prev, { ...item, qty: 1 }];
		});
	};
	const removeItem = (id: number, e?: React.MouseEvent) => {
		if (e) {
			e.stopPropagation();
			e.preventDefault();
		}
		setOrderItems((prev) => {
			const found = prev.find((i) => i.id === id);
			if (found && found.qty > 1) {
				return prev.map((i) => (i.id === id ? { ...i, qty: i.qty - 1 } : i));
			}
			return prev.filter((i) => i.id !== id);
		});
	};
	const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0);
	const tax = Math.round(subtotal * (taxRate / 100));
	const svc = Math.round(subtotal * (serviceCharge / 100));
	const total = subtotal + tax + svc;

	const handlePrintBill = () => {
		if (orderItems.length === 0) {
			toast.error("No items to print");
			return;
		}

		printBill({
			orderId: existingOrder?.id || "NEW",
			orderType,
			tableNumber: orderType === "dine-in" ? selectedTable || undefined : undefined,
			items: orderItems,
			subtotal,
			tax,
			serviceCharge: svc,
			total,
			paymentMethod: (orderType === "delivery" || orderType === "take-away") ? paymentMethod : undefined,
			customerName: (orderType === "delivery" || orderType === "take-away") ? customer.name : undefined,
			customerPhone: (orderType === "delivery" || orderType === "take-away") ? customer.phone : undefined,
			restaurantName: getStoredRestaurantName() || "RestroHub",
			timestamp: new Date(),
		});
	};

	const handlePlaceOrder = async () => {
		if (!orderItems.length) {
			toast.error("Please select at least one item before placing order");
			return;
		}
		// Prevent dine-in order without table
		if (orderType === "dine-in" && !selectedTable) {
			toast.error("Please select a table for dine-in orders");
			return;
		}
		// For delivery, require payment method selection
		if (orderType === "delivery" && !paymentMethod) {
			toast.error("Please select a payment method for delivery orders");
			return;
		}
		// For delivery, require customer details
		if (orderType === "delivery") {
			if (!customer.name || customer.name.trim().length < 2) {
				toast.error("Customer name must be at least 2 characters");
				return;
			}
			if (!customer.phone || !/^\d{10}$/.test(customer.phone.replace(/\D/g, ""))) {
				toast.error("Phone must be 10 digits");
				return;
			}
			if (!customer.address || customer.address.trim().length < 5) {
				toast.error("Address must be at least 5 characters");
				return;
			}
		}
		// For take-away, customer details are optional (name and phone not required)
		// Get userId from session (logged-in user's actual ID)
		const userId = getStoredUserId() || 1;
		
		try {
			if (existingOrder && existingOrder.status !== 'served' && existingOrder.status !== 'completed') {
				// Update existing order only if it's still active
				const updatedItems = orderItems.map(i => `${i.name} x${i.qty}`);
				await apiRequest(`/orders/${existingOrder.id}`, {
					method: "PUT",
					body: JSON.stringify({
						items: updatedItems,
						total,
						notes,
					}),
				});
				toast.success("Order updated successfully!");
			} else {
				// Create new order
				const payload = {
					userId,
					items: orderItems.map(i => `${i.name} x${i.qty}`),
					total,
					orderType,
					paymentMethod: (orderType === "delivery" || orderType === "take-away") ? paymentMethod : null,
					table_number: orderType === "dine-in" ? selectedTable : null,
					notes,
				};
				const newOrder = await apiRequest<any>("/orders", {
					method: "POST",
					body: JSON.stringify(payload),
				});
				
				// Update table status to occupied for dine-in orders
				if (orderType === "dine-in" && selectedTable) {
					const table = tables.find(t => t.number === selectedTable);
					if (table) {
						try {
							await apiRequest(`/tables/${table.id}`, {
								method: "PUT",
								body: JSON.stringify({
									status: "occupied",
									current_order: `ORD-${newOrder.id}`,
								}),
							});
						} catch (err: any) {
							// Table update failed, but order was created - show warning
							toast.error("Order created but table status update failed");
						}
					}
				}

				// Create delivery record if order type is delivery
				if (orderType === "delivery") {
					try {
						// Set driver based on delivery partner
						let driverName = "Unassigned";
						if (deliveryPartner === "swiggy") {
							driverName = "Swiggy Rider";
						} else if (deliveryPartner === "zomato") {
							driverName = "Zomato Rider";
						}

						const deliveryPayload = {
							order_number: `ORD-${newOrder.id}`,
							customer_name: customer.name,
							phone: customer.phone,
							address: customer.address,
							partner: deliveryPartner,
							amount: total,
							driver: driverName,
							status: "pending",
						};
						await apiRequest("/deliveries", {
							method: "POST",
							body: JSON.stringify(deliveryPayload),
						});
					} catch (err: any) {
						// Delivery record creation failed, but order was created
						toast.error("Order created but delivery record failed. Please create manually.");
					}
				}
				
				toast.success("Order placed successfully!");
			}
			setOrderItems([]);
			setCustomer({ name: "", phone: "", address: "" });
			setSelectedTable(null);
			setExistingOrder(null);
			setNotes("");
		} catch (err: any) {
			const errorMsg = err?.message || "Failed to place order. Please try again.";
			toast.error(errorMsg);
		}
	};

	// Filtered menu
	const filteredMenu = menu.filter(item =>
		(menuCategory === "All" || item.category === menuCategory) &&
		item.name.toLowerCase().includes(menuSearch.toLowerCase())
	);

	return (
		<DashboardLayout>
			<div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-orange-50 via-white to-orange-100 flex flex-col justify-between">
				{/* Header */}
				<div className="py-4 px-3 sm:py-6 sm:px-4 md:px-0 max-w-6xl mx-auto w-full">
					<div className="flex flex-col gap-3 mb-6">
						<div>
							<h1 className="text-2xl sm:text-3xl font-bold text-orange-700 flex items-center gap-2 mb-1">
								<ShoppingCart className="inline-block text-orange-500 flex-shrink-0" size={24} /> POS Billing
							</h1>
							<div className="text-muted-foreground text-xs sm:text-sm">Welcome to RestroHub! Please select items and complete the order below.</div>
						</div>
						<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
							<span className="bg-orange-100 text-orange-700 px-2 sm:px-3 py-1 rounded-full font-semibold text-xs sm:text-sm truncate">Restaurant: {getStoredRestaurantName() || "Restaurant"}</span>
							<span className="bg-orange-100 text-orange-700 px-2 sm:px-3 py-1 rounded-full font-semibold text-xs sm:text-sm flex items-center gap-1 w-fit">KDS <Monitor className="inline-block flex-shrink-0" size={14} /></span>
						</div>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
						{/* Menu Section */}
						<Card className="lg:col-span-2 bg-white/90 shadow-lg">
							<CardHeader className="p-3 sm:p-6">
								<CardTitle className="text-lg sm:text-xl flex items-center gap-2">
									<UtensilsCrossed className="text-orange-500 flex-shrink-0" /> Menu
								</CardTitle>
								<Tabs value={orderType} onValueChange={v => setOrderType(v as typeof orderType)}>
									<TabsList className="mt-2 w-full grid grid-cols-3">
										{ORDER_TYPES.map(type => (
											<TabsTrigger key={type} value={type} className="capitalize text-xs sm:text-sm">
												{type.replace("-", " ")}
											</TabsTrigger>
										))}
									</TabsList>
								</Tabs>
								{orderType === "dine-in" && (
									<div className="my-4 sm:my-6">
										<div className="border-t border-orange-100 mb-4"></div>
										<label className="block mb-2 text-sm sm:text-base font-semibold text-orange-700">Table</label>
										<div className="flex gap-2 items-center">
													<select
														className="border rounded px-2 sm:px-3 py-2 bg-orange-50 focus:border-orange-400 focus:ring-2 focus:ring-orange-200 transition-all text-sm w-full"
														value={selectedTable ?? ""}
														onChange={e => setSelectedTable(Number(e.target.value))}
														disabled={loadingTables}
													>
														<option value="">{loadingTables ? "Loading tables..." : "Select Table"}</option>
														{/* Show available tables first */}
														{tables.filter(t => t.status === "available").length > 0 && (
															<optgroup label="Available Tables">
																{tables.filter(t => t.status === "available").map(t => (
																	<option key={t.id} value={t.number}>
																		Table {t.number} ({t.section || "No section"}, {t.capacity} seats)
																	</option>
																))}
															</optgroup>
														)}
														{/* Show occupied tables (for editing existing orders) */}
														{tables.filter(t => t.status === "occupied").length > 0 && (
															<optgroup label="Occupied Tables (Edit Order)">
																{tables.filter(t => t.status === "occupied").map(t => (
																	<option key={t.id} value={t.number}>
																		Table {t.number} ({t.section || "No section"}, {t.capacity} seats)
																	</option>
																))}
															</optgroup>
														)}
													</select>
										</div>
									</div>
								)}
								{/* Banner when dine-in but no table selected */}
								{orderType === "dine-in" && !selectedTable && (
									<div className="mx-0 mb-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-600 text-center">
										⚠️ Please select a table to add items
									</div>
								)}
								{/* Search Menu */}
								<div className="flex flex-col gap-2 mt-2 mb-4">
									<Input
										className="w-full text-sm"
										placeholder="Search menu..."
										value={menuSearch}
										onChange={e => setMenuSearch(e.target.value)}
									/>
								</div>
							</CardHeader>
							<CardContent className="p-3 sm:p-6">
								<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2 sm:gap-4">
									{loadingMenu ? (
										<div className="col-span-full text-center text-muted-foreground py-8 text-sm">Loading menu...</div>
									) : filteredMenu.length === 0 ? (
										<div className="col-span-full text-center text-muted-foreground py-8 text-sm">No items found.</div>
									) : (
										filteredMenu.map(item => (
											<Card key={item.id} className="p-2 sm:p-3 flex flex-col items-center bg-orange-50/80 border-orange-100 shadow-sm hover:shadow-md transition-all">
												<div className="mb-2 text-2xl sm:text-3xl"><UtensilsCrossed className="text-orange-500" /></div>
												<span className="font-semibold text-xs sm:text-base mb-1 text-center line-clamp-2">{item.name}</span>
												<Badge className="mb-2 bg-orange-500/90 text-white text-xs">₹{item.price}</Badge>
												<Button size="sm" onClick={() => addItem(item)} variant="outline" disabled={!item.available || (orderType === "dine-in" && !selectedTable)} className="text-xs">Add</Button>
												{!item.available && <span className="text-xs text-red-500 mt-1">Unavailable</span>}
											</Card>
										))
									)}
								</div>
							</CardContent>
						</Card>

						{/* Order Summary Section */}
						<Card className="bg-gradient-to-br from-orange-50 to-white shadow-xl border-orange-200">
							<CardHeader className="p-4 sm:p-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-lg">
								<CardTitle className="text-lg sm:text-2xl flex items-center gap-2 flex-wrap">
									<ShoppingCart className="flex-shrink-0" size={28} /> Order Summary
									{existingOrder && existingOrder.status !== 'served' && existingOrder.status !== 'completed' && <Badge className="bg-white text-orange-600 text-xs ml-auto">Editing #{existingOrder.id}</Badge>}
								</CardTitle>
							</CardHeader>
							<CardContent className="p-4 sm:p-6">
								{orderItems.length === 0 ? (
									<div className="text-center py-8">
										<ShoppingCart className="mx-auto mb-3 text-gray-300" size={48} />
										<p className="text-muted-foreground text-sm">No items added yet. Select items from the menu to get started.</p>
									</div>
								) : (
									<>
										{/* Items List */}
										<div className="mb-4">
											<div className="flex items-center justify-between mb-3">
												<span className="font-bold text-sm text-gray-700">Items ({orderItems.length})</span>
												<span className="text-xs text-gray-500">Tap - or + to adjust</span>
											</div>
											<div className="space-y-2 max-h-56 overflow-y-auto pr-2">
												{orderItems.map((item, idx) => (
													<div key={item.id} className="bg-white border-2 border-orange-200 rounded-lg p-3 hover:shadow-md transition-shadow">
														<div className="flex items-start justify-between gap-2">
															<div className="flex-1 min-w-0">
																<div className="flex items-center gap-2 mb-1">
																	<span className="inline-block bg-orange-100 text-orange-700 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">{idx + 1}</span>
																	<h4 className="font-semibold text-sm text-gray-800 truncate">{item.name}</h4>
																</div>
																<div className="flex items-center justify-between">
																	<div className="flex items-center gap-2">
																		<Button size="sm" variant="outline" onClick={(e) => removeItem(item.id, e)} className="h-7 w-7 p-0 text-orange-600 border-orange-300 hover:bg-orange-50">
																			<Minus size={16} />
																		</Button>
																		<span className="font-bold text-orange-600 min-w-6 text-center">{item.qty}</span>
																		<Button size="sm" variant="outline" onClick={(e) => addItem(item, e)} className="h-7 w-7 p-0 text-orange-600 border-orange-300 hover:bg-orange-50">
																			<Plus size={16} />
																		</Button>
																	</div>
																	<span className="font-bold text-orange-700 text-sm">₹{item.price * item.qty}</span>
																</div>
															</div>
														</div>
													</div>
												))}
											</div>
										</div>

										{/* Divider */}
										<div className="border-t-2 border-orange-200 my-4"></div>

										{/* Price Breakdown */}
										<div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 mb-4 space-y-3 border border-orange-200">
											{/* Subtotal */}
											<div className="flex justify-between items-center">
												<span className="text-gray-700 font-medium">Subtotal</span>
												<span className="font-semibold text-gray-800">₹{subtotal}</span>
											</div>
											
											{/* Tax - Highlighted */}
											{tax > 0 && (
												<div className="bg-white rounded-lg p-3 border-2 border-orange-300">
													<div className="flex justify-between items-center">
														<div>
															<span className="text-orange-700 font-bold">Tax Applied</span>
															<p className="text-xs text-orange-600 mt-0.5">({taxRate}% of subtotal)</p>
														</div>
														<span className="font-bold text-lg text-orange-600">₹{tax}</span>
													</div>
												</div>
											)}
											
											{/* Service Charge - If applicable */}
											{serviceCharge > 0 && svc > 0 && (
												<div className="flex justify-between text-sm">
													<span className="text-gray-700">Service Charge ({serviceCharge}%)</span>
													<span className="font-semibold text-gray-800">₹{svc}</span>
												</div>
											)}
											
											{/* Total Amount - Bold and Prominent */}
											<div className="border-t-2 border-orange-300 pt-3 flex justify-between items-center bg-white rounded-lg p-3 mt-3">
												<span className="font-bold text-gray-900 text-lg">Total Amount</span>
												<span className="font-bold text-2xl text-orange-600">₹{total}</span>
											</div>
										</div>
									</>
								)}
								{(orderType === "take-away" || orderType === "delivery") && (
									<div className="mb-4">
										<div className="font-medium mb-2 text-sm">Customer Details</div>
										<Input
											className="mb-2 text-sm"
											placeholder="Name"
											value={customer.name}
											onChange={e => setCustomer({ ...customer, name: e.target.value })}
										/>
										<Input
											className="mb-2 text-sm"
											placeholder="Phone"
											value={customer.phone}
											onChange={e => setCustomer({ ...customer, phone: e.target.value })}
										/>
										{orderType === "delivery" && (
											<Input
												className="mb-2 text-sm"
												placeholder="Address"
												value={customer.address}
												onChange={e => setCustomer({ ...customer, address: e.target.value })}
											/>
										)}
									</div>
								)}
								{(orderType === "take-away" || orderType === "delivery") && (
									<div className="mb-4">
										<div className="font-medium mb-2 text-sm">Payment Method</div>
										<div className="flex gap-2 flex-wrap">
											{PAYMENT_METHODS.map(method => (
												<Button
													key={method}
													size="sm"
													variant={paymentMethod === method ? "default" : "outline"}
													onClick={() => setPaymentMethod(method)}
													className="text-xs flex-1 min-w-fit"
												>
													{method.toUpperCase()}
												</Button>
											))}
										</div>
									</div>
								)}
								{(orderType === "take-away" || orderType === "delivery") && (
									<div className="mb-4">
										<div className="font-medium mb-2 text-sm">Delivery Partner</div>
										<div className="flex gap-2 flex-wrap">
											<Button
												size="sm"
												variant={deliveryPartner === "in-house" ? "default" : "outline"}
												onClick={() => setDeliveryPartner("in-house")}
												className="text-xs flex-1 min-w-fit"
											>
												In-House
											</Button>
											<Button
												size="sm"
												variant={deliveryPartner === "swiggy" ? "default" : "outline"}
												onClick={() => setDeliveryPartner("swiggy")}
												className="text-xs flex-1 min-w-fit"
											>
												Swiggy
											</Button>
											<Button
												size="sm"
												variant={deliveryPartner === "zomato" ? "default" : "outline"}
												onClick={() => setDeliveryPartner("zomato")}
												className="text-xs flex-1 min-w-fit"
											>
												Zomato
											</Button>
										</div>
									</div>
								)}
								<div className="mb-4">
									<div className="font-medium mb-2 text-sm">Special Instructions (Optional)</div>
									<textarea
										className="w-full border rounded px-2 sm:px-3 py-2 bg-orange-50 focus:border-orange-400 focus:ring-2 focus:ring-orange-200 transition-all text-sm resize-none"
										placeholder="e.g., Extra spicy, No salt, Salty, etc."
										value={notes}
										onChange={e => setNotes(e.target.value)}
										rows={3}
									/>
								</div>
								<Button className="w-full bg-orange-500 hover:bg-orange-600 text-sm" onClick={handlePlaceOrder} disabled={orderItems.length === 0}>
									{existingOrder && existingOrder.status !== 'served' && existingOrder.status !== 'completed' ? "Update Order" : "Place Order"}
								</Button>
								<Button 
									variant="outline" 
									className="w-full border-orange-300 text-orange-600 hover:bg-orange-50 text-sm mt-2"
									onClick={handlePrintBill}
									disabled={orderItems.length === 0}
								>
									<Printer size={16} className="mr-2" /> Print Bill
								</Button>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Recent Orders Section */}
				<div className="max-w-6xl mx-auto w-full mt-6 sm:mt-8 mb-4 px-3 sm:px-4 md:px-0">
					<Card className="bg-white/90 shadow-lg">
						<CardHeader className="p-3 sm:p-6">
							<CardTitle className="text-base sm:text-lg flex items-center gap-2">
								<ShoppingCart className="text-orange-500 flex-shrink-0" size={20} /> Recent Orders
							</CardTitle>
						</CardHeader>
						<CardContent className="p-3 sm:p-6">
							{loadingRecentOrders ? (
								<div className="text-center py-4 text-muted-foreground text-sm">Loading recent orders...</div>
							) : recentOrders.length === 0 ? (
								<div className="text-center py-4 text-muted-foreground text-sm">No recent orders</div>
							) : (
								<div className="overflow-x-auto -mx-3 sm:-mx-6 px-3 sm:px-6">
									<table className="w-full text-xs sm:text-sm">
										<thead>
											<tr className="border-b bg-orange-50">
												<th className="text-left py-2 px-2 sm:px-3 font-semibold">Order ID</th>
												<th className="text-left py-2 px-2 sm:px-3 font-semibold">Type</th>
												<th className="text-left py-2 px-2 sm:px-3 font-semibold hidden sm:table-cell">Items</th>
												<th className="text-right py-2 px-2 sm:px-3 font-semibold">Amount</th>
												<th className="text-center py-2 px-2 sm:px-3 font-semibold">Status</th>
											</tr>
										</thead>
										<tbody>
											{recentOrders.map((order) => (
												<tr key={order.id} className="border-b hover:bg-orange-50/50">
													<td className="py-2 px-2 sm:px-3 font-medium text-orange-600">ORD-{order.id}</td>
													<td className="py-2 px-2 sm:px-3">
														<Badge className={
															order.orderType === "dine-in" ? "bg-blue-100 text-blue-800 text-xs" :
															order.orderType === "take-away" ? "bg-orange-100 text-orange-800 text-xs" :
															"bg-purple-100 text-purple-800 text-xs"
														}>
															{order.orderType === "dine-in" ? "Dine-in" : order.orderType === "take-away" ? "Takeaway" : "Delivery"}
														</Badge>
													</td>
													<td className="py-2 px-2 sm:px-3 text-muted-foreground truncate max-w-xs hidden sm:table-cell text-xs">
														{Array.isArray(order.items) ? order.items.join(", ") : "N/A"}
													</td>
													<td className="py-2 px-2 sm:px-3 text-right font-semibold">₹{order.total}</td>
													<td className="py-2 px-2 sm:px-3 text-center">
														<Badge className={
															order.status === "pending" ? "bg-yellow-100 text-yellow-800 text-xs" :
															order.status === "preparing" ? "bg-blue-100 text-blue-800 text-xs" :
															order.status === "ready" ? "bg-green-100 text-green-800 text-xs" :
															order.status === "completed" ? "bg-green-600 text-white text-xs" :
															"bg-gray-100 text-gray-800 text-xs"
														}>
															{order.status}
														</Badge>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Footer */}
				<footer className="w-full text-center py-3 sm:py-4 text-muted-foreground text-xs bg-transparent mt-6 sm:mt-8 px-3">
					&copy; {new Date().getFullYear()} RestroHub POS &mdash; Powered by {getStoredRestaurantName() || "RestroHub"}
				</footer>
			</div>
		</DashboardLayout>
	);
};

export default Billing;
