import { useState, useEffect, useCallback } from "react";
import { type Product, type CardState, formatPrice } from "./types";
import { fetchProducts, createOrder } from "./api";
import {
  type CartItem,
  cartCount,
  cartTotalsByCurrency,
  getSingleCurrencyTotal,
  addItem,
  updateItemQty,
  removeItem,
} from "./lib/cartHelpers";
import { CartDrawer } from "./components/CartDrawer";
import { CheckoutForm } from "./components/CheckoutForm";

type Page = "shop" | "checkout" | "confirmation";

const initialCardState: CardState = {
  cardNumber: "",
  cardExpiryMonth: "",
  cardExpiryYear: "",
  cardCvv: "",
};

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState<Page>("shop");

  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [checkoutName, setCheckoutName] = useState("");
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutCard, setCheckoutCard] = useState<CardState>(initialCardState);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => addItem(prev, product));
    setDrawerOpen(true);
  }, []);

  const updateQty = useCallback((productId: number, delta: number) => {
    setCart((prev) => updateItemQty(prev, productId, delta));
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setCart((prev) => removeItem(prev, productId));
  }, []);

  const totalsByCurrency = cartTotalsByCurrency(cart);
  const totalCartCount = cartCount(cart);
  const isSingleCurrency = Object.keys(totalsByCurrency).length <= 1;

  const startCheckout = useCallback(() => {
    if (!isSingleCurrency || cart.length === 0) return;
    setPage("checkout");
    setDrawerOpen(false);
  }, [cart.length, isSingleCurrency]);

  const submitOrder = useCallback(async () => {
    const single = getSingleCurrencyTotal(totalsByCurrency);
    if (!single) return;

    const month = parseInt(checkoutCard.cardExpiryMonth, 10);
    const year = parseInt(checkoutCard.cardExpiryYear, 10);

    setIsSubmittingOrder(true);
    setOrderError(null);
    try {
      const { orderId } = await createOrder({
        fullName: checkoutName.trim(),
        email: checkoutEmail.trim(),
        creditCardNumber: checkoutCard.cardNumber,
        expirationMonth: month,
        expirationYear: year,
        cvv: checkoutCard.cardCvv,
        amount: single.amount,
        currency: single.currency,
      });
      setConfirmationId(orderId);
      setPage("confirmation");
      setCart([]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to place order";
      setOrderError(message);
    } finally {
      setIsSubmittingOrder(false);
    }
  }, [totalsByCurrency, checkoutName, checkoutEmail, checkoutCard]);

  const goToShop = useCallback(() => {
    setPage("shop");
    setConfirmationId(null);
    setCheckoutName("");
    setCheckoutEmail("");
    setCheckoutCard(initialCardState);
    setOrderError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((data) => { if (!cancelled) setProducts(data); })
      .catch((e) => { if (!cancelled) console.error(e); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="app">
      <header>
        <div className="logo" onClick={goToShop} style={{ cursor: "pointer" }}>
          Virellio
        </div>
        <button type="button" className="cart-btn" onClick={() => setDrawerOpen(true)}>
          Cart
          {totalCartCount > 0 && <span className="badge">{totalCartCount}</span>}
        </button>
      </header>

      <CartDrawer
        open={drawerOpen}
        cart={cart}
        totalsByCurrency={totalsByCurrency}
        isSingleCurrency={isSingleCurrency}
        onClose={() => setDrawerOpen(false)}
        onUpdateQty={updateQty}
        onRemove={removeFromCart}
        onCheckout={startCheckout}
      />

      <main>
        {page === "shop" && (
          <ShopPage products={products} onAddToCart={addToCart} />
        )}

        {page === "checkout" && (
          <CheckoutPage
            onBack={goToShop}
            name={checkoutName}
            email={checkoutEmail}
            card={checkoutCard}
            onNameChange={setCheckoutName}
            onEmailChange={setCheckoutEmail}
            onCardChange={(patch) => setCheckoutCard((c) => ({ ...c, ...patch }))}
            onSubmit={submitOrder}
            isSubmitting={isSubmittingOrder}
            error={orderError}
          />
        )}

        {page === "confirmation" && (
          <ConfirmationPage confirmationId={confirmationId} onContinue={goToShop} />
        )}
      </main>
    </div>
  );
}

function ShopPage({
  products,
  onAddToCart,
}: {
  products: Product[];
  onAddToCart: (p: Product) => void;
}) {
  return (
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
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onAddToCart(p)}
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

type CheckoutPageProps = {
  onBack: () => void;
  name: string;
  email: string;
  card: CardState;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onCardChange: (patch: Partial<CardState>) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
};

function CheckoutPage({
  onBack,
  name,
  email,
  card,
  onNameChange,
  onEmailChange,
  onCardChange,
  onSubmit,
  isSubmitting,
  error,
}: CheckoutPageProps) {
  return (
    <div className="checkout-page">
      <button type="button" className="back-link" onClick={onBack}>
        ← Back to shop
      </button>
      <h1>Checkout</h1>
      <CheckoutForm
        name={name}
        email={email}
        card={card}
        onNameChange={onNameChange}
        onEmailChange={onEmailChange}
        onCardChange={onCardChange}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        error={error}
      />
    </div>
  );
}

function ConfirmationPage({
  confirmationId,
  onContinue,
}: {
  confirmationId: string | null;
  onContinue: () => void;
}) {
  return (
    <div className="confirmation">
      <div className="check">✓</div>
      <h1>Order Confirmed</h1>
      <p>Thank you for your purchase.</p>
      <div className="conf-id" style={{ marginBottom: "1rem" }}>Confirmation: {confirmationId}</div>
      <button type="button" className="btn btn-primary" onClick={onContinue}>
        Continue Shopping
      </button>
    </div>
  );
}
