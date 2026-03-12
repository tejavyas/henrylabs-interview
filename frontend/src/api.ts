const BASE = "/api";

export async function fetchProducts() {
  // #region agent log
  fetch('http://127.0.0.1:7437/ingest/f3a2e4ac-fced-4069-852f-95b203a709d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e1dcb5'},body:JSON.stringify({sessionId:'e1dcb5',location:'api.ts:fetchProducts.start',message:'fetch /api/products starting',data:{url:`${BASE}/products`},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  const res = await fetch(`${BASE}/products`);
  // #region agent log
  fetch('http://127.0.0.1:7437/ingest/f3a2e4ac-fced-4069-852f-95b203a709d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e1dcb5'},body:JSON.stringify({sessionId:'e1dcb5',location:'api.ts:fetchProducts.done',message:'fetch /api/products response',data:{ok:res.ok,status:res.status},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  if (!res.ok) throw new Error("Failed to load products");
  return res.json();
}

export async function createCheckout(params: {
  amount: number;
  currency: string;
  customerId?: string;
}) {
  const res = await fetch(`${BASE}/checkout/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function confirmCheckout(params: {
  checkoutId: string;
  paymentToken: string;
}) {
  const res = await fetch(`${BASE}/checkout/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function pollCheckoutStatus(trackingId: string) {
  const res = await fetch(`${BASE}/checkout/status/${trackingId}`);
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
