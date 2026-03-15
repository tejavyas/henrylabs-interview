export interface Product {
  id: number;
  name: string;
  description: string;
  keywords: string[];
  imgUrl: string;
  amount: number;
  currency: "USD" | "EUR" | "JPY";
}

/** Checkout form card fields (single source of truth). */
export interface CardState {
  cardNumber: string;
  cardExpiryMonth: string;
  cardExpiryYear: string;
  cardCvv: string;
}

export function formatPrice(amount: number, currency: string): string {
  const map: Record<string, { locale: string; divisor: number }> = {
    USD: { locale: "en-US", divisor: 100 },
    EUR: { locale: "de-DE", divisor: 100 },
    JPY: { locale: "ja-JP", divisor: 1 },
  };
  const { locale, divisor } = map[currency] ?? map.USD;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(amount / divisor);
}