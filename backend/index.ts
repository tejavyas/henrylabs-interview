import "./bun-polyfill";
import http from "http";
import { PaymentProcessor } from "@henrylabs-interview/payments";
import { products } from "./products";
import { config } from "./config";
import { getSupabase } from "./lib/supabase";
import { writeOrder } from "./services/orders";
import {
  writeOrderTracking,
  updateOrderTracking,
  readOrderTrackingByTrackingId,
} from "./services/orderTracking";
import { getNumberEncryption } from "./utils/encryption";

console.log("Backend starting...");
const { apiKey, webhookSecret, webhookBaseUrl, port: PORT } = config;
const processor = new PaymentProcessor({ apiKey });

// ─── In-memory store for tracking checkout states ───
// Since we're stateless (no DB), we track deferred checkouts here
// so the frontend can poll for async results
interface CheckoutRecord {
  checkoutId: string | null;
  status: "pending" | "created" | "confirmed" | "failed";
  confirmationId?: string;
  amount: number;
  currency: string;
  error?: string;
  createdAt: number;
}

const checkoutStore = new Map<string, CheckoutRecord>();

// ─── Register webhook endpoint on startup ───
async function registerWebhooks() {
  try {
    const webhookUrl = `${webhookBaseUrl}/api/webhooks`;
    const success = await processor.webhooks.createEndpoint({
      url: webhookUrl,
      events: [
        "checkout.create.success",
        "checkout.create.failure",
        "checkout.confirm.success",
        "checkout.confirm.failure",
      ],
      secret: webhookSecret,
    });
    console.log(`Webhooks registered: ${success} (${webhookUrl})`);
  } catch (e) {
    console.error("Failed to register webhooks:", e);
  }
}

// ─── Retry helper with exponential backoff ───
async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
  maxRetries = 3,
  baseDelay = 500
): Promise<T> {
  let lastResult: T;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await fn();
    if (!shouldRetry(lastResult)) return lastResult;
    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
      console.log(`Retrying... attempt ${attempt + 2}/${maxRetries + 1}`);
    }
  }
  return lastResult!;
}

