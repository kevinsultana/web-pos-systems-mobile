import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Modal,
  StyleSheet, ActivityIndicator, ScrollView, Dimensions, Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCartStore } from '@/stores/useCartStore';
import Toast from 'react-native-toast-message';
import type { Product, Category, ProductVariant } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

function formatPrice(price: number): string {
  return `Rp${price.toLocaleString('id-ID')}`;
}

export default function ShopScreen() {
  // ── Data state ──
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ──
  const [search, setSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);

  const addItem = useCartStore((s) => s.addItem);

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, product_images(*), product_variants(*)')
          .order('name'),
        supabase.from('categories').select('*').order('name'),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      const fetchedCategories = categoriesRes.data as Category[] ?? [];
      const categoryMap = new Map(fetchedCategories.map((c) => [c.id, c]));
      
      const productsWithCategory = (productsRes.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        detail: p.detail,
        category_id: p.category_id ?? p.categoryId,
        is_new: p.is_new ?? p.isNew,
        base_price: p.base_price ?? p.basePrice ?? null,
        sell_price: p.sell_price ?? p.sellPrice ?? null,
        category: categoryMap.get(p.category_id ?? p.categoryId) ?? null,
        product_images: (p.product_images ?? p.images ?? []).map((i: any) => ({
          id: i.id,
          url: i.url,
          is_master: i.is_master ?? i.isMaster,
          product_id: i.product_id ?? i.productId,
        })),
        product_variants: (p.product_variants ?? p.variants ?? []).map((v: any) => ({
          id: v.id,
          product_id: v.product_id ?? v.productId,
          size: v.size,
          color: v.color,
          base_price: v.base_price ?? v.basePrice ?? null,
          sell_price: v.sell_price ?? v.sellPrice ?? null,
          barcode: v.barcode,
        })),
      }));

      setProducts(productsWithCategory as unknown as Product[]);
      setCategories(fetchedCategories);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Filtered products ──
  const filtered = useMemo(() => {
    let list = products;
    if (activeCategoryId) {
      list = list.filter((p) => p.category_id === activeCategoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCategoryId, search]);

  // ── Product modal handlers ──
  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setSelectedVariant(product.product_variants.length === 1 ? product.product_variants[0] : null);
    setQuantity(1);
  };

  const closeProduct = () => {
    setSelectedProduct(null);
    setSelectedVariant(null);
    setQuantity(1);
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;

    if (selectedProduct.product_variants.length > 0 && !selectedVariant) {
      Toast.show({
        type: 'error',
        text1: 'Varian Belum Dipilih',
        text2: 'Silakan pilih varian produk terlebih dahulu',
        visibilityTime: 2000,
        position: 'top',
      });
      return;
    }

    addItem(selectedProduct, selectedVariant, quantity);
    Toast.show({
      type: 'success',
      text1: 'Ditambahkan ke keranjang',
      text2: `${selectedProduct.name}${selectedVariant ? ` (${selectedVariant.size} / ${selectedVariant.color})` : ''} x${quantity}`,
      visibilityTime: 2000,
      position: 'top',
    });
    closeProduct();
  };

  // ── Card render ──
  const renderProductCard = ({ item }: { item: Product }) => {
    const masterImg = item.product_images?.find((i) => i.is_master)?.url
      ?? item.product_images?.[0]?.url;

    const variantPrices = item.product_variants
      ?.map((v) => v.sell_price)
      .filter((p): p is number => p != null) ?? [];
    const minPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : null;
    const maxPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : null;
    const productPrice = item.sell_price ?? item.base_price;

    return (
      <TouchableOpacity style={styles.card} onPress={() => openProduct(item)} activeOpacity={0.85}>
        {masterImg ? (
          <Image source={{ uri: masterImg }} style={styles.cardImage} contentFit="cover" />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons name="image-outline" size={32} color="#ccc" />
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          {minPrice !== null && minPrice !== maxPrice ? (
            <Text style={styles.cardPrice}>
              {formatPrice(minPrice)} – {formatPrice(maxPrice!)}
            </Text>
          ) : (
            <Text style={styles.cardPrice}>
              {formatPrice(minPrice ?? maxPrice ?? productPrice ?? 0)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0a7ea4" />
        <Text style={styles.loadingText}>Memuat produk...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color="#dc2626" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryText}>Coba Lagi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const modalPrice = selectedVariant?.sell_price
    ?? selectedVariant?.base_price
    ?? selectedProduct?.sell_price
    ?? selectedProduct?.base_price
    ?? 0;

  return (
    <View style={styles.container}>
      {/* ── Search bar ── */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={20} color="#999" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari produk di toko..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* ── Category Horizontal Chips ── */}
      <View style={styles.categoryBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          <TouchableOpacity
            style={[styles.categoryChip, !activeCategoryId && styles.categoryChipActive]}
            onPress={() => setActiveCategoryId(null)}
          >
            <Text style={[styles.categoryChipText, !activeCategoryId && styles.categoryChipTextActive]}>
              Semua
            </Text>
          </TouchableOpacity>
          {categories.map((cat) => {
            const active = activeCategoryId === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setActiveCategoryId(cat.id)}
              >
                <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Product grid ── */}
      {filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>Produk tidak ditemukan</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderProductCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={fetchData}
        />
      )}

      {/* ── Product detail modal ── */}
      <Modal
        visible={!!selectedProduct}
        animationType="slide"
        transparent
        onRequestClose={closeProduct}
      >
        <Pressable style={styles.modalOverlay} onPress={closeProduct} />
        <View style={styles.modalSheet}>
          {selectedProduct && (
            <>
              <TouchableOpacity style={styles.modalClose} onPress={closeProduct}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>

              <View style={styles.modalImageWrap}>
                {(() => {
                  const img = selectedProduct.product_images?.find((i) => i.is_master)?.url
                    ?? selectedProduct.product_images?.[0]?.url;
                  return img ? (
                    <Image source={{ uri: img }} style={styles.modalImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.modalImage, styles.modalImagePlaceholder]}>
                      <Ionicons name="image-outline" size={48} color="#ccc" />
                    </View>
                  );
                })()}
              </View>

              <Text style={styles.modalName}>{selectedProduct.name}</Text>
              {selectedProduct.detail && (
                <Text style={styles.modalDesc} numberOfLines={3}>
                  {selectedProduct.detail}
                </Text>
              )}
              <Text style={styles.modalPrice}>{formatPrice(modalPrice)}</Text>

              {selectedProduct.product_variants.length > 0 && (
                <View style={styles.variantSection}>
                  <Text style={styles.variantLabel}>Varian:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {selectedProduct.product_variants.map((v) => {
                      const active = selectedVariant?.id === v.id;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={[styles.variantChip, active && styles.variantChipActive]}
                          onPress={() => setSelectedVariant(v)}
                        >
                          <Text style={[styles.variantChipText, active && styles.variantChipTextActive]}>
                            {v.size} / {v.color}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.qtyRow}>
                <Text style={styles.qtyLabel}>Jumlah:</Text>
                <View style={styles.qtyControl}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    <Ionicons name="remove" size={20} color="#333" />
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setQuantity((q) => q + 1)}
                  >
                    <Ionicons name="add" size={20} color="#333" />
                  </TouchableOpacity>
                </View>
              </View>

              {(() => {
                const hasVariants = selectedProduct.product_variants.length > 0;
                const isDisabled = hasVariants && !selectedVariant;
                return (
                  <TouchableOpacity
                    style={[styles.addButton, isDisabled && styles.addButtonDisabled]}
                    onPress={handleAddToCart}
                  >
                    <Ionicons name="cart" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.addButtonText}>Tambah ke Keranjang</Text>
                  </TouchableOpacity>
                );
              })()}
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#64748b', fontWeight: '500' },
  errorText: { marginTop: 12, fontSize: 15, color: '#dc2626', textAlign: 'center' },
  retryButton: { marginTop: 16, backgroundColor: '#0a7ea4', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyText: { marginTop: 12, fontSize: 15, color: '#94a3b8', fontWeight: '500' },

  // Search row — search input
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12,
    borderRadius: 10, paddingHorizontal: 12, height: 44,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1,
    borderWidth: 1, borderColor: '#f1f5f9',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1e293b', height: 44 },

  // Category horizontal chips
  categoryBarContainer: {
    marginTop: 12,
    marginBottom: 4,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  categoryChipActive: {
    backgroundColor: '#0a7ea4',
    borderColor: '#0a7ea4',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  // Product grid
  list: { padding: 16, paddingBottom: 32 },
  row: { justifyContent: 'space-between', marginBottom: 12 },

  // Product card
  card: {
    width: CARD_WIDTH, backgroundColor: '#fff', borderRadius: 12,
    overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: '#f1f5f9',
  },
  cardImage: { width: CARD_WIDTH, height: CARD_WIDTH },
  cardImagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  cardBody: { padding: 10 },
  cardName: { fontSize: 13, fontWeight: '600', color: '#1e293b', lineHeight: 18 },
  cardPrice: { fontSize: 14, fontWeight: '700', color: '#0a7ea4', marginTop: 4 },

  // Detail Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.3)' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40, maxHeight: '85%',
  },
  modalClose: { alignSelf: 'flex-end', padding: 4 },
  modalImageWrap: { alignItems: 'center', marginBottom: 12 },
  modalImage: { width: SCREEN_WIDTH - 80, height: SCREEN_WIDTH - 80, borderRadius: 12 },
  modalImagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  modalName: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  modalDesc: { fontSize: 14, color: '#64748b', marginTop: 4, lineHeight: 20 },
  modalPrice: { fontSize: 22, fontWeight: '700', color: '#0a7ea4', marginTop: 8 },

  variantSection: { marginTop: 16 },
  variantLabel: { fontSize: 14, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  variantChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#e2e8f0', marginRight: 8, backgroundColor: '#f8fafc',
  },
  variantChipActive: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  variantChipText: { fontSize: 13, color: '#475569' },
  variantChipTextActive: { color: '#fff', fontWeight: '600' },

  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  qtyLabel: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9',
    justifyContent: 'center', alignItems: 'center',
  },
  qtyValue: { fontSize: 18, fontWeight: '700', color: '#1e293b', width: 40, textAlign: 'center' },

  addButton: {
    flexDirection: 'row', backgroundColor: '#0a7ea4', borderRadius: 12,
    padding: 16, justifyContent: 'center', alignItems: 'center', marginTop: 20,
  },
  addButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
