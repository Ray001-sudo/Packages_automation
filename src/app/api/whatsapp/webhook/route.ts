import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { nimChat, extractPurchaseIntent } from "@/lib/nvidia-nim";
import {
  sendTextMessage,
  sendProductListMessage,
  sendSTKPromptMessage,
} from "@/lib/whatsapp";
import { initiateSTKPush, normalisePhone } from "@/lib/daraja";
import { checkRateLimit } from "@/lib/rate-limiter";
import { Product, SystemStatus, WhatsAppWebhookEntry } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Webhook
// GET  — webhook verification (Meta challenge)
// POST — incoming messages
// ─────────────────────────────────────────────────────────────────────────────

// In-memory conversation histories (keyed by phone)
// For production scale, move to Redis or a DB table
const conversationHistories = new Map<
  string,
  { role: "user" | "assistant"; content: string }[]
>();

const MAX_HISTORY = 10; // last N messages per user

// ── GET: Webhook verification ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// ── POST: Handle incoming messages ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { object: string; entry: WhatsAppWebhookEntry[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }

  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ success: false }, { status: 200 });
  }

  // Process each entry/change asynchronously (don't block Meta's 20s timeout)
  processEntries(body.entry).catch((e) =>
    console.error("[WhatsApp webhook] Processing error:", e)
  );

  // Immediately acknowledge to Meta
  return NextResponse.json({ success: true }, { status: 200 });
}

async function processEntries(entries: WhatsAppWebhookEntry[]) {
  for (const entry of entries) {
    for (const change of entry.changes) {
      const { messages, statuses } = change.value;

      if (statuses) continue; // Ignore delivery receipts

      if (!messages || messages.length === 0) continue;

      for (const message of messages) {
        await handleMessage(message.from, message).catch((e) =>
          console.error(`[WhatsApp] Failed to handle message from ${message.from}:`, e)
        );
      }
    }
  }
}

async function handleMessage(
  from: string,
  message: NonNullable<WhatsAppWebhookEntry["changes"][0]["value"]["messages"]>[0]
) {
  // Extract text content from message
  let userText = "";
  if (message.type === "text" && message.text?.body) {
    userText = message.text.body.trim();
  } else if (
    message.type === "interactive" &&
    message.interactive?.list_reply
  ) {
    // User selected a package from the interactive list
    const selectedId = message.interactive.list_reply.id;
    if (selectedId.startsWith("buy_")) {
      const productId = parseInt(selectedId.replace("buy_", ""), 10);
      await handleProductSelection(from, productId);
      return;
    }
    userText = message.interactive.list_reply.title;
  } else if (
    message.type === "interactive" &&
    message.interactive?.button_reply
  ) {
    userText = message.interactive.button_reply.title;
  }

  if (!userText) return;

  // ── Special commands ────────────────────────────────────────────────────────
  const lower = userText.toLowerCase();

  if (lower === "menu" || lower === "packages" || lower === "buy") {
    const products = await query<Product>(
      `SELECT * FROM products WHERE is_active = true ORDER BY category, selling_price`
    );
    await sendProductListMessage(from, products);
    return;
  }

  if (lower === "status") {
    await handleStatusCheck(from);
    return;
  }

  // ── AI chat (NVIDIA NIM) ────────────────────────────────────────────────────
  const products = await query<Product>(
    `SELECT * FROM products WHERE is_active = true ORDER BY category, selling_price`
  );

  // Check worker status for system busy warning
  const systemStatus = await queryOne<SystemStatus>(
    `SELECT worker_last_heartbeat FROM system_status WHERE id = 1`
  );
  const workerIsAlive =
    systemStatus?.worker_last_heartbeat &&
    new Date().getTime() -
      new Date(systemStatus.worker_last_heartbeat).getTime() <
      2 * 60 * 1000;

  // Maintain conversation history
  const history = conversationHistories.get(from) ?? [];
  history.push({ role: "user", content: userText });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

  const aiResponse = await nimChat(history, products);
  history.push({ role: "assistant", content: aiResponse });
  conversationHistories.set(from, history);

  // Check if AI wants to initiate a purchase
  const intent = extractPurchaseIntent(aiResponse);
  if (intent) {
    await handlePurchaseFromBot(from, intent.product_id, intent.phone);
    return;
  }

  // Prepend system busy banner if applicable
  let finalResponse = aiResponse;
  if (!workerIsAlive) {
    finalResponse =
      `⚠️ *System Notice:* Bundle activation is in manual mode — slight delays expected.\n\n` +
      aiResponse;
  }

  await sendTextMessage(from, finalResponse);
}

