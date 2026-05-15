import axios, { AxiosError } from "axios";
import { Product } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Meta WhatsApp Cloud API
// ─────────────────────────────────────────────────────────────────────────────

const WA_TOKEN = process.env.META_WHATSAPP_TOKEN!;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID!;
const API_VERSION = "v19.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const headers = () => ({
  Authorization: `Bearer ${WA_TOKEN}`,
  "Content-Type": "application/json",
});

// ── Retry helper with exponential backoff and jitter ─────────────────────────
async function postWithRetry(
  url: string,
  data: any,
  config: Record<string, any>,
  retries = 3,
  baseBackoff = 1000
): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.post(url, data, config);
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      // Only retry on network errors, 429, or 5xx
      if (
        attempt === retries ||
        (status && status !== 429 && status < 500)
      ) {
        throw error;
      }
      // Exponential backoff + jitter (random 0-500ms) to avoid thundering herd
      const delay =
        baseBackoff * Math.pow(2, attempt - 1) + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ── Typing indicator ────────────────────────────────────────────────────────
/**
 * Sends a "typing" or "paused" status to the user.
 * Call this **before** making a slow AI call (e.g. NVIDIA NIM) to keep the user engaged.
 */
export async function sendTypingIndicator(
  to: string,
  status: "typing" | "paused" = "typing"
): Promise<void> {
  await postWithRetry(
    BASE_URL,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "typing",
      status,
    },
    { headers: headers(), timeout: 10_000 }
  );
}

// ── Plain text message ──────────────────────────────────────────────────────
export async function sendTextMessage(
  to: string,
  body: string
): Promise<void> {
  await postWithRetry(
    BASE_URL,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    },
    { headers: headers(), timeout: 15_000 }
  );
}

// ── Interactive product list (with category grouping) ───────────────────────
export async function sendProductListMessage(
  to: string,
  products: Product[]
): Promise<void> {
  const activeProducts = products.filter((p) => p.is_active);

  // Group by category, enforcing WhatsApp limits: max 10 sections, 10 rows each
  const grouped = activeProducts.reduce<Record<string, Product[]>>(
    (acc, p) => {
      const cat = p.category;
      if (!acc[cat]) acc[cat] = [];
      if (acc[cat].length < 10) acc[cat].push(p); // max 10 rows per section
      return acc;
    },
    {}
  );

  const sections = Object.entries(grouped)
    .slice(0, 10) // max 10 sections
    .map(([title, items]) => ({
      title,
      rows: items.map((p) => ({
        id: `buy_${p.id}`,
        title: p.name.substring(0, 24),
        description: `Ksh ${p.selling_price} — ${(p.description ?? "").substring(0, 72)}`,
      })),
    }));

  await postWithRetry(
    BASE_URL,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "📦 Available Packages" },
        body: {
          text: "Select a package below to purchase. You'll receive an M-Pesa STK Push to complete payment.",
        },
        footer: { text: "Reply 'help' anytime for assistance." },
        action: {
          button: "View Packages",
          sections,
        },
      },
    },
    { headers: headers(), timeout: 15_000 }
  );
}

// ── Category selection (for scaling beyond 10 sections) ─────────────────────
/**
 * When you have many categories (>10) or many products per category,
 * show a category list first. User picks a category → bot replies with
 * only the products in that category using sendProductListMessage.
 */
export async function sendCategorySelectionMessage(
  to: string,
  categories: string[]
): Promise<void> {
  const rows = categories.slice(0, 10).map((cat) => ({
    id: `cat_${cat.replace(/\s+/g, "_")}`,
    title: cat.substring(0, 24),
  }));

  await postWithRetry(
    BASE_URL,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "📂 Choose Category" },
        body: {
          text: "Pick a category to see available bundles.",
        },
        footer: { text: "You can always go back by typing 'menu'." },
        action: {
          button: "Categories",
          sections: [
            {
              title: "Package Categories",
              rows,
            },
          ],
        },
      },
    },
    { headers: headers(), timeout: 15_000 }
  );
}

