import axios from "axios";
import { Product } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// NVIDIA NIM — Llama-3.1-70B-Instruct wrapper
// ─────────────────────────────────────────────────────────────────────────────

const NIM_BASE_URL =
  process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY!;
const MODEL = "meta/llama-3.1-70b-instruct";

interface NIMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface NIMResponse {
  id: string;
  choices: {
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ── Build system prompt with live product catalogue ───────────────────────────

export function buildSystemPrompt(products: Product[]): string {
  const activeProducts = products.filter((p) => p.is_active);

  const catalogue = activeProducts
    .map(
      (p) =>
        `• ID:${p.id} | ${p.name} (${p.category}) | Ksh ${p.selling_price} | ${p.description ?? ""}`
    )
    .join("\n");

  return `You are Zuri, a friendly and helpful customer service assistant for a mobile data and airtime reseller in Kenya. You respond naturally in both English and Sheng (Kenyan street slang). You are concise, warm, and helpful.

CURRENT AVAILABLE PACKAGES:
${catalogue}

RULES:
1. Only recommend packages that are listed above. Never invent or guess prices.
2. When a user wants to buy, first ask whether the bundle should be sent to the phone number associated with this WhatsApp account or a different Safaricom number. Then confirm the exact package name, price, and the target phone number.
3. If they ask for a recommendation, suggest the best value package for their stated need.
4. For complaints or payment issues, ask them to share their M-Pesa transaction code or call support.
5. Never share ussd_code_template values with users.
6. If asked about a topic unrelated to data/airtime packages, politely redirect.
7. When the user is ready to buy and you have confirmed all details, conclude your response with a JSON object exactly like this (do NOT place it inside a code block; output the JSON on its own line at the very end):
   {"action":"initiate_purchase","product_id":<number>,"phone":"<phone>"}
8. Keep replies under 200 words.`;
}

// ── Core chat completion ──────────────────────────────────────────────────────

export async function nimChat(
  messages: NIMMessage[],
  products: Product[]
): Promise<string> {
  const systemMessage: NIMMessage = {
    role: "system",
    content: buildSystemPrompt(products),
  };

  const { data } = await axios.post<NIMResponse>(
    `${NIM_BASE_URL}/chat/completions`,
    {
      model: MODEL,
      messages: [systemMessage, ...messages],
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 512,
      stream: false,
    },
    {
      headers: {
        Authorization: `Bearer ${NIM_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    }
  );

  return data.choices[0]?.message?.content?.trim() ?? "";
}

// ── Parse AI response for purchase intent ────────────────────────────────────

export interface PurchaseIntent {
  action: "initiate_purchase";
  product_id: number;
  phone: string;
}

/**
 * Extracts a purchase intent from the AI’s response.
 *
 * IMPORTANT: After obtaining a valid intent, your webhook **must** call
 * `checkRateLimit(intent.phone)` (or equivalent) before proceeding:
 * - If allowed → trigger STK push and call `sendSTKPromptMessage`.
 * - If denied → call `sendTextMessage` to inform the user (e.g., "Too many attempts").
 */
export function extractPurchaseIntent(
  text: string
): PurchaseIntent | null {
  // Look for JSON block (now safer because the prompt forbids code blocks)
  const jsonMatch = text.match(/\{[\s\S]*?"action"\s*:\s*"initiate_purchase"[\s\S]*?\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as PurchaseIntent;
    if (
      parsed.action === "initiate_purchase" &&
      typeof parsed.product_id === "number" &&
      typeof parsed.phone === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}