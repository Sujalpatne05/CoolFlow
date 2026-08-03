


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

const ORDER_TYPES = ["dine-in", "take-away", "delivery"] as const;
const PAYMENT_METHODS = ["upi", "card", "cash"] as const;
type Table = { id: number; number: number; capacity: number; status: string; section?: string };
type MenuItem = { id: number; name: string; price: number; category: string; available: boolean; image_url?: string };

const MENU_CATEGORIES_DEFAULT = ["All"];
type OrderItem = { id: number; name: string; price: number; qty: number; notes?: string };




const Billing: React.FC = () => {
	const location = useLocation();
	const orderSummaryRef = React.useRef<HTMLDivElement>(null);
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
						setLoadingOrder(false);
						return;
					}
					setExistingOrder(data);
					// Only pre-fill items if order is still active (not served/completed)
					if (data.status === 'served' || data.status === 'completed') {
						setOrderItems([]);
						return;
					}
					// Parse items from existing order
					const parsedItems: OrderItem[] = data.items.map((itemStr: string | any) => {
						let itemName = '';
						let qty = 1;
						let notes = '';
						let savedPrice = 0;
						
						if (typeof itemStr === 'object' && itemStr !== null) {
							itemName = itemStr.name || '';
							qty = itemStr.qty || 1;
							notes = itemStr.note || itemStr.notes || '';
							savedPrice = Number(itemStr.price) || 0;
						} else {
							// Parse format like "Butter Chicken x1" or "Butter Chicken x1 (Extra spicy)"
							const noteMatch = itemStr.match(/\s*\((.+)\)\s*$/);
							if (noteMatch) {
								notes = noteMatch[1];
								itemStr = itemStr.replace(noteMatch[0], '');
							}
							
							const match = itemStr.match(/^(.+?)\s+x(\d+)$/);
							if (match) {
								itemName = match[1];
								qty = Number(match[2]);
							} else {
								itemName = itemStr;
							}
						}
						
						const menuItem = menu.find(m => m.name === itemName);
						if (menuItem) {
							return { id: menuItem.id, name: menuItem.name, price: menuItem.price, qty, notes };
						}
						return { id: Date.now() + Math.random(), name: itemName, price: savedPrice, qty, notes };
					}).filter(Boolean);
					setOrderItems(parsedItems);
				})
				.catch(() => {
					setExistingOrder(null);
					setOrderItems([]);
				})
				.finally(() => setLoadingOrder(false));
		} else {
			setExistingOrder(null);
			setOrderItems([]);
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
			return [...prev, { ...item, qty: 1, notes: "" }];
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
	const updateItemNote = (id: number, note: string) => {
		setOrderItems((prev) =>
			prev.map((i) => (i.id === id ? { ...i, notes: note } : i))
		);
	};
	const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0);
	const tax = Math.round(subtotal * (taxRate / 100));
	const svc = Math.round(subtotal * (serviceCharge / 100));
	const total = subtotal + tax + svc;
	const totalItems = orderItems.reduce((sum, item) => sum + item.qty, 0);
	const getItemQty = (id: number) => orderItems.find((item) => item.id === id)?.qty || 0;
	const getItemNote = (id: number) => orderItems.find((item) => item.id === id)?.notes || "";
	const quickNotes = ["Spicy", "Extra spicy", "Less spicy", "No onion", "No garlic"];
	const getNoteParts = (note: string) => note.split(",").map(part => part.trim()).filter(Boolean);
	const hasQuickNote = (itemId: number, note: string) => getNoteParts(getItemNote(itemId)).includes(note);
	const toggleQuickNote = (itemId: number, note: string) => {
		const current = getNoteParts(getItemNote(itemId));
		const next = current.includes(note)
			? current.filter(part => part !== note)
			: [...current, note];
		updateItemNote(itemId, next.join(", "));
	};

	const printOrderKOT = async (orderId: number | string = existingOrder?.id || "NEW") => {
		await apiRequest("/orders/print-kot", {
			method: "POST",
			body: JSON.stringify({
				id: orderId,
				orderType,
				table_number: orderType === "dine-in" ? selectedTable : null,
				items: orderItems.map(item => ({
					name: item.name,
					qty: item.qty,
					note: item.notes || "",
				})),
			}),
		});
	};

	const handlePrintKOT = async () => {
		if (orderItems.length === 0) {
			toast.error("No items to print in KOT");
			return;
		}

		try {
			await printOrderKOT();
			toast.success("KOT sent to kitchen printer");
		} catch (err: any) {
			toast.error(err?.message || "Failed to print KOT");
		}
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
				const updatedItems = orderItems.map(i => ({ name: i.name, qty: i.qty, price: i.price, note: i.notes || "" }));
				await apiRequest(`/orders/${existingOrder.id}`, {
					method: "PUT",
					body: JSON.stringify({
						items: updatedItems,
						total,
					}),
				});
				try {
					await printOrderKOT(existingOrder.id);
				} catch (printErr: any) {
					toast.error(printErr?.message || "Order updated but KOT print failed");
				}
				toast.success("Order updated successfully!");
			} else {
				// Create new order
				const payload = {
					userId,
					items: orderItems.map(i => ({ name: i.name, qty: i.qty, price: i.price, note: i.notes || "" })),
					total,
					orderType,
					paymentMethod: (orderType === "delivery" || orderType === "take-away") ? paymentMethod : null,
					table_number: orderType === "dine-in" ? selectedTable : null,
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
			<div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-primary/3 via-primary/5 to-secondary/3 flex flex-col justify-between">
				{/* Header */}
				<div className="py-4 px-3 sm:py-6 sm:px-4 md:px-0 max-w-6xl mx-auto w-full">
					<div className="flex flex-col gap-4 mb-6 animate-fade-in">
						<div>
							<h1 className="text-2xl sm:text-4xl font-bold text-foreground flex items-center gap-3 mb-2">
								<div className="h-10 w-10 rounded-xl gradient-brand-soft flex items-center justify-center">
									<ShoppingCart className="inline-block text-primary flex-shrink-0" size={24} />
								</div>
								POS Billing
							</h1>
							<div className="text-muted-foreground text-sm">Welcome to OrderNest! Please select items and complete the order below.</div>
						</div>
						<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
							<span className="glass-card border border-primary/20 text-primary px-4 py-2 rounded-xl font-semibold text-xs sm:text-sm truncate shadow-sm hover:shadow-soft transition-shadow">
								<span className="text-gray-600 font-normal">Restaurant:</span> {getStoredRestaurantName() || "Restaurant"}
							</span>
							<span className="bg-primary/10 border border-primary/30 text-primary px-3 py-2 rounded-xl font-medium text-xs sm:text-sm flex items-center gap-2 w-fit shadow-sm hover:shadow-soft transition-shadow">
								<Monitor className="inline-block flex-shrink-0" size={16} /> KDS Enabled
							</span>
						</div>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
						{/* Menu Section */}
						<Card className="lg:col-span-2 bg-white/90 shadow-lg">
							<CardHeader className="p-3 sm:p-6">
								<CardTitle className="text-lg sm:text-xl flex items-center gap-2">
									<UtensilsCrossed className="text-primary-600 flex-shrink-0" /> Menu
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
										<div className="border-t border-primary-100 mb-4"></div>
										<label className="block mb-2 text-sm sm:text-base font-semibold text-primary-700">Table</label>
										<div className="flex gap-2 items-center">
													<select
														className="border-2 border-primary-200 rounded-lg px-2 sm:px-3 py-2 bg-gradient-to-br from-white to-primary-50 focus:border-primary-400 focus:ring-2 focus:ring-primary-300 transition-all text-sm w-full shadow-sm"
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
									<div className="mx-0 mb-2 px-3 py-2.5 bg-gradient-to-r from-primary-100 to-secondary-100 border-2 border-primary-300 rounded-xl text-xs text-foreground font-semibold text-center font-semibold shadow-sm">
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
									<div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
										{menuCategories.map(category => (
											<Button
												key={category}
												type="button"
												size="sm"
												variant={menuCategory === category ? "default" : "outline"}
												onClick={() => setMenuCategory(category)}
												className={
													menuCategory === category
														? "h-8 shrink-0 bg-gradient-to-r from-primary-500 to-secondary-500 px-3 text-xs text-white hover:from-primary-600 hover:to-secondary-600 shadow-md"
														: "h-8 shrink-0 border-2 border-primary-200 px-3 text-xs text-primary-700 hover:bg-gradient-to-r hover:from-primary-50 hover:to-secondary-50 hover:text-gray-950"
												}
											>
												{category}
											</Button>
										))}
									</div>
								</div>
							</CardHeader>
							<CardContent className="p-3 sm:p-6">
								<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-4">
									{loadingMenu ? (
										<div className="col-span-full text-center text-muted-foreground py-8 text-sm">Loading menu...</div>
									) : filteredMenu.length === 0 ? (
										<div className="col-span-full text-center text-muted-foreground py-8 text-sm">No items found.</div>
									) : (
										filteredMenu.map(item => (
											<Card key={item.id} className="relative flex flex-col items-center overflow-hidden border-2 border-primary-200 bg-gradient-to-br from-white to-primary-50/30 p-4 shadow-md transition-all hover:-translate-y-1 hover:shadow-xl hover:border-primary-300 sm:min-h-[150px] sm:p-3">
												{getItemQty(item.id) > 0 && (
													<div className="absolute right-2 top-2 hidden rounded-full bg-gradient-to-r from-primary-500 to-primary-500 px-2 py-0.5 text-[11px] font-bold text-white sm:block shadow-lg">
														{getItemQty(item.id)} in cart
													</div>
												)}
												<div className="mb-2 text-2xl sm:text-3xl"><UtensilsCrossed className="text-primary-600" /></div>
												<span className="font-semibold text-xs sm:text-base mb-1 text-center line-clamp-2">{item.name}</span>
												<Badge className="mb-2 bg-primary text-white font-bold text-sm shadow-md">₹{item.price}</Badge>
												{getItemQty(item.id) > 0 ? (
													<div className="w-full space-y-2">
														<div className="grid h-9 w-full grid-cols-3 overflow-hidden rounded-md border border-primary-600 bg-primary-50">
															<Button size="sm" variant="ghost" onClick={(e) => removeItem(item.id, e)} className="h-9 rounded-none text-primary-700 hover:bg-primary-100">
																<Minus size={15} />
															</Button>
															<div className="flex items-center justify-center bg-white text-sm font-bold text-primary-700">
																{getItemQty(item.id)}
															</div>
															<Button size="sm" variant="ghost" onClick={(e) => addItem(item, e)} className="h-9 rounded-none text-primary-700 hover:bg-primary-100">
																<Plus size={15} />
															</Button>
														</div>
														<Input
															type="text"
															placeholder="Note: spicy, extra spicy..."
															value={getItemNote(item.id)}
															onChange={(e) => updateItemNote(item.id, e.target.value)}
															className="h-8 bg-primary-50 text-xs border-primary-200 focus:border-primary-500"
														/>
													</div>
												) : (
													<Button size="sm" onClick={() => addItem(item)} variant="outline" disabled={!item.available || (orderType === "dine-in" && !selectedTable)} className="h-9 w-full border-2 border-primary-400 text-xs font-bold text-primary-700 hover:bg-gradient-to-r hover:from-primary-500 hover:to-secondary-500 hover:text-white disabled:bg-primary-100 disabled:text-gray-900 transition-all shadow-sm">Add</Button>
												)}
												{!item.available && <span className="text-xs text-red-500 mt-1">Unavailable</span>}
											</Card>
										))
									)}
								</div>
							</CardContent>
						</Card>

						{/* Order Summary Section */}
						<Card ref={orderSummaryRef} className="bg-gradient-to-br from-primary-50 via-secondary-50 to-white shadow-2xl border-2 border-primary-300 lg:sticky lg:top-4 lg:self-start">
							<CardHeader className="p-4 sm:p-6 bg-gradient-to-r from-primary-500 via-primary-600 to-secondary-600 text-white rounded-t-lg shadow-lg">
								<CardTitle className="text-lg sm:text-2xl flex items-center gap-2 flex-wrap">
									<ShoppingCart className="flex-shrink-0" size={28} /> Order Summary
									{existingOrder && existingOrder.status !== 'served' && existingOrder.status !== 'completed' && <Badge className="bg-white text-primary-600 text-xs ml-auto font-bold shadow-md">Editing #{existingOrder.id}</Badge>}
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
											<div className="space-y-2 pr-2">
												{orderItems.map((item, idx) => (
													<div key={item.id} className="bg-gradient-to-br from-white to-primary-50 border-2 border-primary-300 rounded-xl p-3 hover:shadow-xl transition-all hover:border-primary-400">
														<div className="flex items-start justify-between gap-2">
															<div className="flex-1 min-w-0">
																<div className="flex items-center gap-2 mb-1">
																	<span className="inline-block bg-primary text-white text-sm font-bold font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-md">{idx + 1}</span>
																	<h4 className="font-semibold text-sm text-gray-800 truncate">{item.name}</h4>
																</div>
																<div className="flex items-center justify-between mb-2">
																	<div className="flex items-center gap-2">
																		<Button size="sm" variant="outline" onClick={(e) => removeItem(item.id, e)} className="h-7 w-7 p-0 text-primary-700 border-2 border-primary-400 hover:bg-gradient-to-r hover:from-primary-500 hover:to-secondary-500 hover:text-white transition-all">
																			<Minus size={16} />
																		</Button>
																		<span className="font-bold text-primary-600 min-w-6 text-center">{item.qty}</span>
																		<Button size="sm" variant="outline" onClick={(e) => addItem(item, e)} className="h-7 w-7 p-0 text-primary-700 border-2 border-primary-400 hover:bg-gradient-to-r hover:from-primary-500 hover:to-secondary-500 hover:text-white transition-all">
																			<Plus size={16} />
																		</Button>
																	</div>
																	<span className="font-bold text-primary-700 text-sm">₹{item.price * item.qty}</span>
																</div>
																<Input
																	type="text"
																	placeholder="Add note (optional)"
																	value={item.notes || ""}
																	onChange={(e) => updateItemNote(item.id, e.target.value)}
																	className="text-xs h-7 bg-primary-50 border-primary-300 focus:border-primary-500 shadow-sm"
																/>
																<div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
																	{quickNotes.map(note => (
																		<Button
																			key={note}
																			type="button"
																			size="sm"
																			variant={hasQuickNote(item.id, note) ? "default" : "outline"}
																			onClick={() => toggleQuickNote(item.id, note)}
																			className={
																				hasQuickNote(item.id, note)
																					? "h-7 shrink-0 bg-gradient-to-r from-primary-500 to-secondary-500 px-2 text-[11px] text-white hover:from-primary-600 hover:to-secondary-600 shadow-md"
																					: "h-7 shrink-0 border-2 border-primary-300 px-2 text-[11px] text-primary-700 hover:bg-gradient-to-r hover:from-primary-50 hover:to-secondary-50"
																			}
																		>
																			{note}
																		</Button>
																	))}
																</div>
															</div>
														</div>
													</div>
												))}
											</div>
										</div>

										{/* Divider */}
										<div className="border-t-2 border-primary-300 my-4"></div>

										{/* Price Breakdown */}
										<div className="bg-gradient-to-br from-primary-100 via-secondary-100 to-primary-100 rounded-xl p-4 mb-4 space-y-3 border-2 border-primary-300 shadow-inner">
											{/* Subtotal */}
											<div className="flex justify-between items-center">
												<span className="text-gray-700 font-medium">Subtotal</span>
												<span className="font-semibold text-gray-800">₹{subtotal}</span>
											</div>
											
											{/* Tax - Highlighted */}
											{tax > 0 && (
												<div className="bg-white rounded-lg p-3 border-2 border-primary-400 shadow-md">
													<div className="flex justify-between items-center">
														<div>
															<span className="text-primary-700 font-bold">Tax Applied</span>
															<p className="text-xs text-primary-600 mt-0.5">({taxRate}% of subtotal)</p>
														</div>
														<span className="font-bold text-lg text-primary-600">₹{tax}</span>
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
											<div className="border-t-2 border-primary-400 pt-3 flex justify-between items-center bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-lg p-3 mt-3 shadow-lg">
												<span className="font-bold text-white text-lg">Total Amount</span>
												<span className="font-bold text-2xl text-white">₹{total}</span>
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
								<Button className="w-full bg-gradient-to-r from-primary-500 to-secondary-500 hover:from-primary-600 hover:to-secondary-600 text-sm disabled:bg-primary-100 disabled:text-gray-900 text-white font-bold shadow-lg" onClick={handlePlaceOrder} disabled={orderItems.length === 0}>
									{existingOrder && existingOrder.status !== 'served' && existingOrder.status !== 'completed' ? "Update Order" : "Place Order"}
								</Button>
								<Button 
									variant="outline" 
									className="w-full border-2 border-primary-400 bg-white text-primary-700 hover:bg-gradient-to-r hover:from-primary-50 hover:to-secondary-50 hover:text-gray-950 text-sm mt-2 font-semibold shadow-md"
									onClick={handlePrintKOT}
									aria-disabled={orderItems.length === 0}
								>
									<Printer size={16} className="mr-2" /> Print KOT
								</Button>
							</CardContent>
						</Card>
					</div>

					{orderItems.length > 0 && (
						<div className="fixed inset-x-3 bottom-3 z-40 rounded-lg border border-primary-700 bg-primary-700 p-3 text-white shadow-2xl lg:hidden">
							<div className="flex items-center justify-between gap-3">
								<div className="min-w-0">
									<div className="flex items-center gap-2 text-sm font-bold">
										<ShoppingCart size={18} />
										<span>{totalItems} item{totalItems === 1 ? "" : "s"}</span>
									</div>
									<div className="text-xs text-primary-50">Total: {"\u20b9"}{total}</div>
								</div>
								<Button
									type="button"
									size="sm"
									className="h-9 shrink-0 bg-white px-4 text-xs font-bold text-primary-700 hover:bg-primary-50"
									onClick={() => orderSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
								>
									View cart
								</Button>
							</div>
						</div>
					)}
				</div>

				{/* Recent Orders Section */}
				<div className="max-w-6xl mx-auto w-full mt-6 sm:mt-8 mb-4 px-3 sm:px-4 md:px-0">
					<Card className="bg-white/90 shadow-lg">
						<CardHeader className="p-3 sm:p-6">
							<CardTitle className="text-base sm:text-lg flex items-center gap-2">
								<ShoppingCart className="text-primary-600 flex-shrink-0" size={20} /> Recent Orders
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
											<tr className="border-b bg-gradient-to-r from-primary-100 to-secondary-100 text-foreground font-semibold">
												<th className="text-left py-2 px-2 sm:px-3 font-semibold">Order ID</th>
												<th className="text-left py-2 px-2 sm:px-3 font-semibold">Type</th>
												<th className="text-left py-2 px-2 sm:px-3 font-semibold hidden sm:table-cell">Items</th>
												<th className="text-right py-2 px-2 sm:px-3 font-semibold">Amount</th>
												<th className="text-center py-2 px-2 sm:px-3 font-semibold">Status</th>
											</tr>
										</thead>
										<tbody>
											{recentOrders.map((order) => (
												<tr key={order.id} className="border-b hover:bg-gradient-to-r hover:from-primary-50 hover:to-secondary-50 transition-colors">
													<td className="py-2 px-2 sm:px-3 font-medium text-primary-700">ORD-{order.id}</td>
													<td className="py-2 px-2 sm:px-3">
														<Badge className={
															order.orderType === "dine-in" ? "bg-blue-100 text-blue-800 text-xs" :
															order.orderType === "take-away" ? "bg-secondary-100 text-secondary-800 text-xs" :
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
															order.status === "ready" ? "bg-primary-100 text-primary-800 text-xs" :
															order.status === "completed" ? "bg-primary-600 text-white text-xs" :
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
					&copy; {new Date().getFullYear()} OrderNest POS &mdash; Powered by {getStoredRestaurantName() || "OrderNest"}
				</footer>
			</div>
		</DashboardLayout>
	);
};

export default Billing;
