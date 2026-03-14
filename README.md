# Virellio Shoes

E-commerce checkout app: React frontend, Node backend, and a background worker that processes payments through an unreliable payment API. Orders are confirmed immediately; payment create/confirm and retries run asynchronously via a queue and webhooks.

## Running locally

Run these in **three separate terminals** (backend and worker share the same directory). Copy `backend/.env.example` to `backend/.env` and fill in values before starting.

```bash
# Terminal 1 – API server (port 3000)
cd backend && bun install && bun run start

# Terminal 2 – Queue worker (polls every 5s)
cd backend && bun run worker

# Terminal 3 – Frontend (port 5173, proxies /api to backend)
cd frontend && bun install && bun run dev
```

Then open **http://localhost:5173**. API examples: [backend/API_TESTING.md](backend/API_TESTING.md).

## Architecture

The system decouples payment collection from payment processing entirely. When a customer submits an order, the frontend receives a confirmation immediately — before the payment processor is ever contacted. A background worker and webhook-driven pipeline handle the unreliable payment flow asynchronously.

```
Customer → React Frontend → Backend (durable write: orders + order_tracking + queue)
                                                        ↓
                                              returns orderId → Frontend shows success
                                                        ↓
                                              Background Worker (polls queue)
                                                        ↓
                                              Henry Labs Payment API
                                                        ↓
                                              Webhook → Backend → DB update
                                                        ↓
                                              State machine drives all downstream transitions
```

### Why this design?

The payment processor fails most of the time. If the frontend waited for a successful payment before showing a confirmation, the user would stare at a spinner for minutes while the backend retried dozens of times. Instead:

1. The frontend submits the order; the backend performs durable writes (orders, order_tracking, queue) and returns success with an order ID immediately.
2. The frontend shows confirmation and is done — no polling. The user gets a confirmation ID and can leave.
3. All downstream work (payment create/confirm, retries, webhooks) is handled by the backend and worker; the state machine in `order_tracking` drives transitions until a terminal state.

## Payment flow

The system uses a state machine tracked in the `order_tracking` table. Every state transition is written to the database. The queue message stays alive until the order reaches a terminal state (`completed` or `failed`).

```
queued → pending → create_success → completed
  ↑        ↓           ↓               
  ↑     (webhook)   awaiting_webhook → completed
  ↑        ↓           ↓
  └── create_failure   confirm failure (retry from scratch)
```

### Step by step

**1. Order creation (synchronous, fast)**

Frontend submits order → backend writes to `orders` table + `order_tracking` (status: `queued`) + enqueues `orderId` to pgmq → returns `orderId` to frontend.

**2. checkout.create() (worker, retried via queue)**

The worker polls the queue every 5 seconds. It picks up the order, reads card details from the database, and calls `checkout.create()`. This call fails with fraud rejections roughly 95% of the time. When it fails, the worker does not delete the queue message — pgmq's visibility timeout causes it to reappear after 30 seconds, and the worker tries again. This continues until the call succeeds or the retry limit (80 attempts) is reached.

On success, the API returns a `trackingId` and either `201-immediate` (rare) or `202-deferred` (common). For deferred responses, the worker registers a webhook endpoint and waits for Henry Labs to notify us of the result.

**3. Webhook notification**

Henry Labs posts to our `/api/webhooks` endpoint when `checkout.create` or `checkout.confirm` resolves. The webhook handler writes to the database; on `checkout.create.success` it also enqueues so the worker proceeds to confirm. It does not call external payment APIs. When the worker picks up the message (or the same message reappears via visibility timeout) and sees the status updated by the webhook, it proceeds to the next step.

- `checkout.create.success` → status becomes `create_success`, webhook writes `checkoutId`
- `checkout.create.failure` → status resets to `queued`, worker retries from scratch

**4. checkout.confirm() (worker, triggered by status change)**

When the worker sees `create_success`, it decrypts the stored card number and calls `checkout.confirm()` with the raw card details and the `checkoutId` from the previous step.

- `201-immediate` → payment complete, order fulfilled, message deleted from queue
- `202-deferred` → status becomes `awaiting_webhook`, wait for confirm webhook
- `502-fraud` / `503-retry` → stay in `create_success`, message reappears, retry confirm
- `500-error` → terminal failure

**5. Frontend**

The frontend does not poll. After the backend returns the order ID, it shows the confirmation screen and the flow is complete from the user’s perspective. All further processing is handled by the worker and state machine; optional status APIs (e.g. for support or future “track order” UI) read from `order_tracking`.

## Key design decisions

