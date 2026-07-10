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
import BarcodeScanner from '@/components/BarcodeScanner';
import type { Product, Category, ProductVariant } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

function formatPrice(price: number): string {
  return `Rp${price.toLocaleString('id-ID')}`;
}

export default function PosScreen() {
  // ── Data state ──
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ──
  const [search, setSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
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
      // ponytail: attach category manually since no FK constraint exists at DB level
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
  }, []);

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

  // ── Barcode scan handler ──
  const handleBarcodeScanned = useCallback((barcode: string) => {
    setShowScanner(false);

    const found = products.find((p) =>
      p.product_variants.some((v) => v.barcode === barcode)
    );

    if (!found) {
      Toast.show({
        type: 'error',
        text1: 'Produk tidak ditemukan',
        text2: `Barcode ${barcode} tidak cocok dengan produk manapun`,
        visibilityTime: 2500,
        position: 'top',
      });
      return;
    }

    openProduct(found);

    // Auto-select the variant that has this barcode
    const matchedVariant = found.product_variants.find((v) => v.barcode === barcode);
    if (matchedVariant) {
      setSelectedVariant(matchedVariant);
    }
  }, [products]);

  // ── Active category name ──
  const activeCategory = activeCategoryId
    ? categories.find((c) => c.id === activeCategoryId)
    : null;

  // ── Card render ──
  const renderProductCard = ({ item }: { item: Product }) => {
    const masterImg = item.product_images?.find((i) => i.is_master)?.url
      ?? item.product_images?.[0]?.url;

    // ponytail: price from product_variants.sell_price, fallback to product.sell_price
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

  // ── Loading / Error ──
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

  // ── Price from variant or product ──
  const modalPrice = selectedVariant?.sell_price
    ?? selectedVariant?.base_price
    ?? selectedProduct?.sell_price
    ?? selectedProduct?.base_price
    ?? 0;

  return (
    <View style={styles.container}>
      {/* ── Search bar + filter + scan icons ── */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={20} color="#999" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari produk..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />

        {/* Filter button — shows active chip count */}
        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowFilterModal(true)}>
          <Ionicons
            name={activeCategoryId ? 'funnel' : 'funnel-outline'}
            size={20}
            color={activeCategoryId ? '#0a7ea4' : '#666'}
          />
        </TouchableOpacity>

        {/* Camera / scan button */}
        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowScanner(true)}>
          <Ionicons name="camera-outline" size={22} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Active category badge — shows if filter is on */}
      {activeCategory && (
        <View style={styles.activeFilterBadge}>
          <Text style={styles.activeFilterText}>{activeCategory.name}</Text>
          <TouchableOpacity onPress={() => setActiveCategoryId(null)}>
            <Ionicons name="close-circle" size={16} color="#0a7ea4" />
          </TouchableOpacity>
        </View>
      )}

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

      {/* ── Barcode scanner ── */}
      <BarcodeScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onBarcodeScanned={handleBarcodeScanned}
      />

      {/* ── Filter category modal ── */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilterModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterModal(false)} />
        <View style={styles.filterSheet}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>Filter Kategori</Text>
            <TouchableOpacity onPress={() => setShowFilterModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.filterList}>
            {/* All — reset filter */}
            <TouchableOpacity
              style={[styles.filterItem, !activeCategoryId && styles.filterItemActive]}
              onPress={() => { setActiveCategoryId(null); setShowFilterModal(false); }}
            >
              <Ionicons
                name={!activeCategoryId ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={!activeCategoryId ? '#0a7ea4' : '#999'}
              />
              <Text style={[styles.filterItemText, !activeCategoryId && styles.filterItemTextActive]}>
                Semua Kategori
              </Text>
            </TouchableOpacity>

            {categories.map((cat) => {
              const active = activeCategoryId === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.filterItem, active && styles.filterItemActive]}
                  onPress={() => { setActiveCategoryId(cat.id); setShowFilterModal(false); }}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? '#0a7ea4' : '#999'}
                  />
                  <Text style={[styles.filterItemText, active && styles.filterItemTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

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

              <TouchableOpacity style={styles.addButton} onPress={handleAddToCart}>
                <Ionicons name="cart" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.addButtonText}>Tambah ke Keranjang</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f5f5f5' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#666' },
  errorText: { marginTop: 12, fontSize: 15, color: '#dc2626', textAlign: 'center' },
  retryButton: { marginTop: 16, backgroundColor: '#0a7ea4', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyText: { marginTop: 12, fontSize: 15, color: '#999' },

  // Search row — search + filter + camera
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12,
    borderRadius: 10, paddingHorizontal: 12, height: 44,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111', height: 44 },
  iconBtn: { paddingHorizontal: 8, paddingVertical: 4 },

  // Active filter badge
  activeFilterBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    marginLeft: 16, marginTop: 8, backgroundColor: '#e0f2fe',
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, gap: 6,
  },
  activeFilterText: { fontSize: 13, color: '#0a7ea4', fontWeight: '600' },

  // Product grid
  list: { padding: 16, paddingBottom: 32 },
  row: { justifyContent: 'space-between', marginBottom: 12 },

  // Product card
  card: {
    width: CARD_WIDTH, backgroundColor: '#fff', borderRadius: 12,
    overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardImage: { width: CARD_WIDTH, height: CARD_WIDTH },
  cardImagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },
  cardBody: { padding: 10 },
  cardName: { fontSize: 13, fontWeight: '600', color: '#111', lineHeight: 18 },
  cardPrice: { fontSize: 14, fontWeight: '700', color: '#0a7ea4', marginTop: 4 },

  // Filter modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  filterSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40, maxHeight: '60%',
  },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  filterTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  filterList: { maxHeight: 300 },
  filterItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 12,
  },
  filterItemActive: {},
  filterItemText: { fontSize: 15, color: '#555' },
  filterItemTextActive: { color: '#0a7ea4', fontWeight: '600' },

  // Product detail modal
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40, maxHeight: '85%',
  },
  modalClose: { alignSelf: 'flex-end', padding: 4 },
  modalImageWrap: { alignItems: 'center', marginBottom: 12 },
  modalImage: { width: SCREEN_WIDTH - 80, height: SCREEN_WIDTH - 80, borderRadius: 12 },
  modalImagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },
  modalName: { fontSize: 20, fontWeight: '700', color: '#111' },
  modalDesc: { fontSize: 14, color: '#666', marginTop: 4, lineHeight: 20 },
  modalPrice: { fontSize: 22, fontWeight: '700', color: '#0a7ea4', marginTop: 8 },

  variantSection: { marginTop: 16 },
  variantLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  variantChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#e2e8f0', marginRight: 8, backgroundColor: '#fafafa',
  },
  variantChipActive: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  variantChipText: { fontSize: 13, color: '#555' },
  variantChipTextActive: { color: '#fff', fontWeight: '600' },

  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  qtyLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f0f0',
    justifyContent: 'center', alignItems: 'center',
  },
  qtyValue: { fontSize: 18, fontWeight: '700', color: '#111', width: 40, textAlign: 'center' },

  addButton: {
    flexDirection: 'row', backgroundColor: '#0a7ea4', borderRadius: 12,
    padding: 16, justifyContent: 'center', alignItems: 'center', marginTop: 20,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
