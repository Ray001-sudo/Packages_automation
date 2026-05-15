"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Smartphone, Battery, Wifi, WifiOff, Clock,
  RefreshCw, CheckCircle, AlertTriangle, XCircle,
  Activity, Signal,
} from "lucide-react";
import { SystemStatus, Transaction } from "@/types";

const getAdminKey = () =>
  typeof window !== "undefined" ? localStorage.getItem("admin_key") ?? "" : "";

// ─── Heartbeat Visualiser ──────────────────────────────────────────────────────

function HeartbeatBar({ pulses }: { pulses: number[] }) {
  return (
    <div className="flex items-end gap-1 h-12">
      {pulses.map((v, i) => (
        <div
          key={i}
          className={`w-3 rounded-t transition-all duration-300 ${
            v === 1
              ? "bg-green-500"
              : v === 0
              ? "bg-gray-200"
              : "bg-red-400"
          }`}
          style={{ height: `${v === 1 ? 100 : v === 0 ? 20 : 60}%` }}
        />
      ))}
    </div>
  );
}

// ─── Battery Indicator ─────────────────────────────────────────────────────────

function BatteryIndicator({ level }: { level: number | null }) {
  if (level === null) return <span className="text-gray-400">—</span>;
  const color =
    level > 50 ? "text-green-600" : level > 20 ? "text-amber-500" : "text-red-600";
  return (
    <span className={`font-bold text-2xl ${color} flex items-center gap-1`}>
      <Battery className="w-6 h-6" />
      {level}%
    </span>
  );
}

// ─── Status Gauge ──────────────────────────────────────────────────────────────

