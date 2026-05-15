// ─────────────────────────────────────────────────────────────────────────────
// Application-wide TypeScript types
// ─────────────────────────────────────────────────────────────────────────────

export type TransactionStatus =
  | "PENDING"
  | "PAID"
  | "FULFILLING"
  | "SUCCESS"
  | "FAILED";

export interface Product {
  id: number;
  name: string;
  category: string;
  selling_price: number;
  cost_price: number;
  ussd_code_template: string;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  checkout_request_id: string | null;
  merchant_request_id: string | null;
  user_phone: string;
  product_id: number;
  status: TransactionStatus;
  mpesa_receipt: string | null;
  amount: number;
  failure_reason: string | null;
  whatsapp_notified: boolean;
  created_at: string;
  updated_at: string;
  product?: Product;
}

export interface SystemStatus {
  id: number;
  worker_last_heartbeat: string | null;
  battery_level: number | null;
  is_phone_online: boolean;
  device_model: string | null;
  android_version: string | null;
  app_version: string | null;
  updated_at: string;
}

// ── Daraja / M-Pesa ───────────────────────────────────────────────────────────

export interface STKPushRequest {
  phone: string;
  product_id: number;
}

export interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface DarajaCallbackItem {
  Name: string;
  Value?: string | number;
}

export interface DarajaCallback {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: DarajaCallbackItem[];
      };
    };
  };
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface Analytics {
  total_revenue: number;
  total_cost: number;
  net_profit: number;
  total_transactions: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
  fulfilling_count: number;
  success_rate: number;
  today_revenue: number;
  today_transactions: number;
  revenue_by_category: { category: string; revenue: number }[];
  daily_revenue: { date: string; revenue: number; transactions: number }[];
}

// ── Worker ────────────────────────────────────────────────────────────────────

export interface WorkerHeartbeatPayload {
  battery_level: number;
  is_phone_online: boolean;
  device_model?: string;
  android_version?: string;
  app_version?: string;
}

export interface WorkerTask {
  transaction_id: number;
  user_phone: string;
  ussd_code: string; // template already resolved with phone number
}

export interface WorkerCompletePayload {
  transaction_id: number;
  success: boolean;
  failure_reason?: string;
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────

export interface WhatsAppWebhookEntry {
  id: string;
  changes: {
    value: {
      messaging_product: string;
      metadata: { display_phone_number: string; phone_number_id: string };
      contacts?: { profile: { name: string }; wa_id: string }[];
      messages?: WhatsAppMessage[];
      statuses?: WhatsAppStatus[];
    };
    field: string;
  }[];
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "interactive" | "button";
  text?: { body: string };
  interactive?: {
    type: "list_reply" | "button_reply";
    list_reply?: { id: string; title: string };
    button_reply?: { id: string; title: string };
  };
}

export interface WhatsAppStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}

// ── API Responses ─────────────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;