async function handleProductSelection(from: string, productId: number) {
  // Ask for phone number
  const product = await queryOne<Product>(
    `SELECT * FROM products WHERE id = $1 AND is_active = true`,
    [productId]
  );

  if (!product) {
    await sendTextMessage(
      from,
      "Sorry, that package is no longer available. Reply *menu* to see current packages."
    );
    return;
  }

  // Store pending selection in history
  const history = conversationHistories.get(from) ?? [];
  history.push({
    role: "assistant",
    content: `User selected: ${product.name} (ID:${product.id}) at Ksh ${product.selling_price}`,
  });
  history.push({
    role: "user",
    content: `__PENDING_PRODUCT__:${product.id}`,
  });
  conversationHistories.set(from, history);

  await sendTextMessage(
    from,
    `Great choice! 📦 *${product.name}* — Ksh ${product.selling_price}\n\n` +
      `Please reply with the phone number to receive this bundle (e.g. 0712345678):`
  );
}

async function handlePurchaseFromBot(
  from: string,
  productId: number,
  phone: string
) {
  let normalisedPhone: string;
  try {
    normalisedPhone = normalisePhone(phone);
  } catch {
    await sendTextMessage(
      from,
      `❌ Invalid phone number: *${phone}*. Please use format: 07XXXXXXXX`
    );
    return;
  }

  const rateCheck = await checkRateLimit(normalisedPhone);
  if (!rateCheck.allowed) {
    await sendTextMessage(
      from,
      `⏳ Please wait ${rateCheck.retryAfterSeconds}s before making another purchase request.`
    );
    return;
  }

  const product = await queryOne<Product>(
    `SELECT * FROM products WHERE id = $1 AND is_active = true`,
    [productId]
  );

  if (!product) {
    await sendTextMessage(
      from,
      "Sorry, that package is no longer available. Reply *menu* to see current options."
    );
    return;
  }

  // Create PENDING transaction
  const [tx] = await query<{ id: number }>(
    `INSERT INTO transactions (user_phone, product_id, amount, status)
     VALUES ($1, $2, $3, 'PENDING') RETURNING id`,
    [normalisedPhone, productId, product.selling_price]
  );

  try {
    const stkResponse = await initiateSTKPush(
      normalisedPhone,
      Number(product.selling_price),
      `ORDER-${tx.id}`,
      `Payment for ${product.name}`
    );

    await query(
      `UPDATE transactions SET checkout_request_id = $1, merchant_request_id = $2, updated_at = NOW() WHERE id = $3`,
      [stkResponse.CheckoutRequestID, stkResponse.MerchantRequestID, tx.id]
    );

    await sendSTKPromptMessage(from, product.name, Number(product.selling_price));
  } catch (err) {
    await query(
      `UPDATE transactions SET status = 'FAILED', failure_reason = $1, updated_at = NOW() WHERE id = $2`,
      [(err as Error).message, tx.id]
    );
    await sendTextMessage(
      from,
      `❌ Could not initiate payment. Please try again or contact support: ${process.env.NEXT_PUBLIC_SUPPORT_PHONE}`
    );
  }
}

async function handleStatusCheck(from: string) {
  const transactions = await query<{
    status: string;
    amount: number;
    product_name: string;
    created_at: string;
  }>(
    `SELECT t.status, t.amount, p.name as product_name, t.created_at
     FROM transactions t
     JOIN products p ON p.id = t.product_id
     WHERE t.user_phone = $1
     ORDER BY t.created_at DESC
     LIMIT 3`,
    [from]
  );

  if (transactions.length === 0) {
    await sendTextMessage(from, "You have no recent transactions.");
    return;
  }

  const lines = transactions.map((tx) => {
    const statusEmoji: Record<string, string> = {
      SUCCESS: "✅",
      FAILED: "❌",
      PENDING: "⏳",
      PAID: "💳",
      FULFILLING: "⚙️",
    };
    const emoji = statusEmoji[tx.status] ?? "•";
    const date = new Date(tx.created_at).toLocaleDateString("en-KE");
    return `${emoji} ${tx.product_name} — Ksh ${tx.amount} (${tx.status}) — ${date}`;
  });

  await sendTextMessage(
    from,
    `📊 *Your Recent Orders:*\n\n${lines.join("\n")}\n\nReply *menu* to buy more.`
  );
}
