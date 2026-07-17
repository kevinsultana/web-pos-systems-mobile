import { supabase } from "@/lib/supabase";
import { useCartStore } from "@/stores/useCartStore";
import type { Customer, StoreSetting, Voucher } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Share,
  Platform,
} from "react-native";
import Toast from "react-native-toast-message";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

function formatPrice(price: number): string {
  return `Rp${price.toLocaleString("id-ID")}`;
}

function generateTextReceipt(
  order: any,
  storeName: string,
  storeCity: string,
  includeHeader: boolean = true
): string {
  const width = 44;
  const line = "-".repeat(width);

  // Format Date (Indonesian locale)
  const weekdays = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  
  // Custom manual calculation since month names vary across environments
  const d = new Date(order.createdAt);
  const weekdayName = weekdays[d.getDay()];
  const dateNum = d.getDate();
  const monthName = months[d.getMonth()];
  const yearNum = d.getFullYear();
  
  const dateStr = `${weekdayName}, ${dateNum} ${monthName} ${yearNum}`;
  const timeStr = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(":", ".");

  // Helper formatting functions
  const formatCenter = (text: string) => {
    if (text.length >= width) return text;
    const padding = Math.floor((width - text.length) / 2);
    return " ".repeat(padding) + text;
  };

  const formatRow = (left: string, right: string) => {
    const spaces = width - left.length - right.length;
    if (spaces <= 0) return left + " " + right;
    return left + " ".repeat(spaces) + right;
  };

  const formatThreeColRow = (col1: string, col2: string, col3: string) => {
    const c1Max = 18;
    let c1 = col1;
    if (c1.length > c1Max) {
      c1 = c1.slice(0, c1Max - 3) + "...";
    }
    const col1Part = c1.padEnd(20);
    const col2Part = col2.padStart(3).padEnd(6);
    const col3Part = col3.padStart(14);
    return col1Part + col2Part + col3Part;
  };

  let text = "";
  
  if (includeHeader) {
    text += formatCenter(storeName.toUpperCase()) + "\n";
    text += formatCenter(storeCity) + "\n\n";
  }
  
  // Details Section 1
  text += line + "\n";
  text += formatRow(`No: #${order.orderId.slice(0, 8).toUpperCase()}`, dateStr) + "\n";
  text += formatRow(`Kasir: POS`, timeStr) + "\n";
  text += line + "\n";
  
  // Items Header
  text += formatThreeColRow("Item", "Qty", "Harga") + "\n";
  text += line + "\n";
  
  // Items Rows
  order.items.forEach((i: any) => {
    const name = i.product.name;
    const variant = i.variant ? ` (${i.variant.size} / ${i.variant.color})` : "";
    const priceStr = formatPrice(i.variant?.sell_price ?? i.product.sell_price ?? 0);
    text += formatThreeColRow(`${name}${variant}`, i.quantity.toString(), priceStr) + "\n";
  });
  
  text += line + "\n";
  
  // Totals Section
  text += formatRow("TOTAL", formatPrice(order.total)) + "\n";
  
  if (order.discount > 0) {
    text += formatRow("Diskon", `-${formatPrice(order.discount)}`) + "\n";
  }
  
  if (order.paymentMethod === "cash") {
    text += formatRow("Tunai", formatPrice(order.cashAmount)) + "\n";
    text += formatRow("Kembali", formatPrice(order.changeAmount)) + "\n";
  }
  
  text += line + "\n";
  
  // Payment Method Row
  text += `[Metode: ${order.paymentMethod.toUpperCase()}]\n`;
  text += line + "\n\n";
  
  // Footer
  text += formatCenter("Terima Kasih! 🙏") + "\n";
  text += formatCenter("Barang yang sudah dibeli tidak dapat dikembalikan") + "\n";
  text += line + "\n";
  
  return text;
}

// ─── Quick cash amounts — round up to nearest 5k, 10k, 50k, 100k ───
function getQuickAmounts(total: number): number[] {
  const pas = total;
  // Always include "Uang Pas" (0 = marker for exact amount)
  const amounts: number[] = [0];

  // Round up to nearest 5.000
  const toNearest = (n: number, roundTo: number) =>
    Math.ceil(n / roundTo) * roundTo;

  const candidates = new Set<number>();
  candidates.add(toNearest(total, 5000));
  candidates.add(toNearest(total, 10000));
  candidates.add(toNearest(total, 50000));
  candidates.add(toNearest(total, 100000));
  candidates.add(toNearest(total, 50000) + 50000);
  candidates.add(toNearest(total, 100000) + 100000);

  candidates.forEach((v) => {
    if (v > total) amounts.push(v);
  });

  // Sort ascending, deduplicate via Set conversion
  return [...new Set(amounts)].sort((a, b) => a - b);
}

