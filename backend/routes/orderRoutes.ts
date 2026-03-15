import { products } from "../products";
import { getSupabase } from "../lib/supabase";
import { writeOrder } from "../services/orders";
import { writeOrderTracking } from "../services/orderTracking";
import { getNumberEncryption } from "../utils/encryption";
import { validateOrderInput } from "../validators/orderValidator";
import { json } from "../lib/response";
import { OrderStatus } from "../constants";

export async function handleGetProducts(): Promise<Response> {
  return json(products);
}

export async function handlePostOrder(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as Parameters<typeof validateOrderInput>[0];
    const validation = validateOrderInput(body);
    if (!validation.ok) {
      return json({ error: validation.error }, validation.status);
    }
    const { body: b } = validation;
    const enc = getNumberEncryption();
    const encryptedCard = enc.encrypt(b.creditCardNumber);
    const order = await writeOrder({
      full_name: b.fullName,
      email_address: b.email,
      credit_card_number: encryptedCard,
      expiration_month: b.expirationMonth,
      expiration_year: b.expirationYear,
      cvv: enc.encrypt(b.cvv),
      amount: b.amount,
      currency: b.currency,
    });
    await writeOrderTracking({ order_id: order.order_id, status: OrderStatus.QUEUED });
    getSupabase()
      .rpc("send_to_payment_queue", { p_order_id: order.order_id })
      .then(
        ({ error }) => {
          if (error) console.error("send_to_payment_queue error:", error);
        },
        (e: unknown) => console.error("send_to_payment_queue error:", e)
      );
    return json({ orderId: order.order_id });
  } catch (e: unknown) {
    console.error("order create error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return json({ error: message }, 500);
  }
}
