import "./bun-polyfill";
import http from "http";
import { config } from "./config";
import { handleGetProducts, handlePostOrder } from "./routes/orderRoutes";
import { handleWebhook } from "./routes/webhookHandler";
import { corsHeaders, json } from "./lib/response";
import { nodeRequestFromIncoming, sendResponse } from "./lib/httpAdapter";

const { webhookBaseUrl, port: PORT } = config;

async function registerWebhooks(): Promise<void> {
  try {
    const webhookUrl = `${webhookBaseUrl}/api/webhooks`;
    const { PaymentProcessor } = await import("@henrylabs-interview/payments");
    const processor = new PaymentProcessor({
      apiKey: config.apiKey,
    });
    const success = await processor.webhooks.createEndpoint({
      url: webhookUrl,
      events: [
        "checkout.create.success",
        "checkout.create.failure",
        "checkout.confirm.success",
        "checkout.confirm.failure",
      ],
      secret: config.webhookSecret,
    });
    console.log(`Webhooks registered: ${success} (${webhookUrl})`);
  } catch (e) {
    console.error("Failed to register webhooks:", e);
  }
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (path === "/api/products" && req.method === "GET") {
    return handleGetProducts();
  }
  if (path === "/api/order" && req.method === "POST") {
    return handlePostOrder(req);
  }
  if (path === "/api/webhooks" && req.method === "POST") {
    return handleWebhook(req);
  }

  return json({ error: "Not found" }, 404);
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
    console.error(
      `Port ${PORT} is already in use. Stop the other process or set PORT to a different number.`
    );
    process.exit(1);
  }
  throw err;
});

console.log("Backend starting...");
server.listen(PORT, () => {
  console.log(`Virellio backend running on http://localhost:${PORT}`);
  void registerWebhooks();
});