**Queue message lifecycle.** Messages are only deleted on terminal states (`completed` or `failed`). In all other states — pending, awaiting webhook, retrying — the message stays in the queue and reappears via pgmq's visibility timeout. *The alternative is deleting messages when entering a webhook-waiting state and re-enqueuing from the webhook handler. I chose to keep messages alive because it eliminates a failure mode: if the webhook never fires, the worker still revisits the order via visibility timeout. The cost is a lightweight DB read every 30 seconds per pending order — negligible compared to a stuck order.*

**Webhook handler does not call payment APIs.** The webhook only updates the database (and on `checkout.create.success` enqueues so the worker runs confirm). The worker is the only entity that calls the Henry Labs API; webhook and worker coordinate via the database and queue.

**Card encryption at rest.** Credit card numbers are encrypted with AES-256-GCM before being stored in the database. The worker decrypts them at processing time.

**Single webhook registration at server startup.** Rather than registering a webhook per order, the server registers once for all event types (`checkout.create.success`, `checkout.create.failure`, `checkout.confirm.success`, `checkout.confirm.failure`). The webhook handler uses the `trackingId` in the payload to match events to orders. *Per-order registration would be more precise but adds an API call to every order and creates a coupling between the worker and webhook lifecycle. A single global registration keeps the worker focused on payment calls only.*

**Separate tables for orders and tracking.** The `orders` table holds what the customer submitted (including sensitive card data). The `order_tracking` table holds processing state. Any status or tracking API reads only from `order_tracking` — card data is never exposed.

## Failure scenarios

| Scenario | System behavior |
|----------|----------------|
| Payment API rejects 20 consecutive requests | Worker retries via queue visibility timeout; order stays in `queued` until success or retry limit |
| Webhook never fires after checkout.create | Queue message reappears every 30s; worker re-checks status and can re-attempt create |
| Backend crashes mid-processing | Queue message was never deleted; reappears after visibility timeout; worker resumes from last DB state |
| Duplicate webhook delivery | Handler is idempotent — writing `completed` twice is a no-op |
| Worker and webhook update DB simultaneously | Both write to `order_tracking`; last-write-wins on status; worker always re-reads before acting |

## Tech stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Bun + TypeScript (HTTP server)
- **Database**: Supabase (PostgreSQL)
- **Queue**: pgmq (Postgres-native message queue via Supabase)
- **Encryption**: Node.js crypto (AES-256-GCM)
- **Payment SDK**: `@henrylabs-interview/payments`

## Project structure

```
├── backend/
│   ├── index.ts                 # HTTP server, routes, webhook handler
│   ├── worker.ts                # Queue polling + payment processing
│   ├── config.ts                # Environment configuration
│   ├── services/
│   │   ├── orders.ts            # Orders table CRUD
│   │   ├── orderTracking.ts     # Order tracking table CRUD
│   │   └── queue.ts             # pgmq read/delete/enqueue wrappers
│   ├── utils/
│   │   └── encryption.ts        # AES-256-GCM encrypt/decrypt
│   └── db/
│       └── supabase/
│           └── migrations/
│               ├── ..._create_orders_table.sql
│               ├── ..._create_orders_tracking_table.sql
│               ├── ..._create_payment_queue.sql
│               ├── ..._send_to_payment_queue_function.sql
│               └── ..._public_pgmq_read_delete.sql
├── frontend/
│   └── src/
│       ├── App.tsx               # Shop, checkout form, confirmation
│       ├── api.ts                # Backend API client
│       └── ...
└── README.md
```

## Database schema

**orders** — customer submission and payment details

| Column | Type | Description |
|--------|------|-------------|
| order_id | UUID (PK) | Returned to customer as confirmation |
| full_name | text | Cardholder name |
| email_address | text | Customer email |
| credit_card_number | text | AES-256-GCM encrypted |
| expiration_month | integer | Card expiry month (1-12) |
| expiration_year | integer | Card expiry year |
| cvv | text | Card security code |
| amount | integer | Amount in cents |
| currency | text | USD, EUR, etc. |

**order_tracking** — processing state machine

| Column | Type | Description |
|--------|------|-------------|
| order_id | UUID (PK, FK) | References orders |
| tracking_id | text | `_reqId` from payment API |
| status | text | queued, pending, create_success, awaiting_webhook, completed, failed |
| substatus | text | API response code (201-immediate, 202-deferred, 502-fraud, etc.) |
| checkout_id | text | From checkout.create success |
| confirmation_id | text | From checkout.confirm success |
| error | text | Last error message |
| retry_count | integer | Number of attempts |
| updated_at | timestamptz | Last state change |

## AI usage

Claude (Anthropic) was used throughout development as an architectural thinking partner. It was most helpful for boile-plate, scaffolding out architecture, and quickly logging and inspecting logs. It was occasionally misleading on the exact shape of the Henry Labs SDK webhook payloads — the actual `data` field nesting had to be verified by logging real webhook deliveries. All code was reviewed and understood before committing.
