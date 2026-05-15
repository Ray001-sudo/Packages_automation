"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Search, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, Clock, Activity, CreditCard,
} from "lucide-react";
import { Transaction } from "@/types";

const getAdminKey = () =>
  typeof window !== "undefined" ? localStorage.getItem("admin_key") ?? "" : "";

type StatusFilter =
  | "ALL" | "PENDING" | "PAID" | "FULFILLING" | "SUCCESS" | "FAILED";

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  PENDING:    { label: "Pending",    color: "bg-amber-100 text-amber-700",  icon: Clock      },
  PAID:       { label: "Paid",       color: "bg-blue-100 text-blue-700",    icon: CreditCard },
  FULFILLING: { label: "Fulfilling", color: "bg-indigo-100 text-indigo-700",icon: Activity   },
  SUCCESS:    { label: "Success",    color: "bg-green-100 text-green-700",  icon: CheckCircle},
  FAILED:     { label: "Failed",     color: "bg-red-100 text-red-700",      icon: XCircle    },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status, color: "bg-gray-100 text-gray-600", icon: Clock,
  };
  const Icon = cfg.icon;
  return (
    <span className={`badge ${cfg.color} flex items-center gap-1`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export default function AdminTransactionsPage() {
  const adminKey = getAdminKey();
  const [transactions, setTransactions] = useState<
    (Transaction & { product_name: string; category: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [phone, setPhone] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0, pages: 1, limit: 50,
  });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
        status,
        phone,
      });
      const res = await fetch(`/api/admin/transactions?${params}`, {
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data.transactions);
        setPagination(data.data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [adminKey, status, phone, page]);

  useEffect(() => {
    const t = setTimeout(fetchTransactions, 300);
    return () => clearTimeout(t);
  }, [fetchTransactions]);

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(fetchTransactions, 15_000);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("en-KE", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-gray-900">Transactions</h1>
        <button
          onClick={fetchTransactions}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-4">
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {(["ALL", "PENDING", "PAID", "FULFILLING", "SUCCESS", "FAILED"] as StatusFilter[]).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => { setStatus(s); setPage(1); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    status === s
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s}
                </button>
              )
            )}
          </div>

          {/* Phone search */}
          <div className="relative ml-auto">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9 py-2 text-sm w-52"
              placeholder="Filter by phone…"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPage(1); }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  "ID", "Phone", "Product", "Amount", "Receipt",
                  "Status", "Reason", "Created",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && transactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    No transactions found.
                  </td>
                </tr>
              )}
              {!loading &&
                transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">
                      #{tx.id}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {tx.user_phone}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {tx.product_name}
                      <span className="ml-1 text-xs text-gray-400">
                        ({tx.category})
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      Ksh {Number(tx.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {tx.mpesa_receipt ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-red-600 max-w-[180px] truncate">
                      {tx.failure_reason ?? ""}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(tx.created_at)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <p className="text-gray-500">
              Showing {(page - 1) * pagination.limit + 1}–
              {Math.min(page * pagination.limit, pagination.total)} of{" "}
              {pagination.total} transactions
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary py-1.5 px-3 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-gray-600 font-medium">
                Page {page} / {pagination.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="btn-secondary py-1.5 px-3 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