// ─── CORS + JSON helpers ───
const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── GET /api/products ──
    if (path === "/api/products" && req.method === "GET") {
      return json(products);
    }

    // ── POST /api/order ──
    if (path === "/api/order" && req.method === "POST") {
      try {
        const body = (await req.json()) as {
          fullName: string;
          email: string;
          creditCardNumber: string;
          expirationMonth: number;
          expirationYear: number;
          cvv: string;
          amount: number;
          currency: string;
        };
        const { fullName, email, creditCardNumber, expirationMonth, expirationYear, cvv, amount, currency } = body;
        if (!fullName?.trim() || !email?.trim() || !creditCardNumber?.trim() || !cvv?.trim()) {
          return json({ error: "fullName, email, creditCardNumber, and cvv are required" }, 400);
        }
        if (amount == null || amount < 0 || !currency?.trim()) {
          return json({ error: "amount and currency are required (amount must be >= 0)" }, 400);
        }
        if (expirationMonth == null || expirationYear == null || expirationMonth < 1 || expirationMonth > 12) {
          return json({ error: "expirationMonth (1-12) and expirationYear are required" }, 400);
        }
        const enc = getNumberEncryption();
        const encryptedCard = enc.encrypt(creditCardNumber.trim());
        const order = await writeOrder({
          full_name: fullName.trim(),
          email_address: email.trim(),
          credit_card_number: encryptedCard,
          expiration_month: Math.round(expirationMonth),
          expiration_year: Math.round(expirationYear),
          cvv: cvv.trim(),
          amount: Math.round(amount),
          currency: currency.trim(),
        });
        await writeOrderTracking({ order_id: order.order_id, status: "queued" });
        // Enqueue optimistically: don't block the response on queue write
        getSupabase()
          .rpc("send_to_payment_queue", { p_order_id: order.order_id })
          .then(
            ({ error }) => {
              if (error) console.error("send_to_payment_queue error:", error);
            },
            (e: unknown) => console.error("send_to_payment_queue error:", e)
          );
        return json({ orderId: order.order_id });
      } catch (e: any) {
        console.error("order create error:", e);
        return json({ error: e?.message ?? "Internal server error" }, 500);
      }
    }

    // ── POST /api/checkout/create ──
    if (path === "/api/checkout/create" && req.method === "POST") {
      try {
        const body = (await req.json()) as {
          amount: number;
          currency: "USD" | "EUR" | "JPY";
          customerId?: string;
        };
        const { amount, currency, customerId } = body;

        if (!amount || !currency) {
          return json({ error: "amount and currency are required" }, 400);
        }

        // Retry on 503-retry responses
        const result = await withRetry(
          () => processor.checkout.create({ amount, currency, customerId }),
          (res) => res.status === "failure" && res.substatus === "503-retry"
        );

        // Generate a tracking ID for deferred results
        const trackingId = result._reqId;

        if (result.status === "success") {
          if (result.substatus === "201-immediate") {
            checkoutStore.set(trackingId, {
              checkoutId: result.data.checkoutId,
              status: "created",
              amount,
              currency,
              createdAt: Date.now(),
            });
            return json({
              trackingId,
              checkoutId: result.data.checkoutId,
              paymentMethodOptions: result.data.paymentMethodOptions,
              status: "created",
            });
          }

          if (result.substatus === "202-deferred") {
            checkoutStore.set(trackingId, {
              checkoutId: null,
              status: "pending",
              amount,
              currency,
              createdAt: Date.now(),
            });
            return json({
              trackingId,
              status: "pending",
              message: "Checkout is being processed. Poll for status.",
            });
          }
        }

        // Failure cases
        const errorMap: Record<string, string> = {
          "500-error": "Payment system error. Please try again.",
          "501-not-supported": "This payment method is not supported.",
          "502-fraud": "Transaction declined by fraud detection.",
          "503-retry": "System is busy. Please try again later.",
        };

        const substatus =
          result.status === "failure" ? result.substatus : "500-error";

        return json(
          {
            error: errorMap[substatus] || "Checkout failed.",
            code: substatus,
          },
          result.code || 500
        );
      } catch (e: any) {
        console.error("checkout.create error:", e);
        return json({ error: "Internal server error" }, 500);
      }
    }

    // ── POST /api/checkout/confirm ──
    if (path === "/api/checkout/confirm" && req.method === "POST") {
      try {
        const body = (await req.json()) as {
          checkoutId: string;
          paymentToken: string;
        };
        const { checkoutId, paymentToken } = body;

        if (!checkoutId) {
          return json({ error: "checkoutId is required" }, 400);
        }

        if (!paymentToken) {
          return json({ error: "paymentToken is required" }, 400);
        }

        // Use embedded token flow
        const result = await withRetry(
          () =>
            processor.checkout.confirm({
              checkoutId,
              type: "embedded",
              data: { paymentToken },
            }),
          (res) => res.status === "failure" && res.substatus === "503-retry"
        );

        const trackingId = result._reqId;

        if (result.status === "success") {
          if (result.substatus === "201-immediate") {
            // Update any existing checkout record
            for (const [key, record] of checkoutStore) {
              if (record.checkoutId === checkoutId) {
                record.status = "confirmed";
                record.confirmationId = result.data.confirmationId;
              }
            }

            return json({
              trackingId,
              status: "confirmed",
              confirmationId: result.data.confirmationId,
              amount: result.data.amount,
              currency: result.data.currency,
            });
          }

          if (result.substatus === "202-deferred") {
            // Store for webhook resolution
            checkoutStore.set(trackingId, {
              checkoutId,
              status: "pending",
              amount: 0,
              currency: "USD",
              createdAt: Date.now(),
            });

            return json({
              trackingId,
              status: "pending",
              message:
                "Payment is being processed. Poll for confirmation status.",
            });
          }
        }

        // Failure
        const errorMap: Record<string, string> = {
          "500-error": "Payment processing error. Please try again.",
          "502-fraud": "Payment declined. Possible fraud detected.",
          "503-retry": "System is busy. Please try again later.",
        };

        const substatus =
          result.status === "failure" ? result.substatus : "500-error";

        return json(
          {
            error: errorMap[substatus] || "Payment confirmation failed.",
            code: substatus,
          },
          result.code || 500
        );
      } catch (e: any) {
        console.error("checkout.confirm error:", e);
        return json({ error: "Internal server error" }, 500);
      }
    }

    // ── POST /api/webhooks ──
    if (path === "/api/webhooks" && req.method === "POST") {
      try {
        const body = (await req.json()) as {
          uid: string;
          type: string;
          createdAt: number;
          data: Record<string, any>;
        };
        // Log full payload to verify field names (data._reqId, data.data?.checkoutId, etc.)
        console.log("[webhook]", JSON.stringify(body, null, 2));

        const { type, data } = body;
        const trackingId = data?._reqId ?? data?.trackingId ?? data?.requestId;
        if (!trackingId) {
          console.warn("[webhook] No tracking id in payload, skipping");
          return json({ received: true });
        }

        const tracking = await readOrderTrackingByTrackingId(trackingId);
        if (!tracking) {
          console.warn("[webhook] No order_tracking for trackingId:", trackingId);
          return json({ received: true });
        }

        switch (type) {
          case "checkout.create.success":
            await updateOrderTracking(tracking.order_id, {
              status: "create_success",
              substatus: "create_success",
              checkout_id: data?.data?.checkoutId ?? data?.checkoutId ?? undefined,
              tracking_id: data?._reqId ?? tracking.tracking_id ?? undefined,
            });
            break;
          case "checkout.create.failure":
            await updateOrderTracking(tracking.order_id, {
              status: "queued",
              substatus: "create_failure",
              checkout_id: null,
              retry_count: (tracking.retry_count ?? 0) + 1,
            });
            break;
          case "checkout.confirm.success":
            await updateOrderTracking(tracking.order_id, {
              status: "completed",
              substatus: "confirm_success",
              confirmation_id: data?.data?.confirmationId ?? data?.confirmationId ?? undefined,
              error: null,
            });
            break;
          case "checkout.confirm.failure":
            await updateOrderTracking(tracking.order_id, {
              status: "queued",
              substatus: "confirm_failure",
              checkout_id: null,
              retry_count: (tracking.retry_count ?? 0) + 1,
            });
            break;
          default:
            console.log("[webhook] Unhandled event type:", type);
        }

        return json({ received: true });
      } catch (e: any) {
        console.error("Webhook error:", e);
        return json({ error: "Webhook processing failed" }, 500);
      }
    }

    // ── GET /api/checkout/status/:trackingId ──
    if (path.startsWith("/api/checkout/status/") && req.method === "GET") {
      const trackingId = path.split("/").pop();
      if (!trackingId) return json({ error: "trackingId required" }, 400);

      const record = checkoutStore.get(trackingId);
      if (!record) return json({ error: "Checkout not found" }, 404);

      return json({
        trackingId,
        status: record.status,
        checkoutId: record.checkoutId,
        confirmationId: record.confirmationId,
        error: record.error,
      });
    }

    return json({ error: "Not found" }, 404);
}

