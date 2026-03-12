# Backend API – Postman / curl

Run the backend first: `cd backend && bun run start` (default port **3000**).

Base URL: **http://localhost:3000**

---

## 1. GET /api/products

Returns the product catalog.

| Field   | Value                    |
|--------|---------------------------|
| Method | GET                       |
| URL    | `http://localhost:3000/api/products` |
| Headers| none                      |
| Body   | none                      |

**Example response:** Array of products with `id`, `name`, `description`, `keywords`, `imgUrl`, `amount`, `currency`.

---

## 2. POST /api/checkout/create (@henrylabs-interview/payments)

Creates a checkout session (Henry Labs). Use the returned `checkoutId` (or poll status) before calling confirm.

| Field   | Value                    |
|--------|---------------------------|
| Method | POST                      |
| URL    | `http://localhost:3000/api/checkout/create` |
| Headers| `Content-Type: application/json` |
| Body   | JSON (see below)          |

**Body (raw JSON):**
```json
{
  "amount": 1000,
  "currency": "USD",
  "customerId": "cust_optional"
}
```
- `amount` (number, required) – amount in smallest units (e.g. cents for USD).
- `currency` (required) – `"USD"` \| `"EUR"` \| `"JPY"`.
- `customerId` (optional) – string.

**Example success (201-immediate):**
```json
{
  "trackingId": "...",
  "checkoutId": "chk_...",
  "paymentMethodOptions": { ... },
  "status": "created"
}
```
**Example deferred (202):**
```json
{
  "trackingId": "...",
  "status": "pending",
  "message": "Checkout is being processed. Poll for status."
}
```
Save `trackingId` to poll status, or wait for webhooks.

---

## 3. GET /api/checkout/status/:trackingId

Poll checkout/confirm status (e.g. after a deferred create or confirm).

| Field   | Value                    |
|--------|---------------------------|
| Method | GET                       |
| URL    | `http://localhost:3000/api/checkout/status/{{trackingId}}` |
| Headers| none                      |
| Body   | none                      |

Replace `{{trackingId}}` with the `trackingId` from create or confirm.

**Example response:**
```json
{
  "trackingId": "...",
  "status": "created",
  "checkoutId": "chk_...",
  "confirmationId": null,
  "error": null
}
```
`status`: `"pending"` \| `"created"` \| `"confirmed"` \| `"failed"`.

---

## 4. POST /api/checkout/confirm

Confirms a payment with a token (from EmbeddedCheckout in the frontend). In Postman you can only test this after create; use a real `paymentToken` from the UI or the SDK’s test token if documented.

| Field   | Value                    |
|--------|---------------------------|
| Method | POST                      |
| URL    | `http://localhost:3000/api/checkout/confirm` |
| Headers| `Content-Type: application/json` |
| Body   | JSON (see below)          |

**Body (raw JSON):**
```json
{
  "checkoutId": "chk_...",
  "paymentToken": "tok_..."
}
```
- `checkoutId` (required) – from create response.
- `paymentToken` (required) – from EmbeddedCheckout after user enters card (or test token if provided by SDK).

**Example success:**
```json
{
  "trackingId": "...",
  "status": "confirmed",
  "confirmationId": "ord_...",
  "amount": 1000,
  "currency": "USD"
}
```

---

## 5. POST /api/webhooks

Receives Henry Labs webhook events. Used to test that your server accepts and processes events (e.g. from a tool that replays payloads). No auth in this implementation.

| Field   | Value                    |
|--------|---------------------------|
| Method | POST                      |
| URL    | `http://localhost:3000/api/webhooks` |
| Headers| `Content-Type: application/json` |
| Body   | JSON (see below)          |

**Body (raw JSON) – example create.success:**
```json
{
  "uid": "evt_123",
  "type": "checkout.create.success",
  "createdAt": 1234567890,
  "data": {
    "checkoutId": "chk_abc",
    "trackingId": "req_xyz"
  }
}
```
**Other event types:** `checkout.create.failure`, `checkout.confirm.success`, `checkout.confirm.failure`. For confirm events, `data` should include `checkoutId` and (for success) `confirmationId`.

**Example response:** `200` with `{ "received": true }`.

---

## Suggested order in Postman

1. **GET** `/api/products` – sanity check.
2. **POST** `/api/checkout/create` with `{ "amount": 1000, "currency": "USD" }` – copy `trackingId` and, if present, `checkoutId`.
3. **GET** `/api/checkout/status/<trackingId>` – optional; use if create returned `status: "pending"`.
4. **POST** `/api/checkout/confirm` – only with a valid `checkoutId` and `paymentToken` (from frontend or SDK test).
5. **POST** `/api/webhooks` – optional; use to simulate events with the JSON shapes above.
