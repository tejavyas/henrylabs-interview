export type OrderRequestBody = {
  fullName?: string;
  email?: string;
  creditCardNumber?: string;
  expirationMonth?: number;
  expirationYear?: number;
  cvv?: string;
  amount?: number;
  currency?: string;
};

export type ValidationResult =
  | { ok: true; body: ValidatedOrderBody }
  | { ok: false; error: string; status: number };

export type ValidatedOrderBody = {
  fullName: string;
  email: string;
  creditCardNumber: string;
  expirationMonth: number;
  expirationYear: number;
  cvv: string;
  amount: number;
  currency: string;
};

export function validateOrderInput(body: OrderRequestBody): ValidationResult {
  const {
    fullName,
    email,
    creditCardNumber,
    expirationMonth,
    expirationYear,
    cvv,
    amount,
    currency,
  } = body;

  if (!fullName?.trim() || !email?.trim() || !creditCardNumber?.trim() || !cvv?.trim()) {
    return {
      ok: false,
      error: "fullName, email, creditCardNumber, and cvv are required",
      status: 400,
    };
  }
  if (amount == null || amount < 0 || !currency?.trim()) {
    return {
      ok: false,
      error: "amount and currency are required (amount must be >= 0)",
      status: 400,
    };
  }
  if (
    expirationMonth == null ||
    expirationYear == null ||
    expirationMonth < 1 ||
    expirationMonth > 12
  ) {
    return {
      ok: false,
      error: "expirationMonth (1-12) and expirationYear are required",
      status: 400,
    };
  }

  return {
    ok: true,
    body: {
      fullName: fullName.trim(),
      email: email.trim(),
      creditCardNumber: creditCardNumber.trim(),
      expirationMonth: Math.round(expirationMonth),
      expirationYear: Math.round(expirationYear),
      cvv: cvv.trim(),
      amount: Math.round(amount),
      currency: currency.trim(),
    },
  };
}
