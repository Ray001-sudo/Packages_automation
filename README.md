# DataMart — Fintech Fulfillment Ecosystem

A production-grade Command & Control (C2) platform that bridges **M-Pesa digital payments** with **physical USSD bundle fulfillment** via the Ray Tech Android APK.

---

## System Architecture & Data Flow

```
User Website / WhatsApp Bot
         │
         │  1. Fetch live products from DB
         ▼
   Next.js API (Server)
         │
         │  2. User selects bundle + enters phone
         ▼
   POST /api/mpesa/stk   ──► Safaricom Daraja API
         │                         │
         │  3. STK Push sent        │
         │  Transaction = PENDING   │
         │                         │  4. User enters PIN
         ◄─────────────────────────┘
   POST /api/mpesa/callback
         │
         │  5. Validate: ResultCode=0, Amount matches DB price,
         │     MerchantRequestID matches, idempotency check
         │  Transaction = PAID
         │
         ▼
   Ray Tech APK polls GET /api/worker/next-task  (every 5s)
         │
         │  6. Receives: { ussd_code: "*180*5*2*2547XXXXXXXX*1*1#" }
         │  Dials USSD via Android TelephonyManager
         │  Transaction = FULFILLING
         │
         ▼
   POST /api/worker/complete-task
         │
         │  7. success=true → Transaction = SUCCESS
         │     WhatsApp sends "Bundle Activated 🎉" to user
         │
         │     success=false → Transaction = FAILED
         │     WhatsApp notifies user of failure
         ▼
   Admin Dashboard shows real-time analytics
```

---

## Security Protocols (Anti-Fraud)

| Threat | Protection |
|---|---|
| **Price manipulation** | Server NEVER uses client-submitted price. Price is always looked up from `products` table by `product_id`. |
| **Double fulfillment** | `checkout_request_id` has a `UNIQUE` DB constraint. Second callback for same ID is silently ignored. |
| **Spoofed callbacks** | `MerchantRequestID` from callback must match what was stored when STK was initiated. Mismatch = ignored. |
| **Amount tampering** | Callback `Amount` is compared against `products.selling_price`. Mismatch marks tx `FAILED`. |
| **PIN bombing** | Rate limit: 1 STK request per phone number per 60 seconds, enforced in PostgreSQL. |
| **Worker API abuse** | All worker endpoints require `x-worker-api-key` header. Admin endpoints require `x-admin-key`. |
| **Race conditions** | `SELECT ... FOR UPDATE SKIP LOCKED` ensures only one APK instance can claim a task atomically. |

---

## Setup Instructions

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Safaricom Developer account (sandbox or production)
- Meta WhatsApp Business account
- NVIDIA NIM API key

### 2. Clone & Install

```bash
git clone <repo>
cd fintech-fulfillment
npm install
```

### 3. Environment Variables

```bash
cp .env.example .env.local
# Fill in all values
```

### 4. Database Migration

```bash
# Create database
createdb fintech_fulfillment

# Run migrations (creates tables + seed data)
npm run db:migrate
```

### 5. Development Server

```bash
npm run dev
# App: http://localhost:3000
# Admin: http://localhost:3000/admin
```

### 6. Webhook Setup (Production)

Configure the following in your Safaricom Daraja developer portal:
- **STK Callback URL:** `https://yourdomain.com/api/mpesa/callback`

Configure in Meta WhatsApp Developer Console:
- **Webhook URL:** `https://yourdomain.com/api/whatsapp/webhook`
- **Verify Token:** value of `META_WEBHOOK_VERIFY_TOKEN` in `.env.local`
- **Subscribe to:** `messages`

---

## API Reference

### Public Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/products` | All active products |
| `GET` | `/api/system/status` | Worker heartbeat status |
| `POST` | `/api/mpesa/stk` | Initiate STK Push |
| `POST` | `/api/mpesa/callback` | Daraja callback (Safaricom) |
| `GET` | `/api/user/transaction-status?id=` | Poll tx status |
| `GET/POST` | `/api/whatsapp/webhook` | Meta webhook |

