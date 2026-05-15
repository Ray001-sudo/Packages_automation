import axios from "axios";
import { STKPushResponse } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Safaricom Daraja API — M-Pesa STK Push
// ─────────────────────────────────────────────────────────────────────────────

const IS_SANDBOX = process.env.MPESA_ENV !== "production";

const BASE_URL = IS_SANDBOX
  ? "https://sandbox.safaricom.co.ke"
  : "https://api.safaricom.co.ke";

const SHORTCODE = process.env.MPESA_SHORTCODE!;
const PASSKEY = process.env.MPESA_PASSKEY!;
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY!;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET!;
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL!;

// ── OAuth Token (cached in-memory for up to 55 minutes) ───────────────────────

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const credentials = Buffer.from(
    `${CONSUMER_KEY}:${CONSUMER_SECRET}`
  ).toString("base64");

  const { data } = await axios.get<{
    access_token: string;
    expires_in: string;
  }>(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    timeout: 10_000,
  });

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (parseInt(data.expires_in) - 60) * 1000,
  };

  return tokenCache.token;
}

// ── Generate Daraja Timestamp & Password ──────────────────────────────────────

function getTimestampAndPassword(): { timestamp: string; password: string } {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const timestamp =
    `${now.getFullYear()}` +
    `${pad(now.getMonth() + 1)}` +
    `${pad(now.getDate())}` +
    `${pad(now.getHours())}` +
    `${pad(now.getMinutes())}` +
    `${pad(now.getSeconds())}`;

  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString(
    "base64"
  );
  return { timestamp, password };
}

// ── Normalise phone to 254XXXXXXXXX ──────────────────────────────────────────

export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    return `254${digits.slice(1)}`;
  }
  if (digits.startsWith("254") && digits.length === 12) {
    return digits;
  }
  if (digits.startsWith("7") && digits.length === 9) {
    return `254${digits}`;
  }
  throw new Error(
    `Invalid phone number format: ${phone}. Use 07XXXXXXXX, 254XXXXXXXXX, or +254XXXXXXXXX.`
  );
}

// ── Initiate STK Push ─────────────────────────────────────────────────────────

export async function initiateSTKPush(
  phone: string,
  amount: number,
  accountReference: string,
  transactionDesc: string
): Promise<STKPushResponse> {
  const normalisedPhone = normalisePhone(phone);
  const token = await getAccessToken();
  const { timestamp, password } = getTimestampAndPassword();

  const payload = {
    BusinessShortCode: SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.ceil(amount), // Safaricom requires integer amounts
    PartyA: normalisedPhone,
    PartyB: SHORTCODE,
    PhoneNumber: normalisedPhone,
    CallBackURL: CALLBACK_URL,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc,
  };

  const { data } = await axios.post<STKPushResponse>(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    }
  );

  if (data.ResponseCode !== "0") {
    throw new Error(
      `STK Push failed: ${data.ResponseDescription} (Code ${data.ResponseCode})`
    );
  }

  return data;
}

// ── Query STK Status (for polling) ────────────────────────────────────────────

export async function querySTKStatus(
  checkoutRequestId: string
): Promise<{ ResultCode: number; ResultDesc: string }> {
  const token = await getAccessToken();
  const { timestamp, password } = getTimestampAndPassword();

  const { data } = await axios.post(
    `${BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15_000,
    }
  );

  return data;
}