// ── Purchase confirmation ──────────────────────────────────────────────────
export async function sendConfirmationMessage(
  to: string,
  productName: string,
  amount: number,
  mpesaReceipt: string
): Promise<void> {
  const msg =
    `✅ *Payment Confirmed!*\n\n` +
    `Package: *${productName}*\n` +
    `Amount: *Ksh ${amount}*\n` +
    `M-Pesa Receipt: *${mpesaReceipt}*\n\n` +
    `⏳ Activating your bundle now… You'll get a confirmation shortly.\n\n` +
    `For help call or WhatsApp: ${process.env.NEXT_PUBLIC_SUPPORT_PHONE}`;

  await sendTextMessage(to, msg);
}

// ── Fulfillment success ────────────────────────────────────────────────────
export async function sendFulfillmentSuccessMessage(
  to: string,
  productName: string
): Promise<void> {
  const msg =
    `🎉 *Bundle Activated!*\n\n` +
    `Your *${productName}* has been successfully activated.\n` +
    `Enjoy your bundle! 🚀\n\n` +
    `Reply *menu* to see more packages.`;

  await sendTextMessage(to, msg);
}

// ── STK Push prompt ────────────────────────────────────────────────────────
export async function sendSTKPromptMessage(
  to: string,
  productName: string,
  amount: number
): Promise<void> {
  const msg =
    `💳 *M-Pesa Payment Request Sent*\n\n` +
    `Package: *${productName}*\n` +
    `Amount: *Ksh ${amount}*\n\n` +
    `📱 Check your phone for the M-Pesa PIN prompt and enter your PIN to confirm.\n\n` +
    `_The prompt expires in 60 seconds._`;

  await sendTextMessage(to, msg);
}

// ── System busy banner ─────────────────────────────────────────────────────
export async function sendSystemBusyMessage(to: string): Promise<void> {
  const msg =
    `⚠️ *System Busy*\n\n` +
    `Our bundle activation system is currently in manual mode. Your payment will be processed, but activation may take a few extra minutes.\n\n` +
    `For urgent help: ${process.env.NEXT_PUBLIC_SUPPORT_PHONE}`;

  await sendTextMessage(to, msg);
}

// ── Payment failure ────────────────────────────────────────────────────────
export async function sendPaymentFailedMessage(
  to: string,
  reason: string
): Promise<void> {
  const msg =
    `❌ *Transaction Failed*\n\n` +
    `Reason: ${reason}\n\n` +
    `No money was deducted. Please try again or contact support:\n` +
    `${process.env.NEXT_PUBLIC_SUPPORT_PHONE}`;

  await sendTextMessage(to, msg);
}

// ── AI conversational response (NVIDIA NIM) ─────────────────────────────────
/**
 * Recommended flow for integrating NVIDIA NIM:
 * 1. Immediately call `sendTypingIndicator(to, "typing")` when a message arrives.
 * 2. Send the user's message to your NVIDIA NIM endpoint and await the reply.
 * 3. Call `sendAiResponse(to, aiText, readyToBuy, products, { skipTyping: true })`
 *    because you already started typing in step 1.
 *
 * This keeps the "typing…" indicator active throughout the AI processing
 * and avoids overlapping typing requests.
 */
export async function sendAiResponse(
  to: string,
  aiText: string,
  readyToBuy: boolean = false,
  products?: Product[],
  options?: { skipTyping?: boolean }
): Promise<void> {
  // If typing hasn't been started already, start it now (fallback)
  if (!options?.skipTyping) {
    await sendTypingIndicator(to, "typing");
    // Small delay to let the user see the typing bubble (optional)
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  await sendTextMessage(to, aiText);

  // Pause typing before sending the product list or ending
  await sendTypingIndicator(to, "paused");

  if (readyToBuy && products && products.length > 0) {
    await sendProductListMessage(to, products);
  }
}