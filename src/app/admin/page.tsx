"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Activity,
  Battery,
  Smartphone,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Analytics, SystemStatus } from "@/types";

const ADMIN_KEY =
  typeof window !== "undefined"
    ? localStorage.getItem("admin_key") ?? ""
    : "";

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-3xl font-extrabold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-sm text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

// ─── Worker Status Card ────────────────────────────────────────────────────────

function WorkerStatusCard({ status }: { status: SystemStatus | null }) {
  if (!status) return null;

  const heartbeatAge = status.worker_last_heartbeat
    ? Date.now() - new Date(status.worker_last_heartbeat).getTime()
    : Infinity;
  const isAlive = heartbeatAge < 60_000;
  const isWarning = heartbeatAge >= 60_000 && heartbeatAge < 120_000;
  const isDead = heartbeatAge >= 120_000;

  const color = isAlive
    ? "text-green-600 bg-green-100"
    : isWarning
    ? "text-amber-600 bg-amber-100"
    : "text-red-600 bg-red-100";

  const label = isAlive ? "ONLINE" : isWarning ? "WARNING" : "OFFLINE";

  const lastSeen = status.worker_last_heartbeat
    ? new Date(status.worker_last_heartbeat).toLocaleTimeString()
    : "Never";

  return (
    <div className={`card border-2 ${isDead ? "border-red-200" : isWarning ? "border-amber-200" : "border-green-200"}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Ray Tech APK Worker
        </h3>
        <span className={`badge ${color} text-xs font-bold px-3 py-1`}>
          {isAlive && <span className="w-2 h-2 bg-green-500 rounded-full inline-block mr-1.5 animate-pulse" />}
          {label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Last Seen</p>
          <p className="font-semibold">{lastSeen}</p>
        </div>
        <div>
          <p className="text-gray-500">Battery</p>
          <p className="font-semibold flex items-center gap-1">
            <Battery className="w-4 h-4" />
            {status.battery_level != null ? `${status.battery_level}%` : "—"}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Device</p>
          <p className="font-semibold truncate">
            {status.device_model ?? "—"}
          </p>
        </div>
      </div>
      {isDead && (
        <div className="mt-4 p-3 bg-red-50 rounded-xl text-red-700 text-sm">
          ⚠️ Worker has not reported in over 2 minutes. Users are seeing a
          &quot;System Busy&quot; banner.
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Page ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminKey, setAdminKey] = useState(ADMIN_KEY);
  const [keyInput, setKeyInput] = useState("");

  const fetchAnalytics = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/analytics", {
        headers: { "x-admin-key": key },
      });
      const data = await res.json();
      if (data.success) {
        setAnalytics(data.data.analytics);
        setSystemStatus(data.data.system_status);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminKey) {
      fetchAnalytics(adminKey);
      const interval = setInterval(() => fetchAnalytics(adminKey), 30_000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [adminKey, fetchAnalytics]);

  if (!adminKey) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card w-full max-w-sm">
          <h2 className="text-xl font-bold mb-4">Admin Access</h2>
          <input
            type="password"
            className="input mb-3"
            placeholder="Enter admin key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                localStorage.setItem("admin_key", keyInput);
                setAdminKey(keyInput);
              }
            }}
          />
          <button
            className="btn-primary w-full"
            onClick={() => {
              localStorage.setItem("admin_key", keyInput);
              setAdminKey(keyInput);
            }}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-gray-900">Analytics</h1>
        <button
          onClick={() => fetchAnalytics(adminKey)}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Worker Status */}
      <WorkerStatusCard status={systemStatus} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Revenue"
          value={`Ksh ${analytics?.total_revenue.toLocaleString() ?? 0}`}
          sub={`Today: Ksh ${analytics?.today_revenue.toLocaleString() ?? 0}`}
          icon={DollarSign}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          title="Net Profit"
          value={`Ksh ${analytics?.net_profit.toLocaleString() ?? 0}`}
          sub={`Cost: Ksh ${analytics?.total_cost.toLocaleString() ?? 0}`}
          icon={TrendingUp}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          title="Success Rate"
          value={`${analytics?.success_rate ?? 0}%`}
          sub={`${analytics?.success_count ?? 0} successful`}
          icon={CheckCircle}
          color="bg-emerald-100 text-emerald-600"
        />
        <StatCard
          title="Total Orders"
          value={`${analytics?.total_transactions.toLocaleString() ?? 0}`}
          sub={`Today: ${analytics?.today_transactions ?? 0}`}
          icon={ShoppingCart}
          color="bg-purple-100 text-purple-600"
        />
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Pending",
            count: analytics?.pending_count,
            color: "bg-amber-100 text-amber-700",
            icon: Clock,
          },
          {
            label: "Fulfilling",
            count: analytics?.fulfilling_count,
            color: "bg-blue-100 text-blue-700",
            icon: Activity,
          },
          {
            label: "Success",
            count: analytics?.success_count,
            color: "bg-green-100 text-green-700",
            icon: CheckCircle,
          },
          {
            label: "Failed",
            count: analytics?.failed_count,
            color: "bg-red-100 text-red-700",
            icon: XCircle,
          },
        ].map(({ label, count, color, icon: Icon }) => (
          <div key={label} className="card">
            <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold">{count ?? 0}</p>
            <p className="text-sm text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">
            Revenue (Last 14 Days)
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={analytics?.daily_revenue ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => [`Ksh ${v.toLocaleString()}`, "Revenue"]}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">
            Daily Transactions
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analytics?.daily_revenue ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="transactions" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Revenue by category */}
      {analytics?.revenue_by_category && analytics.revenue_by_category.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Revenue by Category</h2>
          <div className="space-y-3">
            {analytics.revenue_by_category.map((cat) => {
              const pct = analytics.total_revenue > 0
                ? (cat.revenue / analytics.total_revenue) * 100
                : 0;
              return (
                <div key={cat.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{cat.category}</span>
                    <span className="text-gray-500">
                      Ksh {cat.revenue.toLocaleString()} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
