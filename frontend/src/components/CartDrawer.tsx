import type { CartItem } from "../lib/cartHelpers";
import { formatPrice } from "../types";

type Props = {
  open: boolean;
  cart: CartItem[];
  totalsByCurrency: Record<string, number>;
  isSingleCurrency: boolean;
  onClose: () => void;
  onUpdateQty: (productId: number, delta: number) => void;
  onRemove: (productId: number) => void;
  onCheckout: () => void;
};

export function CartDrawer({
  open,
  cart,
  totalsByCurrency,
  isSingleCurrency,
  onClose,
  onUpdateQty,
  onRemove,
  onCheckout,
}: Props) {
  return (
    <>
      <div
        className={`drawer-overlay ${open ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={`drawer ${open ? "open" : ""}`} role="dialog" aria-label="Cart">
        <div className="drawer-header">
          <h2>Your Cart</h2>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close cart">
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
                      type="button"
                      className="qty-btn"
                      onClick={() => onUpdateQty(item.product.id, -1)}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="qty">{item.quantity}</span>
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => onUpdateQty(item.product.id, 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="qty-btn"
                      style={{ marginLeft: "auto" }}
                      onClick={() => onRemove(item.product.id)}
                      aria-label="Remove from cart"
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
            {Object.entries(totalsByCurrency).map(([cur, total]) => (
              <div key={cur} className="cart-total">
                <span>Total ({cur})</span>
                <span className="total-amount">{formatPrice(total, cur)}</span>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-gold"
              style={{ width: "100%" }}
              onClick={onCheckout}
              disabled={!isSingleCurrency}
            >
              Checkout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
