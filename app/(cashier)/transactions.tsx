import { supabase } from "@/lib/supabase";
import type { Order, OrderItem } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";

function formatPrice(price: number): string {
  return `Rp${price.toLocaleString("id-ID")}`;
}



// ── WIB (GMT+7 / Asia/Jakarta) date helpers ──

/** Ambil komponen tanggal (year, month, day) berdasarkan WIB (GMT+7).
 *  DateTimePicker return Date di midnight LOCAL device. Kita pakai
 *  local date components sebagai tanggal WIB. */
function toWIBComponents(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  };
}

function pickerDate(date: Date): string {
  // Gunakan timeZone Asia/Jakarta agar format tanggal konsisten dalam WIB
  return date.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toStartOfDayUTC(date: Date): string {
  const { year, month, day } = toWIBComponents(date);
  // 00:00 WIB = (day-1) 17:00 UTC
  return new Date(Date.UTC(year, month, day - 1, 17, 0, 0)).toISOString();
}

function toEndOfDayUTC(date: Date): string {
  const { year, month, day } = toWIBComponents(date);
  // 23:59:59.999 WIB → next day 00:00 WIB = day 17:00 UTC
  return new Date(Date.UTC(year, month, day, 17, 0, 0)).toISOString();
}

function formatWIB(iso: string): string {
  // Server kirim ISO tanpa timezone (tanpa Z) → treat sebagai UTC dengan nambahin Z
  const normalized =
    iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z";
  // `timeZone: 'Asia/Jakarta'` otomatis mengonversi UTC → WIB, tanpa perlu manual +7
  // Pakai toLocaleString (bukan toLocaleDateString) biar jam tampil di semua engine (Hermes dll.)
  return new Date(normalized).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWIBDateOnly(iso: string): string {
  const normalized = iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z";
  const d = new Date(normalized);
  const wibTime = d.getTime() + 7 * 60 * 60 * 1000;
  const wibDate = new Date(wibTime);
  const weekdays = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  return `${weekdays[wibDate.getUTCDay()]}, ${wibDate.getUTCDate()} ${months[wibDate.getUTCMonth()]} ${wibDate.getUTCFullYear()}`;
}

function formatWIBTimeOnly(iso: string): string {
  const normalized = iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z";
  const d = new Date(normalized);
  const wibTime = d.getTime() + 7 * 60 * 60 * 1000;
  const wibDate = new Date(wibTime);
  const hour = wibDate.getUTCHours().toString().padStart(2, "0");
  const minute = wibDate.getUTCMinutes().toString().padStart(2, "0");
  return `${hour}.${minute}`;
}

const STATUS_LABEL: Record<string, string> = {
  WAITING_PAYMENT: "Menunggu Pembayaran",
  VALIDATING_PAYMENT: "Validasi Pembayaran",
  PACKING: "Dikemas",
  SHIPPED: "Dikirim",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

const STATUS_COLOR: Record<string, string> = {
  WAITING_PAYMENT: "#f59e0b",
  VALIDATING_PAYMENT: "#f59e0b",
  PACKING: "#0a7ea4",
  SHIPPED: "#0a7ea4",
  COMPLETED: "#059669",
  CANCELLED: "#dc2626",
};

export default function TransactionsScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Date filter state ──
  const today = new Date();
  const [startDate, setStartDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [endDate, setEndDate] = useState(today);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // ── Detail modal state ──
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Receipt reprint state ──
  const [showReceipt, setShowReceipt] = useState(false);
  const [storeSettings, setStoreSettings] = useState<any | null>(null);
  const receiptRef = useRef<View>(null);

  useEffect(() => {
    const fetchStore = async () => {
      try {
        const { data } = await supabase.from("store_settings").select("*").limit(1).single();
        if (data) setStoreSettings(data);
      } catch {
        // silent
      }
    };
    fetchStore();
  }, []);

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

  const fetchOrders = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("*, order_items(*), users:customerId(name)")
          .eq("orderType", "OFFLINE")
          .gte("createdAt", toStartOfDayUTC(startDate))
          .lt("createdAt", toEndOfDayUTC(endDate))
          .order("createdAt", { ascending: false })
          .limit(100);

        if (error) throw error;
        setOrders((data as unknown as Order[]) ?? []);
      } catch (err: any) {
        console.error("Fetch orders error:", err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [startDate, endDate],
  );

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  const openDetail = async (order: Order) => {
    setSelectedOrder(order);
    setLoadingDetail(true);
    try {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("orderId", order.id);

      if (error) throw error;
      setOrderItems((data as unknown as OrderItem[]) ?? []);
    } catch (err: any) {
      console.error("Fetch order items error:", err.message);
      setOrderItems([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const renderOrder = ({ item }: { item: any }) => {
    const customerName = item.users?.name ?? "Customer Walk In";
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openDetail(item)}
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.orderId}>#{item.id.slice(0, 8)}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: STATUS_COLOR[item.status] ?? "#999" },
            ]}
          >
            <Text style={styles.statusText}>
              {STATUS_LABEL[item.status] ?? item.status}
            </Text>
          </View>
        </View>
        <Text style={styles.orderDate}>{formatWIB(item.createdAt)}</Text>

        <View style={styles.itemsListContainer}>
          {item.order_items?.map((orderItem: any) => (
            <View key={orderItem.id} style={styles.itemInfo}>
              <Text style={styles.productName}>{orderItem.productName}</Text>
              {orderItem.variantLabel ? (
                <Text style={styles.variantText}>{orderItem.variantLabel}</Text>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.customerLabel}>Pelanggan:</Text>
            <Text style={styles.customerName}>{customerName}</Text>
          </View>
          <Text style={styles.orderTotal}>{formatPrice(item.totalPrice)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const onStartChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowStartPicker(Platform.OS === "ios");
    if (date) setStartDate(date);
  };
  const onEndChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowEndPicker(Platform.OS === "ios");
    if (date) setEndDate(date);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0a7ea4" />
        <Text style={styles.loadingText}>Memuat transaksi...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Date filter bar ── */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setShowStartPicker(true)}
        >
          <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
          <Text style={styles.filterBtnLabel}>Dari</Text>
          <Text style={styles.filterBtnDate}>{pickerDate(startDate)}</Text>
        </TouchableOpacity>

        <Text style={styles.filterSeparator}>—</Text>

        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setShowEndPicker(true)}
        >
          <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
          <Text style={styles.filterBtnLabel}>Ke</Text>
          <Text style={styles.filterBtnDate}>{pickerDate(endDate)}</Text>
        </TouchableOpacity>
      </View>

      {showStartPicker && Platform.OS === "ios" && (
        <View style={styles.inlinePicker}>
          <DateTimePicker
            value={startDate}
            mode="date"
            display="compact"
            locale="id-ID"
            themeVariant="light"
            onChange={onStartChange}
            maximumDate={endDate}
          />
        </View>
      )}
      {showStartPicker && Platform.OS === "android" && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="default"
          onChange={onStartChange}
          maximumDate={endDate}
        />
      )}

      {showEndPicker && Platform.OS === "ios" && (
        <View style={styles.inlinePicker}>
          <DateTimePicker
            value={endDate}
            mode="date"
            display="compact"
            locale="id-ID"
            themeVariant="light"
            onChange={onEndChange}
            maximumDate={new Date()}
            minimumDate={startDate}
          />
        </View>
      )}
      {showEndPicker && Platform.OS === "android" && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display="default"
          onChange={onEndChange}
          maximumDate={new Date()}
          minimumDate={startDate}
        />
      )}

      <FlatList
        data={orders}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={orders.length === 0 ? styles.listEmpty : styles.list}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={() => fetchOrders(true)}
        ListEmptyComponent={
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="receipt-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>Belum ada transaksi</Text>
            <Text style={styles.emptyDesc}>
              Tidak ada transaksi di rentang tanggal ini
            </Text>
          </View>
        }
      />

      {/* ── Order detail modal ── */}
      <Modal
        visible={!!selectedOrder}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedOrder(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedOrder(null)}
        />
        <View style={styles.modalSheet}>
          {selectedOrder && (
            <>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  #{selectedOrder.id.slice(0, 8)}
                </Text>
                <TouchableOpacity onPress={() => setSelectedOrder(null)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <View style={styles.detailStatusRow}>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        STATUS_COLOR[selectedOrder.status] ?? "#999",
                    },
                  ]}
                >
                  <Text style={styles.statusText}>
                    {STATUS_LABEL[selectedOrder.status] ?? selectedOrder.status}
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Item</Text>
              {loadingDetail ? (
                <ActivityIndicator
                  size="small"
                  color="#0a7ea4"
                  style={{ marginVertical: 20 }}
                />
              ) : (
                <ScrollView style={styles.itemsList}>
                  {orderItems.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <View style={styles.itemRowLeft}>
                        <Text style={styles.itemName}>{item.productName}</Text>
                        {item.variantLabel && (
                          <Text style={styles.itemVariant}>
                            {item.variantLabel}
                          </Text>
                        )}
                        <Text style={styles.itemPrice}>
                          {formatPrice(item.price)} x {item.quantity}
                        </Text>
                      </View>
                      <Text style={styles.itemSubtotal}>
                        {formatPrice(item.price * item.quantity)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}

              <View style={styles.totalSection}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalAmount}>
                    {formatPrice(selectedOrder.totalPrice)}
                  </Text>
                </View>
              </View>

              {(() => {
                let paymentMethodText = "-";
                let paidAmount = null;
                let changeAmount = null;

                if (selectedOrder.notes) {
                  try {
                    const parsed = JSON.parse(selectedOrder.notes);
                    if (parsed.paymentMethod) {
                      paymentMethodText = parsed.paymentMethod;
                      if (parsed.paymentMethod === "cash" && parsed.cashAmount) {
                        paidAmount = parseInt(parsed.cashAmount, 10);
                        changeAmount = paidAmount - selectedOrder.totalPrice;
                      }
                    }
                  } catch {
                    paymentMethodText = selectedOrder.notes;
                  }
                }

                return (
                  <View style={styles.paymentDetailSection}>
                    <View style={styles.paymentDetailRow}>
                      <Text style={styles.paymentDetailLabel}>Metode Pembayaran</Text>
                      <Text style={styles.paymentDetailValue}>{paymentMethodText}</Text>
                    </View>
                    {paidAmount !== null && (
                      <>
                        <View style={styles.paymentDetailRow}>
                          <Text style={styles.paymentDetailLabel}>Tunai Bayar</Text>
                          <Text style={[styles.paymentDetailValue, { textTransform: "none" }]}>
                            {formatPrice(paidAmount)}
                          </Text>
                        </View>
                        <View style={styles.paymentDetailRow}>
                          <Text style={styles.paymentDetailLabel}>Kembalian</Text>
                          <Text style={[styles.paymentDetailValue, { textTransform: "none" }]}>
                            {formatPrice(changeAmount ?? 0)}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                );
              })()}

              <TouchableOpacity
                style={styles.viewReceiptBtn}
                onPress={() => setShowReceipt(true)}
              >
                <Ionicons name="receipt-outline" size={20} color="#fff" />
                <Text style={styles.viewReceiptBtnText}>Lihat & Cetak Struk</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>

      {/* ── Receipt modal ── */}
      <Modal
        visible={showReceipt}
        animationType="fade"
        transparent
        onRequestClose={() => setShowReceipt(false)}
      >
        <View style={styles.centeredModalContainer}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setShowReceipt(false)}
          />
          <View style={styles.receiptModalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Struk Transaksi</Text>
              <TouchableOpacity onPress={() => setShowReceipt(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {selectedOrder && (
              <>
                <ScrollView style={styles.receiptScroll} contentContainerStyle={styles.receiptPaper}>
                  <View ref={receiptRef} collapsable={false} style={styles.receiptPaperCaptured}>
                    <View style={styles.receiptGraphicHeader}>
                      {storeSettings?.logoUrl ? (
                        <Image
                          source={{ uri: storeSettings.logoUrl }}
                          style={styles.receiptLogoImage}
                          contentFit="contain"
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

                    {/* Divider Dotted */}
                    <View style={styles.receiptDottedLine} />

                    {/* Metadata */}
                    <View style={styles.receiptMetaRow}>
                      <Text style={styles.receiptMetaText}>No: #{selectedOrder.id.slice(0, 8).toUpperCase()}</Text>
                      <Text style={styles.receiptMetaText}>{formatWIBDateOnly(selectedOrder.createdAt)}</Text>
                    </View>
                    <View style={styles.receiptMetaRow}>
                      <Text style={styles.receiptMetaText}>Kasir: POS</Text>
                      <Text style={styles.receiptMetaText}>{formatWIBTimeOnly(selectedOrder.createdAt)}</Text>
                    </View>

                    {/* Divider Dotted */}
                    <View style={styles.receiptDottedLine} />

                    {/* Items Header */}
                    <View style={styles.receiptItemRow}>
                      <Text style={[styles.receiptItemHeader, styles.colItem]}>Item</Text>
                      <Text style={[styles.receiptItemHeader, styles.colQty, { textAlign: "center" }]}>Qty</Text>
                      <Text style={[styles.receiptItemHeader, styles.colPrice, { textAlign: "right" }]}>Harga</Text>
                    </View>

                    {/* Divider Solid */}
                    <View style={styles.receiptSolidLine} />

                    {/* Items List */}
                    {orderItems.map((item) => (
                      <View key={item.id} style={styles.receiptItemRow}>
                        <View style={styles.colItem}>
                          <Text style={styles.receiptItemName}>{item.productName}</Text>
                          {item.variantLabel && (
                            <Text style={styles.receiptItemVariant}>{item.variantLabel}</Text>
                          )}
                        </View>
                        <Text style={[styles.receiptItemText, styles.colQty, { textAlign: "center" }]}>{item.quantity}</Text>
                        <Text style={[styles.receiptItemText, styles.colPrice, { textAlign: "right" }]}>
                          {formatPrice(item.price)}
                        </Text>
                      </View>
                    ))}

                    {/* Divider Solid */}
                    <View style={styles.receiptSolidLine} />

                    {/* Summary Totals */}
                    {(() => {
                      let paymentMethod = "CASH";
                      let paidAmount = selectedOrder.totalPrice;
                      let changeAmount = 0;
                      let discount = 0;

                      if (selectedOrder.notes) {
                        try {
                          const parsed = JSON.parse(selectedOrder.notes);
                          if (parsed.paymentMethod) {
                            paymentMethod = parsed.paymentMethod.toUpperCase();
                            if (parsed.paymentMethod === "cash" && parsed.cashAmount) {
                              paidAmount = parseInt(parsed.cashAmount, 10);
                              changeAmount = paidAmount - selectedOrder.totalPrice;
                            }
                          }
                          if (parsed.discount) {
                            discount = parsed.discount;
                          }
                        } catch {
                          // ignore
                        }
                      }

                      return (
                        <View style={styles.receiptSummary}>
                          <View style={styles.receiptTotalRow}>
                            <Text style={styles.receiptTotalLabel}>TOTAL</Text>
                            <Text style={styles.receiptTotalVal}>{formatPrice(selectedOrder.totalPrice)}</Text>
                          </View>
                          {discount > 0 && (
                            <View style={styles.receiptMetaRow}>
                              <Text style={styles.receiptSummaryLabel}>Diskon</Text>
                              <Text style={styles.receiptSummaryVal}>-{formatPrice(discount)}</Text>
                            </View>
                          )}
                          <View style={styles.receiptMetaRow}>
                            <Text style={styles.receiptSummaryLabel}>Tunai</Text>
                            <Text style={styles.receiptSummaryVal}>{formatPrice(paidAmount)}</Text>
                          </View>
                          <View style={styles.receiptMetaRow}>
                            <Text style={styles.receiptSummaryLabel}>Kembali</Text>
                            <Text style={styles.receiptSummaryVal}>{formatPrice(changeAmount)}</Text>
                          </View>

                          <View style={styles.receiptDottedLine} />

                          <View style={styles.receiptMetaRow}>
                            <Text style={styles.receiptSummaryLabel}>Metode Pembayaran</Text>
                            <Text style={[styles.receiptSummaryVal, styles.uppercase]}>{paymentMethod}</Text>
                          </View>
                        </View>
                      );
                    })()}

                    {/* Divider Dotted */}
                    <View style={styles.receiptDottedLine} />

                    {/* Footer */}
                    <View style={styles.receiptFooter}>
                      <Text style={styles.receiptFooterText}>Terima Kasih! 🙏</Text>
                      <Text style={styles.receiptFooterTextSub}>
                        Barang yang sudah dibeli tidak dapat dikembalikan
                      </Text>
                    </View>
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

                <TouchableOpacity style={styles.receiptCloseBtn} onPress={() => setShowReceipt(false)}>
                  <Text style={styles.receiptCloseBtnText}>Kembali</Text>
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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f5f5f5",
  },
  loadingText: { marginTop: 12, fontSize: 15, color: "#666" },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#111", marginTop: 12 },
  emptyDesc: { fontSize: 14, color: "#999", marginTop: 4 },
  list: { padding: 16 },
  listEmpty: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  // Filter bar
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0f7ff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterBtnLabel: { fontSize: 12, color: "#666" },
  filterBtnDate: { fontSize: 13, fontWeight: "600", color: "#0a7ea4" },
  filterSeparator: { fontSize: 14, color: "#ccc" },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderId: { fontSize: 14, fontWeight: "700", color: "#333" },
  orderDate: { fontSize: 12, color: "#999", marginTop: 4 },
  itemsListContainer: {
    marginTop: 10,
    gap: 6,
  },
  itemInfo: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  productName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  variantText: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginVertical: 10,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  customerLabel: {
    fontSize: 10,
    color: "#94a3b8",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  customerName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginTop: 2,
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0a7ea4",
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  detailStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  itemsList: { maxHeight: 250 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  itemRowLeft: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: "600", color: "#111" },
  itemVariant: { fontSize: 12, color: "#666", marginTop: 2 },
  itemPrice: { fontSize: 12, color: "#999", marginTop: 4 },
  itemSubtotal: { fontSize: 14, fontWeight: "700", color: "#111" },
  totalSection: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 12,
    marginTop: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 16, fontWeight: "700", color: "#111" },
  totalAmount: { fontSize: 20, fontWeight: "800", color: "#0a7ea4" },

  // Payment info in detail modal
  paymentDetailSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 12,
    gap: 8,
  },
  paymentDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentDetailLabel: {
    fontSize: 13,
    color: "#64748b",
  },
  paymentDetailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    textTransform: "uppercase",
  },

  // iOS picker
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  pickerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  pickerDone: { fontSize: 16, fontWeight: "600", color: "#0a7ea4" },
  inlinePicker: {
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },

  // View Receipt Button in Detail Modal
  viewReceiptBtn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },
  viewReceiptBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  // Centered Modal
  centeredModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  receiptModalSheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    width: "95%",
    maxWidth: 400,
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
    paddingHorizontal: 8,
    paddingVertical: 12,
    maxHeight: 380,
    width: "100%",
    marginBottom: 16,
  },
  receiptPaper: {
    alignItems: "center",
    justifyContent: "center",
  },
  receiptPaperCaptured: {
    backgroundColor: "#fff",
    paddingVertical: 20,
    paddingHorizontal: 12,
    width: 290,
    alignSelf: "center",
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
  receiptDottedLine: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    borderRadius: 1,
    height: 1,
    width: "100%",
    marginVertical: 8,
  },
  receiptSolidLine: {
    height: 1,
    backgroundColor: "#cbd5e1",
    width: "100%",
    marginVertical: 8,
  },
  receiptMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginVertical: 2,
  },
  receiptMetaText: {
    fontSize: 11,
    color: "#475569",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  receiptItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    marginVertical: 4,
  },
  receiptItemHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e293b",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  receiptItemText: {
    fontSize: 12,
    color: "#334155",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  receiptItemName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e293b",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  receiptItemVariant: {
    fontSize: 10,
    color: "#64748b",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginTop: 1,
  },
  colItem: {
    flex: 5,
  },
  colQty: {
    flex: 1.5,
  },
  colPrice: {
    flex: 3.5,
  },
  receiptSummary: {
    width: "100%",
    marginTop: 4,
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginVertical: 4,
  },
  receiptTotalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  receiptTotalVal: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  receiptSummaryLabel: {
    fontSize: 12,
    color: "#475569",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  receiptSummaryVal: {
    fontSize: 12,
    color: "#1e293b",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  receiptFooter: {
    alignItems: "center",
    width: "100%",
    marginTop: 12,
  },
  receiptFooterText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    textAlign: "center",
  },
  receiptFooterTextSub: {
    fontSize: 9,
    color: "#64748b",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    textAlign: "center",
    marginTop: 4,
  },
  uppercase: {
    textTransform: "uppercase",
  },
});
