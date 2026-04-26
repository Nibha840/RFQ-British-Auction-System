import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { listRFQs } from "../services/api";
import socket from "../services/socket";
import { fmt, getStatus, statusMeta, formatPrice } from "../utils/helpers";
import useCountdown from "../hooks/useCountdown";
import { useToast } from "../App";

const TRIGGER_LABELS = {
  BID_RECEIVED: "Any Bid",
  ANY_RANK_CHANGE: "Any Rank Change",
  L1_RANK_CHANGE: "L1 Change",
};

function CountdownCell({ rfq, status }) {
  const targetDate = status === "UPCOMING" ? rfq.startTime : rfq.bidCloseTime;
  const { str, expired } = useCountdown(targetDate);
  if (status !== "ACTIVE" && status !== "UPCOMING") return <span className="text-muted">—</span>;
  return (
    <div>
      <span style={{ color: expired ? "var(--red)" : status === "UPCOMING" ? "var(--purple)" : "var(--accent)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
        {status === "UPCOMING" ? `Starts in ${str}` : str}
      </span>
    </div>
  );
}

function StatusBadge({ status }) {
  const cls = { ACTIVE: "badge-active", UPCOMING: "badge-upcoming", CLOSED: "badge-closed", FORCE_CLOSED: "badge-force-closed" };
  return <span className={`badge ${cls[status] || ""}`}>{statusMeta[status]?.label || status}</span>;
}

function RFQRow({ rfq: initial }) {
  const [rfq, setRfq] = useState(initial);
  const [, forceUpdate] = useState(0);
  const status = getStatus(rfq);

  // Re-evaluate status every second so UPCOMING → ACTIVE transition is automatic
  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (data) => {
      if (String(data.rfqId) === String(rfq._id)) {
        setRfq((prev) => ({
          ...prev,
          bidCloseTime: data.bidCloseTime,
          lowestBid: data.lowestBid,
          status: data.status,
        }));
      }
    };
    socket.on("rfq:updated", handler);
    return () => socket.off("rfq:updated", handler);
  }, [rfq._id]);

  return (
    <tr>
      <td>
        <Link to={`/rfq/${rfq._id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>
          {rfq.name}
        </Link>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
          {rfq.referenceId}
        </div>
      </td>
      <td><StatusBadge status={status} /></td>
      <td>
        {rfq.lowestBid?.price != null ? (
          <span style={{ color: "var(--accent)", fontWeight: 700, fontFamily: "var(--font-display)" }}>
            {formatPrice(rfq.lowestBid.price)}
            <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6, fontSize: 11, fontFamily: "var(--font-body)" }}>
              by {rfq.lowestBid.supplierName}
            </span>
          </span>
        ) : (
          <span className="text-muted" style={{ fontStyle: "italic" }}>No quotes yet</span>
        )}
      </td>
      <td>
        <CountdownCell rfq={rfq} status={status} />
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
          {status === "UPCOMING" ? `Start: ${fmt(rfq.startTime)}` : fmt(rfq.bidCloseTime)}
        </div>
      </td>
      <td>
        <span className="text-muted" style={{ fontSize: 12 }}>{fmt(rfq.forcedCloseTime)}</span>
      </td>
      <td>
        <span style={{
          fontSize: 11, padding: "3px 10px", borderRadius: 100,
          background: "var(--bg-raised)", color: "var(--text-muted)", border: "1px solid var(--border)"
        }}>
          {TRIGGER_LABELS[rfq.extensionTrigger] || "—"}
        </span>
      </td>
      <td>
        <Link to={`/rfq/${rfq._id}`} className="btn btn-outline btn-sm">View →</Link>
      </td>
    </tr>
  );
}

function DashboardStats({ rfqs }) {
  const active = rfqs.filter((r) => getStatus(r) === "ACTIVE").length;
  const upcoming = rfqs.filter((r) => getStatus(r) === "UPCOMING").length;
  const closed = rfqs.filter((r) => ["CLOSED", "FORCE_CLOSED"].includes(getStatus(r))).length;
  const lowestBid = rfqs.reduce((min, r) => {
    if (r.lowestBid?.price != null && (min === null || r.lowestBid.price < min)) return r.lowestBid.price;
    return min;
  }, null);

  const stats = [
    { icon: "📋", label: "Total RFQs", value: rfqs.length, color: "var(--text)", bg: "rgba(96,165,250,0.1)" },
    { icon: "⚡", label: "Active", value: active, color: "var(--accent)", bg: "var(--accent-dim)" },
    { icon: "🕐", label: "Upcoming", value: upcoming, color: "var(--purple)", bg: "rgba(167,139,250,0.1)" },
    { icon: "🔒", label: "Closed", value: closed, color: "var(--amber)", bg: "rgba(245,158,11,0.1)" },
  ];

  return (
    <div className="dash-stats">
      {stats.map((s) => (
        <div key={s.label} className="dash-stat">
          <div className="dash-stat-icon" style={{ background: s.bg }}>{s.icon}</div>
          <div className="dash-stat-label">{s.label}</div>
          <div className="dash-stat-value" style={{ color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function AuctionList() {
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const addToast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await listRFQs();
      setRfqs(res.data.data);
    } catch {
      addToast("Failed to load auctions", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
    const handler = ({ rfq }) => {
      setRfqs((prev) => [rfq, ...prev]);
      addToast(`New RFQ: ${rfq.name}`, "info");
    };
    socket.on("rfq:created", handler);
    return () => socket.off("rfq:created", handler);
  }, [load, addToast]);

  const active = rfqs.filter((r) => getStatus(r) === "ACTIVE").length;
  const upcoming = rfqs.filter((r) => getStatus(r) === "UPCOMING").length;
  const closed = rfqs.filter((r) => ["CLOSED", "FORCE_CLOSED"].includes(getStatus(r))).length;

  return (
    <main className="page">
      <div className="flex-between mb-4">
        <div>
          <h1 className="page-title">Live Auctions</h1>
          <div className="flex gap-3" style={{ marginTop: -12, marginBottom: 24 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              <span className="live-dot" style={{ marginRight: 6 }} />
              {active} active &nbsp;·&nbsp; {upcoming} upcoming &nbsp;·&nbsp; {closed} closed
            </span>
          </div>
        </div>
        <Link to="/create" className="btn btn-primary">+ New RFQ</Link>
      </div>

      {!loading && rfqs.length > 0 && <DashboardStats rfqs={rfqs} />}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="flex-center" style={{ padding: 60 }}><div className="spinner" /></div>
        ) : rfqs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No RFQs yet</div>
            <div style={{ color: "var(--text-dim)", marginBottom: 16 }}>Create your first auction to get started</div>
            <Link to="/create" className="btn btn-primary btn-sm" style={{ display: "inline-flex" }}>
              + Create RFQ
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>RFQ Name</th>
                  <th>Status</th>
                  <th>Lowest Bid (L1)</th>
                  <th>Bid Close</th>
                  <th>Forced Close</th>
                  <th>Trigger</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rfqs.map((rfq) => <RFQRow key={rfq._id} rfq={rfq} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
