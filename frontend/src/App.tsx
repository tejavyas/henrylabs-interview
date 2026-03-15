import { useState, useEffect, useCallback } from "react";
import type { Product } from "./types";
import { formatPrice } from "./types";
import { fetchProducts, createOrder } from "./api";

type Page = "shop" | "checkout" | "confirmation";

type CartItem = {
  product: Product;
  quantity: number;
};

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState<Page>("shop");

  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [checkoutName, setCheckoutName] = useState("");
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutCard, setCheckoutCard] = useState({
    cardNumber: "",
    cardExpiryMonth: "",
    cardExpiryYear: "",
    cardCvv: "",
  });
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setDrawerOpen(true);
  }, []);

  const updateQty = useCallback((productId: number, delta: number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.product.id === productId);
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty < 1) return prev.filter((i) => i.product.id !== productId);
      return prev.map((i) =>
        i.product.id === productId ? { ...i, quantity: newQty } : i
      );
    });
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const cartTotals = cart.reduce<Record<string, number>>((acc, item) => {
    const cur = item.product.currency;
    acc[cur] = (acc[cur] || 0) + item.product.amount * item.quantity;
    return acc;
  }, {});

  const currencyCount = Object.keys(cartTotals).length;
  const isSingleCurrency = currencyCount <= 1;

  const startCheckout = useCallback(() => {
    if (!isSingleCurrency || cart.length === 0) return;
    setPage("checkout");
    setDrawerOpen(false);
  }, [cart.length, isSingleCurrency]);

  const submitOrder = useCallback(async () => {
    const [[currency, amount]] = Object.entries(cartTotals);
    const month = parseInt(checkoutCard.cardExpiryMonth, 10);
    const year = parseInt(checkoutCard.cardExpiryYear, 10);
    setIsSubmittingOrder(true);
    try {
      const { orderId } = await createOrder({
        fullName: checkoutName.trim(),
        email: checkoutEmail.trim(),
        creditCardNumber: checkoutCard.cardNumber,
        expirationMonth: month,
        expirationYear: year,
        cvv: checkoutCard.cardCvv,
        amount,
        currency,
      });
      setConfirmationId(orderId);
      setPage("confirmation");
      setCart([]);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setIsSubmittingOrder(false);
    }
  }, [checkoutName, checkoutEmail, checkoutCard.cardNumber, checkoutCard.cardExpiryMonth, checkoutCard.cardExpiryYear, checkoutCard.cardCvv, cartTotals]);

  const goToShop = useCallback(() => {
    setPage("shop");
    setConfirmationId(null);
    setCheckoutName("");
    setCheckoutEmail("");
    setCheckoutCard({ cardNumber: "", cardExpiryMonth: "", cardExpiryYear: "", cardCvv: "" });
  }, []);

  useEffect(() => {
    fetchProducts()
      .then((data) => setProducts(data))
      .catch((e) => console.error(e));
  }, []);

  return (
    <div className="app">
      <header>
        <div className="logo" onClick={goToShop} style={{ cursor: "pointer" }}>
          Virellio
        </div>
        <button className="cart-btn" onClick={() => setDrawerOpen(true)}>
          Cart
          {cartCount > 0 && <span className="badge">{cartCount}</span>}
        </button>
      </header>

      <div
        className={`drawer-overlay ${drawerOpen ? "open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />
      <div className={`drawer ${drawerOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <h2>Your Cart</h2>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
            ×
          </button>
        </div>
        <div className="drawer-body">
          {cart.length === 0 ? (
            <div className="empty-cart">Your cart is empty</div>
          ) : (
            cart.map((item) => (
              <div key={item.product.id} className="cart-item">
                <img src={item.product.imgUrl} alt={item.product.name} />
                <div className="details">
                  <div className="item-name">{item.product.name}</div>
                  <div className="item-price">
                    {formatPrice(
                      item.product.amount * item.quantity,
                      item.product.currency
                    )}
                  </div>
                  <div className="qty-row">
                    <button
                      className="qty-btn"
                      onClick={() => updateQty(item.product.id, -1)}
                    >
                      −
                    </button>
                    <span className="qty">{item.quantity}</span>
                    <button
                      className="qty-btn"
                      onClick={() => updateQty(item.product.id, 1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="qty-btn"
                      style={{ marginLeft: "auto" }}
                      onClick={() => removeFromCart(item.product.id)}
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {cart.length > 0 && (
          <div className="drawer-footer">
            {!isSingleCurrency && (
              <div className="status-box error" style={{ marginBottom: "0.75rem" }}>
                Please use items in one currency only to checkout.
              </div>
            )}
            {Object.entries(cartTotals).map(([cur, total]) => (
              <div key={cur} className="cart-total">
                <span>Total ({cur})</span>
                <span className="total-amount">{formatPrice(total, cur)}</span>
              </div>
            ))}
            <button
              className="btn btn-gold"
              style={{ width: "100%" }}
              onClick={startCheckout}
              disabled={!isSingleCurrency}
            >
              Checkout
            </button>
          </div>
        )}
      </div>

      <main>
        {page === "shop" && (
          <>
            <h1 className="page-title">The Collection</h1>
            <p className="page-subtitle">Handcrafted luxury footwear</p>
            <div className="product-grid">
              {products.map((p) => (
                <div key={p.id} className="product-card">
                  <div className="img-wrap">
                    <img src={p.imgUrl} alt={p.name} />
                  </div>
                  <div className="info">
                    <div className="name">{p.name}</div>
                    <div className="desc">{p.description}</div>
                    <div className="price-row">
                      <span className="price">{formatPrice(p.amount, p.currency)}</span>
                      <button
                        className="btn btn-primary"
                        onClick={() => addToCart(p)}
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {page === "checkout" && (
          <div className="checkout-page">
            <button className="back-link" onClick={goToShop}>
              ← Back to shop
            </button>
            <h1>Checkout</h1>

            <div className="checkout-form" style={{ maxWidth: 480, marginTop: "1.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span>Name</span>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={checkoutName}
                    onChange={(e) => setCheckoutName(e.target.value)}
                    style={{ padding: "0.5rem 0.75rem", fontSize: "1rem" }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span>Email</span>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={checkoutEmail}
                    onChange={(e) => setCheckoutEmail(e.target.value)}
                    style={{ padding: "0.5rem 0.75rem", fontSize: "1rem" }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span>Card number</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="1234 5678 9012 3456"
                    value={checkoutCard.cardNumber}
                    onChange={(e) =>
                      setCheckoutCard((c) => ({ ...c, cardNumber: e.target.value }))
                    }
                    style={{ padding: "0.5rem 0.75rem", fontSize: "1rem" }}
                  />
                </label>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
                    <span>Expiry month</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      placeholder="1-12"
                      value={checkoutCard.cardExpiryMonth}
                      onChange={(e) =>
                        setCheckoutCard((c) => ({ ...c, cardExpiryMonth: e.target.value }))
                      }
                      style={{ padding: "0.5rem 0.75rem", fontSize: "1rem" }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
                    <span>Expiry year</span>
                    <input
                      type="number"
                      min={new Date().getFullYear()}
                      placeholder="2028"
                      value={checkoutCard.cardExpiryYear}
                      onChange={(e) =>
                        setCheckoutCard((c) => ({ ...c, cardExpiryYear: e.target.value }))
                      }
                      style={{ padding: "0.5rem 0.75rem", fontSize: "1rem" }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
                    <span>CVV</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                      value={checkoutCard.cardCvv}
                      onChange={(e) =>
                        setCheckoutCard((c) => ({ ...c, cardCvv: e.target.value }))
                      }
                      style={{ padding: "0.5rem 0.75rem", fontSize: "1rem" }}
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-gold"
                style={{ width: "100%", marginTop: "1.5rem" }}
                onClick={submitOrder}
                disabled={isSubmittingOrder}
              >
                {isSubmittingOrder ? "Processing…" : "Place order"}
              </button>
            </div>
          </div>
        )}

        {page === "confirmation" && (
          <div className="confirmation">
            <div className="check">✓</div>
            <h1>Order Confirmed</h1>
            <p>Thank you for your purchase.</p>
            <div className="conf-id">Confirmation: {confirmationId}</div>
            <br />
            <button className="btn btn-primary" onClick={goToShop}>
              Continue Shopping
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
