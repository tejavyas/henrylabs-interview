import type { Product } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${BASE}/products`);
  if (!res.ok) throw new Error("Failed to load products");
  return res.json();
}

export async function createOrder(params: {
  fullName: string;
  email: string;
  creditCardNumber: string;
  expirationMonth: number;
  expirationYear: number;
  cvv: string;
  amount: number;
  currency: string;
}): Promise<{ orderId: string }> {
  const res = await fetch(`${BASE}/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create order");
  return { orderId: data.orderId };
}