### Worker Endpoints (require `x-worker-api-key`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/worker/heartbeat` | APK reports it's alive |
| `GET` | `/api/worker/next-task` | APK claims next PAID order |
| `POST` | `/api/worker/complete-task` | APK reports fulfillment outcome |

### Admin Endpoints (require `x-admin-key`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/analytics` | Revenue, profit, charts |
| `GET/POST/PUT/DELETE/PATCH` | `/api/admin/products` | Full product CRUD + bulk USSD update |
| `GET` | `/api/admin/transactions` | Paginated transaction list |

---

## Ray Tech APK Integration

The APK should implement this polling loop:

```kotlin
// Heartbeat — every 30 seconds
POST /api/worker/heartbeat
Headers: x-worker-api-key: <key>
Body: {
  "battery_level": 87,
  "is_phone_online": true,
  "device_model": "Samsung Galaxy A14",
  "android_version": "13",
  "app_version": "1.2.0"
}

// Task poll — every 5 seconds
GET /api/worker/next-task
Headers: x-worker-api-key: <key>
Response: {
  "success": true,
  "data": {
    "transaction_id": 42,
    "user_phone": "254712345678",
    "ussd_code": "*180*5*2*254712345678*1*1#",
    "product_name": "1GB Daily"
  }
}
// If data is null, no tasks are pending — sleep and retry

// After USSD dial completes:
POST /api/worker/complete-task
Headers: x-worker-api-key: <key>
Body: {
  "transaction_id": 42,
  "success": true
}
// OR on failure:
Body: {
  "transaction_id": 42,
  "success": false,
  "failure_reason": "USSD timeout after 30s"
}
```

---

## Bulk USSD Code Update (JSON Format)

Upload via Admin Dashboard → Products → "Bulk USSD Update":

```json
[
  { "id": 1, "ussd_code_template": "*180*5*2*{pn}*1*1#" },
  { "id": 2, "ussd_code_template": "*180*5*2*{pn}*2*1#" },
  { "id": 3, "ussd_code_template": "*180*5*2*{pn}*3*1#" }
]
```

The `{pn}` placeholder is replaced with the customer's full phone number (e.g., `254712345678`) at fulfillment time.

---

## WhatsApp Bot Commands

| User Message | Bot Response |
|---|---|
| `menu` / `packages` / `buy` | Interactive list of all active products |
| `status` | Last 3 orders for that phone number |
| Any natural language | NVIDIA NIM (Llama-3.1-70B) handles it |
| Selects package from list | Asks for phone number, initiates STK |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend & API | Next.js 15 (App Router), TypeScript |
| Database | PostgreSQL 14+ |
| Payments | Safaricom Daraja API (M-Pesa STK Push) |
| Messaging | Meta WhatsApp Cloud API |
| AI | NVIDIA NIM — Llama-3.1-70B-Instruct |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Validation | Zod |

---

## Environment Variables Reference

```env
DATABASE_URL               # PostgreSQL connection string
MPESA_CONSUMER_KEY         # Daraja consumer key
MPESA_CONSUMER_SECRET      # Daraja consumer secret
MPESA_SHORTCODE            # M-Pesa shortcode (174379 for sandbox)
MPESA_PASSKEY              # Daraja passkey
MPESA_CALLBACK_URL         # Full public URL to /api/mpesa/callback
MPESA_ENV                  # sandbox | production
META_WHATSAPP_TOKEN        # Permanent WhatsApp token
META_PHONE_NUMBER_ID       # WhatsApp phone number ID
META_WEBHOOK_VERIFY_TOKEN  # Your secret for Meta webhook verification
NVIDIA_NIM_API_KEY         # NVIDIA NIM API key
NVIDIA_NIM_BASE_URL        # https://integrate.api.nvidia.com/v1
NEXT_PUBLIC_APP_URL        # https://yourdomain.com
NEXT_PUBLIC_SUPPORT_PHONE  # +254700000000
NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER  # 254700000000 (no +)
ADMIN_SECRET_KEY           # Strong random string for admin auth
WORKER_API_KEY             # Strong random string for APK auth
```
