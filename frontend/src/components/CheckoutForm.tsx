import type { CardState } from "../types";

type Props = {
  name: string;
  email: string;
  card: CardState;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onCardChange: (patch: Partial<CardState>) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
};

const fieldStyle = { display: "flex", flexDirection: "column" as const, gap: "0.25rem" };
const inputStyle = { padding: "0.5rem 0.75rem", fontSize: "1rem" };
const rowStyle = { display: "flex", gap: "0.75rem" };
const labelFlex = { ...fieldStyle, flex: 1 as const };

export function CheckoutForm({
  name,
  email,
  card,
  onNameChange,
  onEmailChange,
  onCardChange,
  onSubmit,
  isSubmitting,
  error,
}: Props) {
  return (
    <div className="checkout-form" style={{ maxWidth: 480, marginTop: "1.5rem" }}>
      {error && (
        <div className="checkout-form-error" role="alert" style={{ marginBottom: "1rem", color: "var(--error, #c00)" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label style={fieldStyle}>
          <span>Name</span>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span>Email</span>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span>Card number</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 5678 9012 3456"
            value={card.cardNumber}
            onChange={(e) => onCardChange({ cardNumber: e.target.value })}
            style={inputStyle}
          />
        </label>
        <div style={rowStyle}>
          <label style={labelFlex}>
            <span>Expiry month</span>
            <input
              type="number"
              min={1}
              max={12}
              placeholder="1-12"
              value={card.cardExpiryMonth}
              onChange={(e) => onCardChange({ cardExpiryMonth: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelFlex}>
            <span>Expiry year</span>
            <input
              type="number"
              min={new Date().getFullYear()}
              placeholder="2028"
              value={card.cardExpiryYear}
              onChange={(e) => onCardChange({ cardExpiryYear: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelFlex}>
            <span>CVV</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              value={card.cardCvv}
              onChange={(e) => onCardChange({ cardCvv: e.target.value })}
              style={inputStyle}
            />
          </label>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-gold"
        style={{ width: "100%", marginTop: "1.5rem" }}
        onClick={onSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Processing…" : "Place order"}
      </button>
    </div>
  );
}
