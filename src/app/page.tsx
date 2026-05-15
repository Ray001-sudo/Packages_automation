"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Smartphone,
  Wifi,
  MessageSquare,
  Phone,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Product, SystemStatus } from "@/types";

// ─── Status Banner ─────────────────────────────────────────────────────────────

function SystemBanner({ busy }: { busy: boolean }) {
  if (!busy) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm text-center py-2 px-4 flex items-center justify-center gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        <strong>Notice:</strong> Bundle activation is in manual mode. Purchases
        still work — activation may take a few extra minutes.
      </span>
    </div>
  );
}

// ─── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onBuy,
}: {
  product: Product;
  onBuy: (p: Product) => void;
}) {
  const categoryColors: Record<string, string> = {
    DATA: "bg-blue-100 text-blue-700",
    AIRTIME: "bg-green-100 text-green-700",
    SMS: "bg-purple-100 text-purple-700",
  };
  const badgeClass =
    categoryColors[product.category] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="card hover:shadow-md transition-shadow flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-start justify-between mb-2">
          <span className={`badge ${badgeClass}`}>{product.category}</span>
          <span className="text-2xl font-bold text-brand-600">
            Ksh {Number(product.selling_price).toFixed(0)}
          </span>
        </div>
        <h3 className="font-semibold text-lg text-gray-900">{product.name}</h3>
        {product.description && (
          <p className="text-sm text-gray-500 mt-1">{product.description}</p>
        )}
      </div>
      <button onClick={() => onBuy(product)} className="btn-primary w-full text-sm py-2.5">
        Buy via M-Pesa
      </button>
    </div>
  );
}

// ─── STK Modal ────────────────────────────────────────────────────────────────

type ModalState = "input" | "loading" | "sent" | "success" | "error";

function STKModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<ModalState>("input");
  const [message, setMessage] = useState("");
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [pollCount, setPollCount] = useState(0);

  // Poll for transaction completion
  useEffect(() => {
    if (state !== "sent" || !transactionId) return;
    if (pollCount > 24) {
      // 2 minutes
      setState("error");
      setMessage("Payment timed out. Please try again.");
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/user/transaction-status?id=${transactionId}`
        );
        const data = await res.json();
        if (data.data?.status === "PAID" || data.data?.status === "FULFILLING") {
          setState("success");
          setMessage("Payment received! Your bundle is being activated.");
        } else if (data.data?.status === "SUCCESS") {
          setState("success");
          setMessage("Bundle activated successfully! 🎉");
        } else if (data.data?.status === "FAILED") {
          setState("error");
          setMessage(data.data.failure_reason ?? "Transaction failed.");
        } else {
          setPollCount((c) => c + 1);
        }
      } catch {
        setPollCount((c) => c + 1);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [state, transactionId, pollCount]);

  const handleSubmit = async () => {
    if (!phone.trim()) return;
    setState("loading");
    try {
      const res = await fetch("/api/mpesa/stk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), product_id: product.id }),
      });
      const data = await res.json();
      if (!data.success) {
        setState("error");
        setMessage(data.error ?? "An error occurred");
        return;
      }
      setTransactionId(data.data.transaction_id);
      setState("sent");
      setMessage(data.data.message ?? "STK Push sent. Enter your M-Pesa PIN.");
    } catch {
      setState("error");
      setMessage("Network error. Please check your connection.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold">Buy {product.name}</h2>
          <p className="text-brand-600 font-semibold">
            Ksh {Number(product.selling_price).toFixed(0)}
          </p>
        </div>

        <div className="p-6">
          {state === "input" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone number to receive bundle
                </label>
                <input
                  className="input"
                  type="tel"
                  placeholder="07XXXXXXXX or 254XXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
                <p className="text-xs text-gray-500 mt-1">
                  M-Pesa STK Push will be sent to this number for payment.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button onClick={handleSubmit} className="btn-primary flex-1">
                  Pay with M-Pesa
                </button>
              </div>
            </div>
          )}

          {state === "loading" && (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 animate-spin text-brand-600 mx-auto mb-3" />
              <p className="text-gray-600">Sending M-Pesa prompt…</p>
            </div>
          )}

          {state === "sent" && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                <Smartphone className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Check your phone!</h3>
                <p className="text-gray-600 text-sm mt-1">{message}</p>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for payment confirmation…
              </div>
              <button
                onClick={onClose}
                className="text-sm text-gray-500 underline"
              >
                Cancel
              </button>
            </div>
          )}

          {state === "success" && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-green-700">
                  {message}
                </h3>
                <p className="text-gray-500 text-sm mt-1">
                  You'll receive a WhatsApp notification once your bundle is
                  fully activated.
                </p>
              </div>
              <button onClick={onClose} className="btn-primary w-full">
                Done
              </button>
            </div>
          )}

          {state === "error" && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-red-700">
                  Transaction Failed
                </h3>
                <p className="text-gray-600 text-sm mt-1">{message}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="btn-secondary flex-1">
                  Close
                </button>
                <button
                  onClick={() => setState("input")}
                  className="btn-primary flex-1"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Support Widget ────────────────────────────────────────────────────────────

function SupportWidget() {
  const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "";
  const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER ?? "";

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      <a
        href={`https://wa.me/${waNumber}?text=Hello, I need help with my data bundle.`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-full shadow-lg transition-colors text-sm font-medium"
      >
        <MessageSquare className="w-4 h-4" />
        WhatsApp Support
      </a>
      <a
        href={`tel:${supportPhone}`}
        className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-full shadow-lg transition-colors text-sm font-medium"
      >
        <Phone className="w-4 h-4" />
        {supportPhone}
      </a>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function UserWebsite() {
  const [products, setProducts] = useState<Product[]>([]);
  const [systemBusy, setSystemBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeCategory, setActiveCategory] = useState("ALL");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [productsRes, statusRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/system/status"),
      ]);
      const productsData = await productsRes.json();
      const statusData = await statusRes.json();

      if (productsData.success) setProducts(productsData.data);
      if (statusData.success) {
        const heartbeat = statusData.data?.worker_last_heartbeat;
        if (heartbeat) {
          const age = Date.now() - new Date(heartbeat).getTime();
          setSystemBusy(age > 2 * 60 * 1000);
        } else {
          setSystemBusy(true);
        }
      }
    } catch {
      setError("Failed to load packages. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categories = ["ALL", ...Array.from(new Set(products.map((p) => p.category)))];
  const filtered =
    activeCategory === "ALL"
      ? products
      : products.filter((p) => p.category === activeCategory);

  return (
    <>
      <SystemBanner busy={systemBusy} />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Wifi className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">DataMart</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <ShieldCheck className="w-4 h-4 text-brand-600" />
            <span>Secured by M-Pesa</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-600 to-brand-700 text-white py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-4xl font-extrabold mb-3">
            Instant Data Bundles & Airtime
          </h1>
          <p className="text-brand-100 text-lg">
            Select your package, pay with M-Pesa, and get activated in seconds.
          </p>
        </div>
      </section>

      {/* Packages */}
      <main className="max-w-5xl mx-auto px-4 py-10">
        {/* Category Filter */}
        {!loading && products.length > 0 && (
          <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-brand-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center py-20 gap-3 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
            <p>Loading packages…</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center py-20 gap-4 text-gray-500">
            <p className="text-red-600">{error}</p>
            <button onClick={fetchData} className="btn-secondary flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            No packages available in this category.
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} onBuy={setSelectedProduct} />
            ))}
          </div>
        )}

        {/* How it works */}
        <section className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: "1",
                icon: "📦",
                title: "Pick a Bundle",
                desc: "Choose from our live catalogue of data, airtime, and SMS packages.",
              },
              {
                step: "2",
                icon: "📱",
                title: "Pay with M-Pesa",
                desc: "Enter your phone and get an instant STK Push. Enter your PIN to confirm.",
              },
              {
                step: "3",
                icon: "🚀",
                title: "Instantly Activated",
                desc: "Your bundle is activated automatically and you get a WhatsApp confirmation.",
              },
            ].map((item) => (
              <div key={item.step} className="card text-center">
                <div className="text-4xl mb-3">{item.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-gray-200 py-8 mt-16">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>
            &copy; {new Date().getFullYear()} DataMart. Secured by Safaricom
            M-Pesa.
          </p>
          <p className="mt-1">
            Support:{" "}
            <a
              href={`tel:${process.env.NEXT_PUBLIC_SUPPORT_PHONE}`}
              className="text-brand-600 hover:underline"
            >
              {process.env.NEXT_PUBLIC_SUPPORT_PHONE}
            </a>
          </p>
        </div>
      </footer>

      <SupportWidget />

      {selectedProduct && (
        <STKModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
}
