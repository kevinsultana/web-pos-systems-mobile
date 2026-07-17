import { supabase } from "@/lib/supabase";
import type { Order, OrderItem } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

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
            </>
          )}
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
});
