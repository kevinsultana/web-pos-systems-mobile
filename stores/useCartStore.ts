import { create } from 'zustand';
import type { Product, ProductVariant, CartItem, Voucher, Customer } from '@/types';

function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

interface CartState {
  items: CartItem[];
  voucher: Voucher | null;
  discount: number;
  customer: Customer | null;

  addItem: (product: Product, variant: ProductVariant | null, quantity?: number) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;

  setVoucher: (voucher: Voucher | null) => void;
  setCustomer: (customer: Customer | null) => void;

  subtotal: () => number;
  totalItems: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  voucher: null,
  discount: 0,
  customer: null,

  addItem: (product, variant, quantity = 1) => {
    const { items } = get();
    const existing = items.find(
      (i) => i.product.id === product.id && i.variant?.id === variant?.id
    );

    if (existing) {
      set({
        items: items.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + quantity } : i
        ),
      });
    } else {
      set({ items: [...items, { id: generateId(), product, variant, quantity }] });
    }
  },

  removeItem: (itemId) => {
    set({ items: get().items.filter((i) => i.id !== itemId) });
  },

  updateQuantity: (itemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(itemId);
      return;
    }
    set({
      items: get().items.map((i) => (i.id === itemId ? { ...i, quantity } : i)),
    });
  },

  clearCart: () => set({ items: [], voucher: null, discount: 0, customer: null }),

  setVoucher: (voucher) => {
    if (!voucher) {
      set({ voucher: null, discount: 0 });
      return;
    }
    const subtotal = get().subtotal();
    let discount = 0;
    if (voucher.type === 'PERCENTAGE') {
      discount = Math.round(subtotal * (voucher.value / 100));
    } else {
      discount = Math.min(voucher.value, subtotal);
    }
    set({ voucher, discount });
  },

  setCustomer: (customer) => set({ customer }),

  subtotal: () =>
    get().items.reduce((sum, item) => {
      const price = item.variant?.sell_price ?? item.product.sell_price ?? 0;
      return sum + price * item.quantity;
    }, 0),

  totalItems: () => get().items.length,
}));
