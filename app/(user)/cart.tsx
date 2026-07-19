import { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, Alert
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCartStore } from '@/stores/useCartStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { supabase } from '@/lib/supabase';
import Toast from 'react-native-toast-message';

function formatPrice(price: number): string {
  return `Rp${price.toLocaleString('id-ID')}`;
}

export default function CartScreen() {
  const router = useRouter();
  const { items, subtotal, updateQuantity, removeItem, clearCart } = useCartStore();
  const { user } = useAuthStore();

  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'gopay' | 'cod'>('gopay');
  const [checkingOut, setCheckingOut] = useState(false);

  const total = subtotal();

  function genId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  const handleCheckout = async () => {
    if (items.length === 0) return;
    if (!user) {
      Toast.show({
        type: 'error',
        text1: 'Sesi Berakhir',
        text2: 'Silakan login kembali untuk melanjutkan',
      });
      return;
    }

    setCheckingOut(true);
    try {
      const orderId = genId();

      // 1. Insert order
      const orderPayload = {
        id: orderId,
        customerId: user.id,
        totalPrice: total,
        shippingCost: 0,
        status: 'WAITING_PAYMENT',
        orderType: 'ONLINE',
        notes: JSON.stringify({
          paymentMethod,
          checkoutType: 'customer_app',
        }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { error: orderError } = await supabase
        .from('orders')
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
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // 3. Clear cart store
      clearCart();

      Toast.show({
        type: 'success',
        text1: 'Pemesanan Berhasil',
        text2: 'Pesanan Anda telah dibuat, silakan lakukan pembayaran.',
        visibilityTime: 3000,
      });

      // Redirect user to orders list page
      router.push('/(user)/orders');

    } catch (err: any) {
      Alert.alert('Checkout Gagal', err.message || 'Terjadi kesalahan saat memproses pesanan.');
    } finally {
      setCheckingOut(false);
    }
  };

  const renderCartItem = ({ item }: { item: any }) => {
    const masterImg = item.product.product_images?.find((i: any) => i.is_master)?.url
      ?? item.product.product_images?.[0]?.url;
    const itemPrice = item.variant?.sell_price ?? item.product.sell_price ?? 0;

    return (
      <View style={styles.cartCard}>
        {masterImg ? (
          <Image source={{ uri: masterImg }} style={styles.cardImage} contentFit="cover" />
        ) : (
          <View style={[styles.cardImage, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={24} color="#ccc" />
          </View>
        )}

        <View style={styles.cardDetails}>
          <Text style={styles.itemName} numberOfLines={2}>{item.product.name}</Text>
          {item.variant && (
            <Text style={styles.variantLabel}>
              Varian: {item.variant.size} / {item.variant.color}
            </Text>
          )}
          <Text style={styles.itemPrice}>{formatPrice(itemPrice)}</Text>

          <View style={styles.cardActionsRow}>
            {/* Quantity controls */}
            <View style={styles.qtyControl}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQuantity(item.id, item.quantity - 1)}
              >
                <Ionicons name="remove" size={16} color="#333" />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQuantity(item.id, item.quantity + 1)}
              >
                <Ionicons name="add" size={16} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Remove button */}
            <TouchableOpacity style={styles.removeBtn} onPress={() => removeItem(item.id)}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={80} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>Keranjang Belanja Kosong</Text>
        <Text style={styles.emptySubtitle}>
          Telusuri katalog produk kami dan tambahkan item ke dalam keranjang.
        </Text>
        <TouchableOpacity style={styles.shopBtn} onPress={() => router.push('/(user)')}>
          <Text style={styles.shopBtnText}>Mulai Belanja</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        renderItem={renderCartItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <View style={styles.footerWrap}>
            {/* ── Payment Method Selector ── */}
            <Text style={styles.sectionTitle}>Metode Pembayaran</Text>
            <View style={styles.paymentMethodContainer}>
              <TouchableOpacity
                style={[styles.paymentChip, paymentMethod === 'gopay' && styles.paymentChipActive]}
                onPress={() => setPaymentMethod('gopay')}
              >
                <Ionicons
                  name={paymentMethod === 'gopay' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={paymentMethod === 'gopay' ? '#0a7ea4' : '#64748b'}
                />
                <Text style={[styles.paymentChipText, paymentMethod === 'gopay' && styles.paymentChipTextActive]}>
                  Gopay
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.paymentChip, paymentMethod === 'bank' && styles.paymentChipActive]}
                onPress={() => setPaymentMethod('bank')}
              >
                <Ionicons
                  name={paymentMethod === 'bank' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={paymentMethod === 'bank' ? '#0a7ea4' : '#64748b'}
                />
                <Text style={[styles.paymentChipText, paymentMethod === 'bank' && styles.paymentChipTextActive]}>
                  Transfer Bank
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.paymentChip, paymentMethod === 'cod' && styles.paymentChipActive]}
                onPress={() => setPaymentMethod('cod')}
              >
                <Ionicons
                  name={paymentMethod === 'cod' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={paymentMethod === 'cod' ? '#0a7ea4' : '#64748b'}
                />
                <Text style={[styles.paymentChipText, paymentMethod === 'cod' && styles.paymentChipTextActive]}>
                  COD (Bayar di Tempat)
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Summary card ── */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Ringkasan Pembayaran</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{formatPrice(total)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Ongkos Kirim</Text>
                <Text style={styles.summaryValue}>Rp0</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.totalLabel}>Total Pembayaran</Text>
                <Text style={styles.totalValue}>{formatPrice(total)}</Text>
              </View>
            </View>
          </View>
        }
      />

      {/* ── Action bar checkout at absolute bottom ── */}
      <View style={styles.checkoutBar}>
        <View>
          <Text style={styles.checkoutTotalLabel}>Total</Text>
          <Text style={styles.checkoutTotalValue}>{formatPrice(total)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.checkoutBtn, checkingOut && styles.checkoutBtnDisabled]}
          onPress={handleCheckout}
          disabled={checkingOut}
        >
          {checkingOut ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.checkoutBtnText}>Buat Pesanan</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 4 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  listContainer: { padding: 16, paddingBottom: 100 },

  // Empty Cart State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f8fafc',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 16 },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  shopBtn: {
    marginTop: 24,
    backgroundColor: '#0a7ea4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  shopBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Cart item card
  cartCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardImage: { width: 80, height: 80, borderRadius: 8 },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  cardDetails: { flex: 1, marginLeft: 12 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#1e293b', lineHeight: 18 },
  variantLabel: { fontSize: 11, color: '#64748b', marginTop: 3 },
  itemPrice: { fontSize: 15, fontWeight: '700', color: '#0a7ea4', marginTop: 6 },

  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: { fontSize: 14, fontWeight: '700', color: '#1e293b', width: 30, textAlign: 'center' },
  removeBtn: { padding: 4 },

  // Footer styling
  footerWrap: { marginTop: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  paymentMethodContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  paymentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  paymentChipActive: {},
  paymentChipText: { fontSize: 14, color: '#475569', fontWeight: '500' },
  paymentChipTextActive: { color: '#0a7ea4', fontWeight: '600' },

  // Summary card
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  summaryLabel: { fontSize: 13, color: '#64748b' },
  summaryValue: { fontSize: 13, color: '#1e293b', fontWeight: '500' },
  summaryDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 8 },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  totalValue: { fontSize: 15, fontWeight: '800', color: '#0a7ea4' },

  // Absolute checkout bar at bottom
  checkoutBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  checkoutTotalLabel: { fontSize: 12, color: '#64748b' },
  checkoutTotalValue: { fontSize: 18, fontWeight: '800', color: '#0a7ea4' },
  checkoutBtn: {
    flexDirection: 'row',
    backgroundColor: '#0a7ea4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  checkoutBtnDisabled: { backgroundColor: '#94a3b8' },
  checkoutBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
