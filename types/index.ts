// Matches Prisma Role enum: USER | ADMIN | SUPER_ADMIN | CASHIER
export type PrismaRole = "USER" | "ADMIN" | "SUPER_ADMIN" | "CASHIER";

// Mobile-app roles (lowercase convenience)
export type UserRole = "user" | "cashier";

// Maps to the web app's "users" table (Prisma model User)
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: PrismaRole;
  created_at: string;
  updated_at: string;
}

// ─── POS / Catalog ─────────────────────────────────────

export interface ProductImage {
  id: string;
  url: string;
  is_master: boolean;
  product_id: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  size: string;
  color: string;
  base_price: number | null;
  sell_price: number | null;
  barcode: string | null;
}

export interface Category {
  id: string;
  name: string;
  image_url: string | null;
}

export interface Product {
  id: string;
  name: string;
  detail: string | null;
  category_id: string;
  is_new: boolean;
  base_price: number | null;
  sell_price: number | null;
  category: Category | null;
  product_images: ProductImage[];
  product_variants: ProductVariant[];
}

export interface CartItem {
  id: string;
  product: Product;
  variant: ProductVariant | null;
  quantity: number;
}

// ─── Voucher ────────────────────────────────────────────

export interface Voucher {
  id: string;
  code: string;
  type: "PERCENTAGE" | "NOMINAL";
  value: number;
  minSpend: number;
  min_spend: number; // fallback snake_case
  quota: number;
  expiredAt: string;
  expired_at: string; // fallback
  target: "OFFLINE" | "ONLINE" | "BOTH";
}

// ─── Customer (from users table) ────────────────────────

export interface Customer {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
}

// ─── Store Settings ─────────────────────────────────────

export interface StoreSetting {
  id: string;
  store_name?: string;
  storeName?: string;
  qrisUrl: string | null;
  logoUrl?: string | null;
  whatsapp_number?: string | null;
  whatsappNumber?: string | null;
  originCityName?: string | null;
}

// ─── Order / Transaction ─────────────────────────────────

export type OrderStatus =
  | 'WAITING_PAYMENT'
  | 'VALIDATING_PAYMENT'
  | 'PACKING'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Order {
  id: string;
  customerId: string | null;
  totalPrice: number;
  shippingCost: number;
  status: OrderStatus;
  orderType: string;
  notes?: string | null;
  createdAt: string;
  items?: OrderItem[];
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantLabel: string | null;
  price: number;
  quantity: number;
}
