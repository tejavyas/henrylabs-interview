import type { Product } from "../types";

export type CartItem = {
  product: Product;
  quantity: number;
};

export function cartCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

export function cartTotalsByCurrency(cart: CartItem[]): Record<string, number> {
  return cart.reduce<Record<string, number>>((acc, item) => {
    const cur = item.product.currency;
    acc[cur] = (acc[cur] || 0) + item.product.amount * item.quantity;
    return acc;
  }, {});
}

/** Returns { currency, amount } when cart has exactly one currency; otherwise null. */
export function getSingleCurrencyTotal(
  totals: Record<string, number>
): { currency: string; amount: number } | null {
  const entries = Object.entries(totals);
  if (entries.length !== 1) return null;
  const [currency, amount] = entries[0];
  return { currency, amount };
}

export function addItem(prev: CartItem[], product: Product): CartItem[] {
  const existing = prev.find((i) => i.product.id === product.id);
  if (existing) {
    return prev.map((i) =>
      i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
    );
  }
  return [...prev, { product, quantity: 1 }];
}

export function updateItemQty(
  prev: CartItem[],
  productId: number,
  delta: number
): CartItem[] {
  const item = prev.find((i) => i.product.id === productId);
  if (!item) return prev;
  const newQty = item.quantity + delta;
  if (newQty < 1) return prev.filter((i) => i.product.id !== productId);
  return prev.map((i) =>
    i.product.id === productId ? { ...i, quantity: newQty } : i
  );
}

export function removeItem(prev: CartItem[], productId: number): CartItem[] {
  return prev.filter((i) => i.product.id !== productId);
}