function WorkerGauge({
  isAlive, isWarning, isDead, secondsSinceLastSeen,
}: {
  isAlive: boolean;
  isWarning: boolean;
  isDead: boolean;
  secondsSinceLastSeen: number;
}) {
  const ring = isDead
    ? "ring-red-400 bg-red-50"
    : isWarning
    ? "ring-amber-400 bg-amber-50"
    : "ring-green-400 bg-green-50";

  const Icon = isDead ? XCircle : isWarning ? AlertTriangle : CheckCircle;
  const iconColor = isDead
    ? "text-red-500"
    : isWarning
    ? "text-amber-500"
    : "text-green-500";

  const label = isDead ? "OFFLINE" : isWarning ? "WARNING" : "ONLINE";

  return (
    <div
      className={`w-40 h-40 rounded-full ring-4 ${ring} flex flex-col items-center justify-center gap-1 mx-auto`}
    >
      <Icon className={`w-10 h-10 ${iconColor} ${isAlive ? "animate-pulse-slow" : ""}`} />
      <p className="font-extrabold text-sm">{label}</p>
      {secondsSinceLastSeen < 3600 && (
        <p className="text-xs text-gray-500">
          {secondsSinceLastSeen}s ago
        </p>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminWorkerPage() {
  const adminKey = getAdminKey();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingTx, setPendingTx] = useState<(Transaction & { product_name: string })[]>([]);
  const [pulseHistory, setPulseHistory] = useState<number[]>(Array(30).fill(0));
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, txRes] = await Promise.all([
        fetch("/api/admin/analytics", {
          headers: { "x-admin-key": adminKey },
        }),
        fetch("/api/admin/transactions?status=PAID&limit=10", {
          headers: { "x-admin-key": adminKey },
        }),
      ]);

      const statusData = await statusRes.json();
      const txData = await txRes.json();

      if (statusData.success) {
        setStatus(statusData.data.system_status);

        // Update pulse history
        const heartbeat = statusData.data.system_status?.worker_last_heartbeat;
        const age = heartbeat
          ? (Date.now() - new Date(heartbeat).getTime()) / 1000
          : Infinity;
        const pulse = age < 35 ? 1 : age < 120 ? -1 : 0;
        setPulseHistory((h) => [...h.slice(1), pulse]);
      }

      if (txData.success) setPendingTx(txData.data.transactions);

      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const heartbeatAge = status?.worker_last_heartbeat
    ? Math.floor(
        (Date.now() - new Date(status.worker_last_heartbeat).getTime()) / 1000
      )
    : Infinity;

  const isAlive = heartbeatAge < 60;
  const isWarning = heartbeatAge >= 60 && heartbeatAge < 120;
  const isDead = heartbeatAge >= 120;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-gray-900">
          Worker Monitor
        </h1>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          {lastRefresh && (
            <span>Updated {lastRefresh.toLocaleTimeString()}</span>
          )}
          <button
            onClick={fetchAll}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Dead-man switch alert */}
      {isDead && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-700">Worker Offline — Manual Mode Active</h3>
            <p className="text-red-600 text-sm mt-1">
              The Ray Tech APK has not sent a heartbeat in over 2 minutes. The
              user website and WhatsApp bot are displaying a{" "}
              <strong>"System Busy / Manual Mode"</strong> banner. Paid orders
              are queued and will be processed when the worker comes back online.
            </p>
          </div>
        </div>
      )}

      {isWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-700">Heartbeat Delayed</h3>
            <p className="text-amber-600 text-sm mt-1">
              Last heartbeat was {heartbeatAge}s ago. The worker may be
              experiencing issues. If it doesn't respond within 2 minutes,
              manual mode will activate.
            </p>
          </div>
        </div>
      )}

      {/* Main status grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Big status gauge */}
        <div className="card flex flex-col items-center justify-center gap-6 py-8">
          <h2 className="font-semibold text-gray-600 text-sm uppercase tracking-wider">
            APK Status
          </h2>
          <WorkerGauge
            isAlive={isAlive}
            isWarning={isWarning}
            isDead={isDead}
            secondsSinceLastSeen={heartbeatAge === Infinity ? 999 : heartbeatAge}
          />
          <div className="text-center">
            <p className="text-sm text-gray-500">
              {status?.device_model ?? "Device unknown"}
            </p>
            <p className="text-xs text-gray-400">
              Android {status?.android_version ?? "?"} · App v
              {status?.app_version ?? "?"}
            </p>
          </div>
        </div>

        {/* Device info */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-700">Device Info</h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <Battery className="w-4 h-4" /> Battery
              </span>
              <BatteryIndicator level={status?.battery_level ?? null} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 flex items-center gap-2">
                {status?.is_phone_online ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                Network
              </span>
              <span
                className={`font-semibold text-sm ${status?.is_phone_online ? "text-green-600" : "text-red-600"}`}
              >
                {status?.is_phone_online ? "Online" : "Offline"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Last Heartbeat
              </span>
              <span className="font-semibold text-sm text-gray-700">
                {status?.worker_last_heartbeat
                  ? new Date(status.worker_last_heartbeat).toLocaleTimeString()
                  : "Never"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <Signal className="w-4 h-4" /> Heartbeat Age
              </span>
              <span
                className={`font-semibold text-sm ${isAlive ? "text-green-600" : isDead ? "text-red-600" : "text-amber-600"}`}
              >
                {heartbeatAge === Infinity
                  ? "Never"
                  : heartbeatAge < 60
                  ? `${heartbeatAge}s`
                  : `${Math.floor(heartbeatAge / 60)}m ${heartbeatAge % 60}s`}
              </span>
            </div>
          </div>
        </div>

        {/* Pulse history */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Heartbeat History (30 ticks)
          </h2>
          <HeartbeatBar pulses={pulseHistory} />
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-green-500 rounded" /> Online
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-red-400 rounded" /> Delayed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-gray-200 rounded" /> Offline
            </span>
          </div>
        </div>
      </div>

      {/* Queued PAID orders */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-brand-600" />
          Queued for Fulfillment (PAID)
          {pendingTx.length > 0 && (
            <span className="badge bg-brand-100 text-brand-700 ml-1">
              {pendingTx.length}
            </span>
          )}
        </h2>

        {pendingTx.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
            No orders waiting for fulfillment
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["TX ID", "Phone", "Product", "Amount", "Receipt", "Paid At"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pendingTx.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="py-2 font-mono text-xs text-gray-400">
                      #{tx.id}
                    </td>
                    <td className="py-2 font-medium">{tx.user_phone}</td>
                    <td className="py-2 text-gray-700">{tx.product_name}</td>
                    <td className="py-2 font-semibold text-green-600">
                      Ksh {Number(tx.amount).toFixed(2)}
                    </td>
                    <td className="py-2 font-mono text-xs text-gray-500">
                      {tx.mpesa_receipt ?? "—"}
                    </td>
                    <td className="py-2 text-xs text-gray-400">
                      {new Date(tx.updated_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API Integration Guide for APK */}
      <div className="card bg-gray-900 text-gray-100">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-brand-400" />
          Ray Tech APK Integration Reference
        </h2>
        <div className="space-y-3 text-sm font-mono text-gray-300">
          <div>
            <p className="text-gray-500 mb-1"># Heartbeat (POST every 30s)</p>
            <p className="text-green-400">POST /api/worker/heartbeat</p>
            <p className="text-gray-400">
              Header: x-worker-api-key: YOUR_WORKER_KEY
            </p>
            <p className="text-gray-400">
              Body: {"{ battery_level, is_phone_online, device_model, android_version, app_version }"}
            </p>
          </div>
          <div>
            <p className="text-gray-500 mb-1"># Poll for next task (GET every 5s)</p>
            <p className="text-green-400">GET /api/worker/next-task</p>
            <p className="text-gray-400">
              Returns: {"{ transaction_id, user_phone, ussd_code }"}
            </p>
          </div>
          <div>
            <p className="text-gray-500 mb-1"># Report completion (POST)</p>
            <p className="text-green-400">POST /api/worker/complete-task</p>
            <p className="text-gray-400">
              Body: {"{ transaction_id, success: true|false, failure_reason? }"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