type PaymentMethod = "cash" | "transfer" | "qris";

export default function CashierCartScreen() {
  const items = useCartStore((s) => s.items);
  const customer = useCartStore((s) => s.customer);
  const voucher = useCartStore((s) => s.voucher);
  const discount = useCartStore((s) => s.discount);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const setVoucher = useCartStore((s) => s.setVoucher);
  const setCustomer = useCartStore((s) => s.setCustomer);

  const subtotal = useCartStore((s) => s.subtotal());
  const total = subtotal - discount;

  // ── Customer modal state ──
  const [showCustomer, setShowCustomer] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // ── Voucher modal state ──
  const [showVoucher, setShowVoucher] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [validatingVoucher, setValidatingVoucher] = useState(false);

  // ── Register customer modal state ──
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [registering, setRegistering] = useState(false);

  // ── Checkout modal state ──
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [changeAmount, setChangeAmount] = useState(0);
  const cashInputRef = useRef<TextInput>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSetting | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const storeFetched = useRef(false);

  // ── Receipt modal state ──
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  const receiptRef = useRef<View>(null);

  // ─── Fetch store settings once for checkout ───
  const fetchStoreSettings = useCallback(async () => {
    if (storeFetched.current) return;
    storeFetched.current = true;
    try {
      const { data } = await supabase
        .from("store_settings")
        .select("*")
        .limit(1)
        .single();
      if (data) setStoreSettings(data as unknown as StoreSetting);
    } catch {
      /* silent */
    }
  }, []);

  // ── Receipt actions ──
  const handleCloseReceipt = () => {
    setShowReceipt(false);
    setCompletedOrder(null);
    setShowCheckout(false);
    clearCart();
  };

  const handlePrintReceipt = async () => {
    if (!receiptRef.current) return;
    try {
      const uri = await captureRef(receiptRef, {
        format: "png",
        quality: 1.0,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          UTI: "public.png",
        });
      } else {
        await Share.share({ url: uri });
      }
    } catch (err: any) {
      Alert.alert("Gagal memproses cetak struk", err.message);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!receiptRef.current) return;
    try {
      const uri = await captureRef(receiptRef, {
        format: "png",
        quality: 1.0,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          UTI: "public.png",
        });
      } else {
        await Share.share({ url: uri });
      }
    } catch (err: any) {
      Alert.alert("Gagal memproses kirim WhatsApp", err.message);
    }
  };

  // ── Fetch customers ──
  const fetchCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, name, phone")
        .eq("role", "USER")
        .order("name");
      if (!error) setCustomers((data as Customer[]) ?? []);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  useEffect(() => {
    if (showCustomer) fetchCustomers();
  }, [showCustomer]);

  const filteredCustomers = customers.filter(
    (c) =>
      c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(customerSearch.toLowerCase()),
  );

  // ── Voucher validation ──
  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return;
    setValidatingVoucher(true);
    try {
      const { data, error } = await supabase
        .from("vouchers")
        .select("*")
        .eq("code", voucherCode.trim().toUpperCase())
        .single();

      if (error || !data) {
        Toast.show({
          type: "error",
          text1: "Voucher tidak ditemukan",
          position: "top",
        });
        return;
      }

      const v = data as unknown as Voucher;
      // ponytail: normalise camelCase fields from Prisma
      if (typeof v.minSpend === "number") v.min_spend = v.minSpend;
      if (typeof v.expiredAt === "string" && !v.expired_at)
        v.expired_at = v.expiredAt;

      const now = new Date();
      const expired = new Date(v.expired_at);

      if (expired < now) {
        Toast.show({
          type: "error",
          text1: "Voucher sudah kedaluwarsa",
          position: "top",
        });
        return;
      }
      if (v.quota <= 0) {
        Toast.show({
          type: "error",
          text1: "Kuota voucher habis",
          position: "top",
        });
        return;
      }
      if (v.target === "ONLINE") {
        Toast.show({
          type: "error",
          text1: "Voucher khusus online",
          position: "top",
        });
        return;
      }
      if (subtotal < v.min_spend) {
        Toast.show({
          type: "error",
          text1: `Min. belanja ${formatPrice(v.min_spend)}`,
          position: "top",
        });
        return;
      }

      setVoucher(v);
      setShowVoucher(false);
      setVoucherCode("");
      Toast.show({
        type: "success",
        text1: `Voucher ${v.code} diterapkan`,
        position: "top",
      });
    } finally {
      setValidatingVoucher(false);
    }
  };

  // ── Register new customer ──
  const handleRegisterCustomer = async () => {
    if (!regName || !regEmail) {
      Toast.show({
        type: "error",
        text1: "Nama dan Email wajib diisi",
        position: "top",
      });
      return;
    }
    setRegistering(true);
    try {
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("email", regEmail)
        .maybeSingle();
      if (existing) {
        Toast.show({
          type: "error",
          text1: "Email sudah terdaftar",
          position: "top",
        });
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .insert({
          name: regName,
          email: regEmail,
          phone: regPhone || null,
          role: "USER",
        })
        .select("id, email, name, phone")
        .single();
      if (error) throw error;

      setCustomer(data as Customer);
      setShowRegister(false);
      setRegName("");
      setRegEmail("");
      setRegPhone("");
      Toast.show({
        type: "success",
        text1: `Pelanggan ${data.name ?? data.email} ditambahkan`,
        position: "top",
      });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: err.message ?? "Gagal mendaftarkan pelanggan",
        position: "top",
      });
    } finally {
      setRegistering(false);
    }
  };

  // ── Checkout handlers ──
  const openCheckout = () => {
    fetchStoreSettings();
    setPaymentMethod("cash");
    setCashAmount("");
    setChangeAmount(0);
    setShowCheckout(true);
  };

  const handleCashChange = (text: string) => {
    const numeric = text.replace(/[^0-9]/g, "");
    setCashAmount(numeric);
    const paid = parseInt(numeric, 10) || 0;
    setChangeAmount(paid >= total ? paid - total : 0);
  };

  const applyQuickAmount = (amount: number) => {
    setCashAmount(String(amount));
    setChangeAmount(amount >= total ? amount - total : 0);
  };

  const handleCompletePayment = async () => {
    if (paymentMethod === "cash") {
      const paid = parseInt(cashAmount, 10) || 0;
      if (paid < total) {
        Toast.show({
          type: "error",
          text1: "Uang tidak mencukupi",
          position: "top",
        });
        return;
      }
    }

    setProcessingPayment(true);
    try {
      // Generate UUID client-side since Prisma doesn't set @default at DB level
      function genId() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
      }

      const orderId = genId();

      // 1. Insert order
      const orderPayload: Record<string, any> = {
        id: orderId,
        customerId: customer?.id ?? null,
        totalPrice: total,
        shippingCost: 0,
        status: "COMPLETED",
        orderType: "OFFLINE",
        notes: JSON.stringify({
          paymentMethod,
          cashAmount: paymentMethod === "cash" ? (parseInt(cashAmount, 10) || 0) : null,
        }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { error: orderError } = await supabase
        .from("orders")
        .insert(orderPayload);

      if (orderError) throw orderError;

      // 2. Insert order items
      const orderItems = items.map((i) => ({
        id: genId(),
        orderId,
        productId: i.product.id,
        variantId: i.variant?.id ?? null,
        productName: i.product.name,
        variantLabel: i.variant
          ? `${i.variant.size} / ${i.variant.color}`
          : null,
        price: i.variant?.sell_price ?? i.product.sell_price ?? 0,
        quantity: i.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // 3. Create stock cards for each item (OUT)
      const stockCards = items.flatMap((i) => {
        if (!i.variant) return [];
        return {
          id: genId(),
          variantId: i.variant.id,
          type: "OUT",
          quantity: i.quantity,
          reference_type: "POS",
          referenceId: orderId,
        };
      });

      if (stockCards.length > 0) {
        await supabase.from("stock_cards").insert(stockCards);
      }

      Toast.show({
        type: "success",
        text1: "Pembayaran Berhasil",
        text2:
          changeAmount > 0
            ? `Kembalian: ${formatPrice(changeAmount)}`
            : `Total: ${formatPrice(total)}`,
        visibilityTime: 3000,
        position: "top",
      });

      setCompletedOrder({
        orderId,
        customer,
        items: [...items],
        total,
        discount,
        paymentMethod,
        cashAmount: paymentMethod === "cash" ? (parseInt(cashAmount, 10) || 0) : null,
        changeAmount,
        createdAt: new Date().toISOString(),
      });
      setShowReceipt(true);
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: err.message ?? "Gagal memproses pembayaran",
        position: "top",
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  // ── Render item ──
  const renderItem = ({ item }: { item: (typeof items)[0] }) => {
    const masterImg =
      item.product.product_images?.find((i) => i.is_master)?.url ??
      item.product.product_images?.[0]?.url;
    const price = item.variant?.sell_price ?? item.product.sell_price ?? 0;
    const label = item.variant
      ? `${item.variant.size} / ${item.variant.color}`
      : null;

    return (
      <View style={styles.itemCard}>
        {masterImg ? (
          <Image
            source={{ uri: masterImg }}
            style={styles.itemImage}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
            <Ionicons name="image-outline" size={24} color="#ccc" />
          </View>
        )}
        <View style={styles.itemBody}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.product.name}
          </Text>
          {label && <Text style={styles.itemVariant}>{label}</Text>}
          <Text style={styles.itemPrice}>{formatPrice(price)}</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => updateQuantity(item.id, item.quantity - 1)}
            >
              <Ionicons name="remove" size={16} color="#333" />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => updateQuantity(item.id, item.quantity + 1)}
            >
              <Ionicons name="add" size={16} color="#333" />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => removeItem(item.id)}
        >
          <Ionicons name="trash-outline" size={18} color="#dc2626" />
        </TouchableOpacity>
      </View>
    );
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={64} color="#ccc" />
        <Text style={styles.emptyTitle}>Keranjang Kosong</Text>
        <Text style={styles.emptyDesc}>Tambah produk dari menu POS</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Customer & voucher header ── */}
      <View style={styles.metaBar}>
        <TouchableOpacity
          style={styles.metaItem}
          onPress={() => setShowCustomer(true)}
        >
          <Ionicons name="person-outline" size={18} color="#0a7ea4" />
          <Text style={styles.metaText} numberOfLines={1}>
            {customer ? (customer.name ?? customer.email) : "Pilih Pelanggan"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.metaItem}
          onPress={() => setShowVoucher(true)}
        >
          <Ionicons name="pricetag-outline" size={18} color="#0a7ea4" />
          <Text style={styles.metaText} numberOfLines={1}>
            {voucher ? voucher.code : "Voucher"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>
      </View>

      {/* ── Item list ── */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* ── Bottom bar ── */}
      <View style={styles.bottomBar}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatPrice(subtotal)}</Text>
        </View>
        {discount > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.discountLabel}>Diskon ({voucher?.code})</Text>
            <Text style={styles.discountValue}>-{formatPrice(discount)}</Text>
          </View>
        )}
        <View style={[styles.totalRow, styles.totalFinal]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalPrice}>{formatPrice(total)}</Text>
        </View>

        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => {
              Alert.alert(
                "Kosongkan Keranjang",
                "Yakin ingin menghapus semua item?",
                [
                  { text: "Batal", style: "cancel" },
                  {
                    text: "Ya, Kosongkan",
                    style: "destructive",
                    onPress: clearCart,
                  },
                ],
              );
            }}
          >
            <Text style={styles.clearBtnText}>Kosongkan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.checkoutBtn} onPress={openCheckout}>
            <Ionicons name="wallet-outline" size={18} color="#fff" />
            <Text style={styles.checkoutBtnText}>
              Bayar Rp{total.toLocaleString("id-ID")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Customer picker modal ── */}
      <Modal
        visible={showCustomer}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCustomer(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCustomer(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pilih Pelanggan</Text>
            <TouchableOpacity onPress={() => setShowCustomer(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari nama atau email..."
              placeholderTextColor="#999"
              value={customerSearch}
              onChangeText={setCustomerSearch}
            />
          </View>
          <TouchableOpacity
            style={styles.registerCustomerBtn}
            onPress={() => {
              setShowCustomer(false);
              setShowRegister(true);
            }}
          >
            <Ionicons name="person-add-outline" size={18} color="#0a7ea4" />
            <Text style={styles.registerCustomerText}>
              Daftarkan Pelanggan Baru
            </Text>
          </TouchableOpacity>
          {loadingCustomers ? (
            <ActivityIndicator
              size="large"
              color="#0a7ea4"
              style={{ marginTop: 20 }}
            />
          ) : (
            <ScrollView style={styles.customerList}>
              <TouchableOpacity
                style={styles.customerItem}
                onPress={() => {
                  setCustomer(null);
                  setShowCustomer(false);
                }}
              >
                <Ionicons name="close-circle-outline" size={20} color="#999" />
                <Text style={styles.customerItemText}>Tanpa Pelanggan</Text>
              </TouchableOpacity>
              {filteredCustomers.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.customerItem}
                  onPress={() => {
                    setCustomer(c);
                    setShowCustomer(false);
                  }}
                >
                  <Ionicons
                    name={
                      customer?.id === c.id
                        ? "radio-button-on"
                        : "radio-button-off"
                    }
                    size={20}
                    color={customer?.id === c.id ? "#0a7ea4" : "#999"}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerItemText}>
                      {c.name ?? "Tanpa Nama"}
                    </Text>
                    <Text style={styles.customerItemEmail}>{c.email}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── Voucher modal ── */}
      <Modal
        visible={showVoucher}
        animationType="fade"
        transparent
        onRequestClose={() => setShowVoucher(false)}
      >
        <View style={styles.centeredModalContainer}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setShowVoucher(false)}
          />
          <View style={styles.centeredModalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Voucher</Text>
              <TouchableOpacity onPress={() => setShowVoucher(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {voucher && (
              <View style={styles.activeVoucher}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeVoucherCode}>{voucher.code}</Text>
                  <Text style={styles.activeVoucherDesc}>
                    Diskon{" "}
                    {voucher.type === "PERCENTAGE"
                      ? `${voucher.value}%`
                      : formatPrice(voucher.value)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setVoucher(null)}>
                  <Ionicons name="close-circle" size={22} color="#dc2626" />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.voucherInputRow}>
              <TextInput
                style={styles.voucherInput}
                placeholder="Masukkan kode voucher"
                placeholderTextColor="#999"
                value={voucherCode}
                onChangeText={setVoucherCode}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.voucherApplyBtn}
                onPress={handleApplyVoucher}
                disabled={validatingVoucher}
              >
                {validatingVoucher ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.voucherApplyText}>Pakai</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Register customer modal ── */}
      <Modal
        visible={showRegister}
        animationType="slide"
        transparent
        onRequestClose={() => setShowRegister(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowRegister(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Daftarkan Pelanggan</Text>
            <TouchableOpacity onPress={() => setShowRegister(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Nama Lengkap *"
            placeholderTextColor="#999"
            value={regName}
            onChangeText={setRegName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email *"
            placeholderTextColor="#999"
            value={regEmail}
            onChangeText={setRegEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="No. Telepon (opsional)"
            placeholderTextColor="#999"
            value={regPhone}
            onChangeText={setRegPhone}
            keyboardType="phone-pad"
          />
          <TouchableOpacity
            style={styles.registerBtn}
            onPress={handleRegisterCustomer}
            disabled={registering}
          >
            {registering ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.registerBtnText}>Daftarkan</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════ */}
      {/* ── CHECKOUT MODAL ── */}
      {/* ════════════════════════════════════════════════ */}
      <Modal
        visible={showCheckout}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCheckout(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCheckout(false)}
        />
        <View style={styles.checkoutSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pembayaran</Text>
            <TouchableOpacity onPress={() => setShowCheckout(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Payment method selector */}
          <View style={styles.paymentMethodRow}>
            <TouchableOpacity
              style={[
                styles.paymentMethodTab,
                paymentMethod === "cash" && styles.paymentMethodTabActive,
              ]}
              onPress={() => setPaymentMethod("cash")}
            >
              <Ionicons
                name="cash-outline"
                size={20}
                color={paymentMethod === "cash" ? "#fff" : "#555"}
              />
              <Text
                style={[
                  styles.paymentMethodTabText,
                  paymentMethod === "cash" && styles.paymentMethodTabTextActive,
                ]}
              >
                Tunai
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.paymentMethodTab,
                paymentMethod === "transfer" && styles.paymentMethodTabActive,
              ]}
              onPress={() => setPaymentMethod("transfer")}
            >
              <Ionicons
                name="phone-portrait-outline"
                size={20}
                color={paymentMethod === "transfer" ? "#fff" : "#555"}
              />
              <Text
                style={[
                  styles.paymentMethodTabText,
                  paymentMethod === "transfer" &&
                  styles.paymentMethodTabTextActive,
                ]}
              >
                Transfer
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.paymentMethodTab,
                paymentMethod === "qris" && styles.paymentMethodTabActive,
              ]}
              onPress={() => setPaymentMethod("qris")}
            >
              <Ionicons
                name="qr-code-outline"
                size={20}
                color={paymentMethod === "qris" ? "#fff" : "#555"}
              />
              <Text
                style={[
                  styles.paymentMethodTabText,
                  paymentMethod === "qris" && styles.paymentMethodTabTextActive,
                ]}
              >
                QRIS
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.checkoutBody}
            showsVerticalScrollIndicator={false}
          >
            {/* Total */}
            <View style={styles.checkoutTotalCard}>
              <Text style={styles.checkoutTotalLabel}>Total Pembayaran</Text>
              <Text style={styles.checkoutTotalAmount}>
                {formatPrice(total)}
              </Text>
            </View>

            {/* ── CASH ── */}
            {paymentMethod === "cash" && (
              <>
                <Text style={styles.sectionLabel}>Uang Diterima</Text>
                <TextInput
                  ref={cashInputRef}
                  style={styles.cashInput}
                  placeholder="0"
                  placeholderTextColor="#ccc"
                  value={
                    cashAmount ? formatPrice(parseInt(cashAmount, 10)) : ""
                  }
                  onChangeText={handleCashChange}
                  keyboardType="number-pad"
                />

                {/* Quick amount buttons — dinamis berdasarkan total */}
                <View style={styles.quickRow}>
                  {getQuickAmounts(total).map((amount) => {
                    if (amount === 0) {
                      return (
                        <TouchableOpacity
                          key="pas"
                          style={styles.quickBtn}
                          onPress={() => applyQuickAmount(0)}
                        >
                          <Text style={styles.quickBtnText}>Uang Pas</Text>
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        key={amount}
                        style={styles.quickBtn}
                        onPress={() => applyQuickAmount(amount)}
                      >
                        <Text style={styles.quickBtnText}>
                          {formatPrice(amount)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Change display */}
                {changeAmount > 0 && (
                  <View style={styles.changeCard}>
                    <Text style={styles.changeLabel}>Kembalian</Text>
                    <Text style={styles.changeAmount}>
                      {formatPrice(changeAmount)}
                    </Text>
                  </View>
                )}
                {parseInt(cashAmount || "0", 10) < total &&
                  cashAmount !== "" && (
                    <Text style={styles.shortfallText}>
                      Uang belum mencukupi
                    </Text>
                  )}

                <TouchableOpacity
                  style={[
                    styles.payButton,
                    parseInt(cashAmount || "0", 10) < total &&
                    styles.payButtonDisabled,
                  ]}
                  disabled={
                    parseInt(cashAmount || "0", 10) < total || processingPayment
                  }
                  onPress={handleCompletePayment}
                >
                  {processingPayment ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.payButtonText}>
                      Bayar {formatPrice(total)}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* ── TRANSFER ── */}
            {paymentMethod === "transfer" && (
              <View style={styles.transferContainer}>
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color="#0a7ea4"
                />
                <Text style={styles.transferInfo}>
                  Silakan transfer sejumlah {formatPrice(total)} ke rekening
                  toko.
                </Text>
                <View style={styles.transferNote}>
                  <Text style={styles.transferNoteTitle}>Nomor Rekening:</Text>
                  <Text style={styles.transferNoteValue}>
                    {storeSettings?.whatsapp_number ??
                      "(Belum diatur — atur di Admin Dashboard)"}
                  </Text>
                  <Text style={styles.transferNoteHint}>
                    Kasir konfirmasi setelah pembeli melakukan transfer.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.payButton}
                  onPress={handleCompletePayment}
                  disabled={processingPayment}
                >
                  {processingPayment ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.payButtonText}>
                      Konfirmasi Pembayaran
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ── QRIS ── */}
            {paymentMethod === "qris" && (
              <View style={styles.qrisContainer}>
                {storeSettings?.qrisUrl ? (
                  <>
                    <View style={styles.qrisImageWrap}>
                      <Image
                        source={{ uri: storeSettings.qrisUrl }}
                        style={styles.qrisImage}
                        contentFit="contain"
                      />
                    </View>
                    <Text style={styles.qrisTotal}>
                      Total: {formatPrice(total)}
                    </Text>
                    <Text style={styles.qrisHint}>
                      Scan QRIS di atas untuk melakukan pembayaran
                    </Text>
                  </>
                ) : (
                  <View style={styles.qrisEmpty}>
                    <Ionicons name="qr-code-outline" size={64} color="#ccc" />
                    <Text style={styles.qrisEmptyText}>QRIS belum diatur</Text>
                    <Text style={styles.qrisEmptyHint}>
                      Atur QRIS di Admin Dashboard terlebih dahulu.
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.payButton}
                  onPress={handleCompletePayment}
                  disabled={processingPayment}
                >
                  {processingPayment ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.payButtonText}>
                      Konfirmasi Pembayaran
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Receipt modal ── */}
      <Modal
        visible={showReceipt}
        animationType="fade"
        transparent
        onRequestClose={handleCloseReceipt}
      >
        <View style={styles.centeredModalContainer}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={handleCloseReceipt}
          />
          <View style={styles.receiptModalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Struk Transaksi</Text>
              <TouchableOpacity onPress={handleCloseReceipt}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {completedOrder && (
              <>
                <ScrollView style={styles.receiptScroll} contentContainerStyle={styles.receiptPaper}>
                  <View ref={receiptRef} collapsable={false} style={styles.receiptPaperCaptured}>
                    <View style={styles.receiptGraphicHeader}>
                      {storeSettings?.logoUrl ? (
                        <Image
                          source={{ uri: storeSettings.logoUrl }}
                          style={styles.receiptLogoImage}
                        />
                      ) : (
                        <View style={styles.receiptLogoCircle}>
                          <Ionicons name="flash" size={22} color="#000" />
                        </View>
                      )}
                      <Text style={styles.receiptStoreName}>
                        {storeSettings?.storeName ?? "SCHAW"}
                      </Text>
                      <Text style={styles.receiptStoreCity}>
                        {storeSettings?.originCityName?.trim() ?? "Bandung"}
                      </Text>
                    </View>
                    <Text style={styles.receiptText}>
                      {generateTextReceipt(
                        completedOrder,
                        storeSettings?.storeName ?? "SCHAW",
                        storeSettings?.originCityName?.trim() ?? "Bandung",
                        false
                      )}
                    </Text>
                  </View>
                </ScrollView>

                <View style={styles.receiptActionsRow}>
                  <TouchableOpacity style={styles.receiptPrintBtn} onPress={handlePrintReceipt}>
                    <Ionicons name="print-outline" size={20} color="#fff" />
                    <Text style={styles.receiptBtnText}>Cetak Struk</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.receiptWaBtn} onPress={handleSendWhatsApp}>
                    <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                    <Text style={styles.receiptBtnText}>Kirim WA</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.receiptCloseBtn} onPress={handleCloseReceipt}>
                  <Text style={styles.receiptCloseBtnText}>Tutup & Mulai Baru</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  list: { padding: 16, paddingBottom: 240 },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 24,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#111", marginTop: 12 },
  emptyDesc: { fontSize: 14, color: "#999", marginTop: 4 },

  // Meta bar
  metaBar: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
    gap: 10,
  },
  metaText: { flex: 1, fontSize: 14, color: "#333" },

  // Item card
  itemCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  itemImage: { width: 64, height: 64, borderRadius: 8 },
  itemImagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
  },
  itemBody: { flex: 1, marginLeft: 12 },
  itemName: { fontSize: 14, fontWeight: "600", color: "#111" },
  itemVariant: { fontSize: 12, color: "#666", marginTop: 2 },
  itemPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0a7ea4",
    marginTop: 4,
  },
  qtyRow: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 4 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
    width: 28,
    textAlign: "center",
  },
  deleteBtn: { padding: 8 },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  totalFinal: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  totalLabel: { fontSize: 14, color: "#666" },
  totalValue: { fontSize: 14, fontWeight: "600", color: "#333" },
  discountLabel: { fontSize: 14, color: "#059669" },
  discountValue: { fontSize: 14, fontWeight: "600", color: "#059669" },
  totalPrice: { fontSize: 22, fontWeight: "700", color: "#0a7ea4" },
  bottomActions: { flexDirection: "row", gap: 12, marginTop: 12 },
  clearBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  clearBtnText: { color: "#dc2626", fontSize: 15, fontWeight: "600" },
  checkoutBtn: {
    flex: 2,
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  checkoutBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Modal shared
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111" },

  // Customer
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111" },
  registerCustomerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    marginBottom: 8,
  },
  registerCustomerText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  customerList: { maxHeight: 300 },
  customerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
    gap: 12,
  },
  customerItemText: { fontSize: 15, color: "#333", flex: 1 },
  customerItemEmail: { fontSize: 12, color: "#999", marginTop: 1 },

  // Voucher
  activeVoucher: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  activeVoucherCode: { fontSize: 16, fontWeight: "700", color: "#059669" },
  activeVoucherDesc: { fontSize: 13, color: "#059669", marginTop: 2 },
  voucherInputRow: { flexDirection: "column", gap: 10 },
  voucherInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#111",
    width: "100%",
  },
  voucherApplyBtn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    padding: 14,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    marginTop: 4,
  },
  voucherApplyText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // Register
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#111",
    marginBottom: 12,
  },
  registerBtn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  registerBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // ── Checkout modal styles ──
  checkoutSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  checkoutBody: { maxHeight: 500 },

  // Payment method tabs
  paymentMethodRow: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  paymentMethodTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  paymentMethodTabActive: { backgroundColor: "#0a7ea4" },
  paymentMethodTabText: { fontSize: 13, fontWeight: "600", color: "#555" },
  paymentMethodTabTextActive: { color: "#fff" },

  // Total card
  checkoutTotalCard: {
    backgroundColor: "#f0f7ff",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
  },
  checkoutTotalLabel: { fontSize: 14, color: "#666" },
  checkoutTotalAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0a7ea4",
    marginTop: 4,
  },

  // Cash section
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  cashInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
    textAlign: "center",
    marginBottom: 12,
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  quickBtn: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fafafa",
  },
  quickBtnText: { fontSize: 13, fontWeight: "600", color: "#333" },
  changeCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  changeLabel: { fontSize: 14, color: "#059669" },
  changeAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#059669",
    marginTop: 4,
  },
  shortfallText: {
    color: "#dc2626",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },

  // Pay button
  payButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  payButtonDisabled: { opacity: 0.5 },
  payButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Transfer
  transferContainer: { gap: 12 },
  transferInfo: { fontSize: 14, color: "#333", lineHeight: 20 },
  transferNote: { backgroundColor: "#f0f7ff", borderRadius: 12, padding: 16 },
  transferNoteTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0a7ea4",
    marginBottom: 4,
  },
  transferNoteValue: { fontSize: 16, fontWeight: "700", color: "#111" },
  transferNoteHint: { fontSize: 12, color: "#999", marginTop: 8 },

  // QRIS
  qrisContainer: { gap: 16, alignItems: "center" },
  qrisImageWrap: {
    width: 220,
    height: 220,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  qrisImage: { width: "100%", height: "100%" },
  qrisTotal: { fontSize: 18, fontWeight: "700", color: "#111" },
  qrisHint: { fontSize: 13, color: "#999", textAlign: "center" },
  qrisEmpty: { alignItems: "center", padding: 24 },
  qrisEmptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
    marginTop: 12,
  },
  qrisEmptyHint: {
    fontSize: 13,
    color: "#ccc",
    textAlign: "center",
    marginTop: 4,
  },
  centeredModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  centeredModalSheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  receiptModalSheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  receiptScroll: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    maxHeight: 350,
    width: "100%",
    marginBottom: 16,
  },
  receiptPaper: {
    alignItems: "center",
  },
  receiptPaperCaptured: {
    backgroundColor: "#fff",
    paddingVertical: 20,
    paddingHorizontal: 16,
    width: 320,
    alignItems: "center",
  },
  receiptText: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 12,
    color: "#1e293b",
    lineHeight: 18,
  },
  receiptActionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    width: "100%",
  },
  receiptPrintBtn: {
    flex: 1,
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  receiptWaBtn: {
    flex: 1,
    backgroundColor: "#059669",
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  receiptBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  receiptCloseBtn: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  receiptCloseBtnText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
  },
  receiptGraphicHeader: {
    alignItems: "center",
    marginBottom: 8,
    width: "100%",
  },
  receiptLogoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  receiptStoreName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#000",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  receiptStoreCity: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  receiptLogoImage: {
    width: 60,
    height: 60,
    marginBottom: 6,
  },
});
