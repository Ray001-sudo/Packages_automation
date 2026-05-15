"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Pencil, Trash2, Upload, Save, X, RefreshCw,
  ToggleLeft, ToggleRight, AlertTriangle, CheckCircle,
} from "lucide-react";
import { Product } from "@/types";

const getAdminKey = () =>
  typeof window !== "undefined" ? localStorage.getItem("admin_key") ?? "" : "";

// ─── Product Form Modal ────────────────────────────────────────────────────────

function ProductFormModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const adminKey = getAdminKey();
  const isEdit = !!product;

  const [form, setForm] = useState({
    name: product?.name ?? "",
    category: product?.category ?? "DATA",
    selling_price: product?.selling_price?.toString() ?? "",
    cost_price: product?.cost_price?.toString() ?? "",
    ussd_code_template: product?.ussd_code_template ?? "",
    is_active: product?.is_active ?? true,
    description: product?.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    if (!form.name || !form.selling_price || !form.ussd_code_template) {
      setError("Name, selling price and USSD template are required.");
      return;
    }
    setSaving(true);
    try {
      const url = isEdit
        ? `/api/admin/products?id=${product!.id}`
        : "/api/admin/products";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({
          ...form,
          selling_price: parseFloat(form.selling_price),
          cost_price: parseFloat(form.cost_price || "0"),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {isEdit ? "Edit Product" : "New Product"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Name *
              </label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. 1GB Daily"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {["DATA", "AIRTIME", "SMS", "OTHER"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, is_active: !form.is_active })
                }
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors w-full ${
                  form.is_active
                    ? "bg-green-50 border-green-300 text-green-700"
                    : "bg-gray-50 border-gray-300 text-gray-500"
                }`}
              >
                {form.is_active ? (
                  <ToggleRight className="w-5 h-5" />
                ) : (
                  <ToggleLeft className="w-5 h-5" />
                )}
                {form.is_active ? "Active" : "Inactive"}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Selling Price (Ksh) *
              </label>
              <input
                className="input"
                type="number"
                min="1"
                step="0.01"
                value={form.selling_price}
                onChange={(e) =>
                  setForm({ ...form, selling_price: e.target.value })
                }
                placeholder="20.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost Price (Ksh)
              </label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.cost_price}
                onChange={(e) =>
                  setForm({ ...form, cost_price: e.target.value })
                }
                placeholder="14.00"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                USSD Code Template *
                <span className="font-normal text-gray-400 ml-1">
                  (use {"{pn}"} as phone placeholder)
                </span>
              </label>
              <input
                className="input font-mono"
                value={form.ussd_code_template}
                onChange={(e) =>
                  setForm({ ...form, ussd_code_template: e.target.value })
                }
                placeholder="*180*5*2*{pn}*1*1#"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                className="input resize-none"
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="1GB valid for 24 hours"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isEdit ? "Save Changes" : "Create Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk USSD JSON Upload Modal ───────────────────────────────────────────────

function BulkUssdModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const adminKey = getAdminKey();
  const fileRef = useRef<HTMLInputElement>(null);
  const [jsonText, setJsonText] = useState(
    JSON.stringify(
      [
        { id: 1, ussd_code_template: "*180*5*2*{pn}*1*1#" },
        { id: 2, ussd_code_template: "*180*5*2*{pn}*2*1#" },
      ],
      null,
      2
    )
  );
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    updated: number;
    total: number;
    results: { id: number; success: boolean; error?: string }[];
  } | null>(null);
  const [error, setError] = useState("");

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setJsonText(e.target?.result as string);
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async () => {
    setError("");
    let updates: unknown;
    try {
      updates = JSON.parse(jsonText);
      if (!Array.isArray(updates)) throw new Error("JSON must be an array");
    } catch (e) {
      setError("Invalid JSON: " + (e as Error).message);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setResult(data.data);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Bulk Update USSD Codes</h2>
            <p className="text-sm text-gray-500">
              Upload a JSON file or paste content below
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Updated {result.updated} of {result.total} products
              </p>
              {result.results.filter((r) => !r.success).length > 0 && (
                <ul className="mt-2 space-y-1 text-red-600">
                  {result.results
                    .filter((r) => !r.success)
                    .map((r) => (
                      <li key={r.id}>
                        ID {r.id}: {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-brand-400 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              Drop a <strong>.json</strong> file here or{" "}
              <span className="text-brand-600">click to browse</span>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              JSON Content{" "}
              <span className="text-gray-400 font-normal">
                — array of {`{ id, ussd_code_template }`}
              </span>
            </label>
            <textarea
              className="input font-mono text-xs resize-none"
              rows={10}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Apply Updates
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Products Page ────────────────────────────────────────────────────────

export default function AdminProductsPage() {
  const adminKey = getAdminKey();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProduct, setEditProduct] = useState<Product | null | undefined>(
    undefined
  );
  const [showBulk, setShowBulk] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/products", {
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();
      if (data.success) setProducts(data.data);
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/products?id=${id}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message ?? "Product removed.");
        fetchProducts();
      }
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleToggle = async (product: Product) => {
    await fetch(`/api/admin/products?id=${product.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ is_active: !product.is_active }),
    });
    fetchProducts();
  };

  const categoryColors: Record<string, string> = {
    DATA: "bg-blue-100 text-blue-700",
    AIRTIME: "bg-green-100 text-green-700",
    SMS: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400" />
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-gray-900">Products</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowBulk(true)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" />
            Bulk USSD Update
          </button>
          <button
            onClick={() => setEditProduct(null)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            New Product
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[
                    "ID", "Name", "Category", "Selling", "Cost", "Margin",
                    "USSD Template", "Status", "Actions",
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
                {products.map((p) => {
                  const margin =
                    Number(p.selling_price) - Number(p.cost_price);
                  const marginPct =
                    Number(p.selling_price) > 0
                      ? ((margin / Number(p.selling_price)) * 100).toFixed(0)
                      : "0";

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-gray-50 transition-colors ${!p.is_active ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                        #{p.id}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {p.name}
                        {p.description && (
                          <p className="text-xs text-gray-400 font-normal truncate max-w-[180px]">
                            {p.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${categoryColors[p.category] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {p.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        Ksh {Number(p.selling_price).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        Ksh {Number(p.cost_price).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                          Ksh {margin.toFixed(2)}{" "}
                          <span className="text-xs font-normal text-gray-400">
                            ({marginPct}%)
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 max-w-[180px] truncate">
                        {p.ussd_code_template}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggle(p)}
                          className={`flex items-center gap-1 text-xs font-semibold ${p.is_active ? "text-green-600" : "text-gray-400"}`}
                        >
                          {p.is_active ? (
                            <ToggleRight className="w-5 h-5" />
                          ) : (
                            <ToggleLeft className="w-5 h-5" />
                          )}
                          {p.is_active ? "Active" : "Off"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditProduct(p)}
                            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {deleteConfirm === p.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(p.id)}
                                className="text-xs text-red-600 font-semibold px-2 py-1 bg-red-50 rounded-lg"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="text-xs text-gray-500"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(p.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {products.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                No products yet. Click &quot;New Product&quot; to create one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {editProduct !== undefined && (
        <ProductFormModal
          product={editProduct}
          onClose={() => setEditProduct(undefined)}
          onSaved={() => {
            fetchProducts();
            showToast(editProduct ? "Product updated." : "Product created.");
          }}
        />
      )}

      {showBulk && (
        <BulkUssdModal
          onClose={() => setShowBulk(false)}
          onSaved={fetchProducts}
        />
      )}
    </div>
  );
}