// ─── Node HTTP server (tsx) ───
async function nodeRequestFromIncoming(
  nodeReq: http.IncomingMessage
): Promise<Request> {
  const url = new URL(
    nodeReq.url ?? "/",
    `http://${nodeReq.headers.host ?? "localhost"}`
  );
  const chunks: Buffer[] = [];
  for await (const chunk of nodeReq) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(url.toString(), {
    method: nodeReq.method ?? "GET",
    headers: nodeReq.headers as Record<string, string>,
    body: body?.length ? body : undefined,
  });
}

async function sendResponse(
  nodeRes: http.ServerResponse,
  response: Response
): Promise<void> {
  nodeRes.statusCode = response.status;
  response.headers.forEach((value, key) => nodeRes.setHeader(key, value));
  const buf = await response.arrayBuffer();
  nodeRes.end(Buffer.from(buf));
}

const server = http.createServer(async (nodeReq, nodeRes) => {
  try {
    const req = await nodeRequestFromIncoming(nodeReq);
    const res = await handleRequest(req);
    await sendResponse(nodeRes, res);
  } catch (e) {
    console.error("Request error:", e);
    nodeRes.statusCode = 500;
    nodeRes.setHeader("Content-Type", "application/json");
    nodeRes.end(JSON.stringify({ error: "Internal server error" }));
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other process or set PORT to a different number.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Virellio backend running on http://localhost:${PORT}`);
  void registerWebhooks();
});