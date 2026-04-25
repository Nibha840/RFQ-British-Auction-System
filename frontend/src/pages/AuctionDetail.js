import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getRFQ, placeBid } from "../services/api";
import socket from "../services/socket";
import { fmt, getStatus, statusMeta, formatPrice, rankColor } from "../utils/helpers";
import useCountdown from "../hooks/useCountdown";
import { useToast } from "../App";

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cls = { ACTIVE: "badge-active", CLOSED: "badge-closed", FORCE_CLOSED: "badge-force-closed" };
  return <span className={`badge ${cls[status] || ""}`}>{statusMeta[status]?.label || status}</span>;
}

function CountdownBar({ bidCloseTime, status }) {
  const { str } = useCountdown(bidCloseTime);
  return (
    <div className="stat-box">
      <div className="label">Time Remaining</div>
      <div className="stat-value" style={{ color: status !== "ACTIVE" ? "var(--red)" : "var(--accent)", fontSize: 26, fontFamily: "var(--font-mono)" }}>
        {status !== "ACTIVE" ? "—" : str}
      </div>
    </div>
  );
}

function LogIcon({ type }) {
  const map = {
    BID_PLACED: { cls: "log-icon-bid", icon: "💰" },
    TIME_EXTENDED: { cls: "log-icon-extend", icon: "⏱" },
    AUCTION_CREATED: { cls: "log-icon-created", icon: "🔔" },
    AUCTION_CLOSED: { cls: "log-icon-closed", icon: "🔒" },
  };
  const { cls, icon } = map[type] || { cls: "", icon: "ℹ" };
  return <div className={`log-icon ${cls}`}>{icon}</div>;
}

const TRIGGER_LABELS = {
  BID_RECEIVED: "Any Bid Received",
  ANY_RANK_CHANGE: "Any Rank Change",
  L1_RANK_CHANGE: "L1 Change",
};

// ── Bid Form ───────────────────────────────────────────────────────────────

function BidForm({ rfqId, onBidPlaced }) {
  const today = new Date();
  const plus14 = new Date(today.getTime() + 14 * 24 * 60 * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  const toDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const [form, setForm] = useState({
    supplierId: "", supplierName: "", carrierName: "",
    freightCharges: "", originCharges: "", destinationCharges: "",
    transitTime: "", quoteValidity: toDate(plus14),
  });
  const [loading, setLoading] = useState(false);
  const addToast = useToast();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const total = (Number(form.freightCharges) || 0) + (Number(form.originCharges) || 0) + (Number(form.destinationCharges) || 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.supplierId || !form.supplierName || !form.carrierName ||
        !form.freightCharges || !form.originCharges || !form.destinationCharges ||
        !form.transitTime || !form.quoteValidity) {
      return addToast("All fields are required", "error");
    }
    setLoading(true);
    try {
      const res = await placeBid({ rfqId, ...form });
      addToast(
        res.data.data.timeExtended
          ? `Quote submitted! ⏱ Auction extended to ${fmt(res.data.data.newBidCloseTime)}`
          : "Quote submitted successfully!",
        "success"
      );
      setForm((f) => ({ ...f, freightCharges: "", originCharges: "", destinationCharges: "", transitTime: "" }));
      onBidPlaced?.();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to submit quote", "error");
    } finally {
      setLoading(false);
    }
  };

  const inputRow = (label, key, type = "number", placeholder = "") => (
    <div className="field">
      <label>{label}</label>
      <input className="input" type={type} min={type === "number" ? "0" : undefined}
        placeholder={placeholder} value={form[key]} onChange={set(key)} />
    </div>
  );

  return (
    <div className="card">
      <div className="section-title">Submit Quote</div>
      <form onSubmit={submit}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="grid-2">
            {inputRow("Supplier ID", "supplierId", "text", "e.g. SUP-001")}
            {inputRow("Supplier Name", "supplierName", "text", "e.g. Acme Corp")}
          </div>
          {inputRow("Carrier Name", "carrierName", "text", "e.g. DHL Express")}

          <div style={{ marginTop: 4, marginBottom: 2 }}>
            <div className="label" style={{ marginBottom: 8 }}>Charge Breakdown</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {inputRow("Freight Charges (₹)", "freightCharges", "number", "0.00")}
              {inputRow("Origin Charges (₹)", "originCharges", "number", "0.00")}
              {inputRow("Destination Charges (₹)", "destinationCharges", "number", "0.00")}
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginTop: 10, padding: "12px 16px",
              background: "var(--accent-dim)", borderRadius: "var(--radius)",
              border: "1px solid rgba(0,229,160,0.15)"
            }}>
              <span className="label">Total Price</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>
                {formatPrice(total)}
              </span>
            </div>
          </div>

          <div className="grid-2">
            {inputRow("Transit Time (days)", "transitTime", "number", "e.g. 5")}
            <div className="field">
              <label>Quote Validity</label>
              <input className="input" type="date" value={form.quoteValidity} onChange={set("quoteValidity")} />
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-lg" type="submit" disabled={loading}
          style={{ width: "100%", marginTop: 18 }}>
          {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : "Submit Quote"}
        </button>
      </form>
    </div>
  );
}

// ── Bid Table ──────────────────────────────────────────────────────────────

function BidTable({ bids }) {
  if (!bids.length) {
    return (
      <div className="empty-state" style={{ padding: "40px 24px" }}>
        <div className="empty-state-icon">📊</div>
        <div style={{ fontWeight: 600 }}>No quotes yet</div>
        <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>Be the first to submit!</div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Supplier / Carrier</th>
            <th>Freight</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Total Price</th>
            <th>Transit</th>
            <th>Validity</th>
            <th>Placed At</th>
            <th>Ext?</th>
          </tr>
        </thead>
        <tbody>
          {bids.map((bid, idx) => {
            const rank = bid.rank || `L${idx + 1}`;
            const rankClass = ["L1", "L2", "L3"].includes(rank) ? `rank-${rank}` : "rank-other";
            return (
              <tr key={bid._id}>
                <td><span className={`rank-pill ${rankClass}`}>{rank}</span></td>
                <td>
                  <div style={{ fontWeight: 600 }}>{bid.supplierName}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{bid.carrierName}</div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{bid.supplierId}</div>
                </td>
                <td style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{formatPrice(bid.freightCharges)}</td>
                <td style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{formatPrice(bid.originCharges)}</td>
                <td style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{formatPrice(bid.destinationCharges)}</td>
                <td>
                  <span style={{ color: rankColor(rank), fontWeight: 700, fontSize: 14, fontFamily: "var(--font-display)" }}>
                    {formatPrice(bid.price)}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>{bid.transitTime}d</td>
                <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {bid.quoteValidity ? new Date(bid.quoteValidity).toLocaleDateString("en-IN") : "—"}
                </td>
                <td style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fmt(bid.placedAt)}</td>
                <td>
                  {bid.triggeredExtension ? (
                    <span style={{ color: "var(--blue)", fontSize: 11 }} title={TRIGGER_LABELS[bid.extensionTriggerType]}>⏱</span>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Activity Log ───────────────────────────────────────────────────────────

function ActivityLog({ logs }) {
  const sorted = [...(logs || [])].reverse();
  return (
    <div className="card">
      <div className="section-title">Activity Log</div>
      {!sorted.length ? (
        <div className="text-muted">No activity yet.</div>
      ) : (
        <div className="log-list">
          {sorted.map((log) => (
            <div key={log._id} className="log-item">
              <LogIcon type={log.type} />
              <div>
                <div className="log-message">{log.message}</div>
                {log.type === "TIME_EXTENDED" && log.metadata?.reason && (
                  <div style={{ fontSize: 11, color: "var(--blue)", marginTop: 2 }}>
                    Reason: {log.metadata.reason}
                  </div>
                )}
                <div className="log-time">{fmt(log.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AuctionDetail() {
  const { id } = useParams();
  const [rfq, setRfq] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const addToast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await getRFQ(id);
      setRfq(res.data.data);
      setBids(res.data.data.bids || []);
    } catch {
      addToast("Failed to load RFQ", "error");
    } finally {
      setLoading(false);
    }
  }, [id, addToast]);

  useEffect(() => {
    load();
    socket.emit("rfq:join", id);

    const handleBid = (data) => {
      setBids(data.rankedBids || []);
      setRfq((prev) => prev ? {
        ...prev,
        bidCloseTime: data.rfq.bidCloseTime,
        lowestBid: data.rfq.lowestBid,
        activityLogs: data.rfq.activityLogs,
        status: data.rfq.status,
      } : prev);
      if (data.timeExtended)
        addToast(`⏱ Auction extended! New close: ${fmt(data.rfq.bidCloseTime)}`, "warn");
    };

    socket.on("bid:placed", handleBid);
    return () => { socket.emit("rfq:leave", id); socket.off("bid:placed", handleBid); };
  }, [id, load, addToast]);

  if (loading) return (
    <main className="page flex-center" style={{ minHeight: 400 }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </main>
  );

  if (!rfq) return (
    <main className="page">
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <div>RFQ not found.</div>
        <Link to="/" className="btn btn-outline btn-sm mt-4" style={{ display: "inline-flex" }}>← Back</Link>
      </div>
    </main>
  );

  const status = getStatus(rfq);
  const isActive = status === "ACTIVE";

  return (
    <main className="page">
      <Link to="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 20, display: "inline-flex" }}>← Back to Auctions</Link>

      {/* Header */}
      <div className="flex-between mb-4" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
            {rfq.referenceId}
          </div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>{rfq.name}</h1>
          <div className="flex gap-2" style={{ alignItems: "center" }}>
            <StatusBadge status={status} />
            {isActive && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                <span className="live-dot" style={{ marginRight: 6 }} />Live
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-3 mb-4" style={{ marginBottom: 24 }}>
        <CountdownBar bidCloseTime={rfq.bidCloseTime} status={status} />
        <div className="stat-box">
          <div className="label">Lowest Bid (L1)</div>
          <div className="stat-value accent">{rfq.lowestBid?.price != null ? formatPrice(rfq.lowestBid.price) : "—"}</div>
          {rfq.lowestBid?.supplierName && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>by {rfq.lowestBid.supplierName}</div>
          )}
        </div>
        <div className="stat-box">
          <div className="label">Total Quotes</div>
          <div className="stat-value">{bids.length}</div>
        </div>
      </div>

      {/* Config info */}
      <div className="card mb-4" style={{ marginBottom: 24 }}>
        <div className="grid-2" style={{ gap: 20 }}>
          <div>
            <div className="label">Bid Close Time</div>
            <div style={{ marginTop: 4, fontWeight: 500, fontFamily: "var(--font-mono)", fontSize: 13 }}>{fmt(rfq.bidCloseTime)}</div>
          </div>
          <div>
            <div className="label">Forced Close Time</div>
            <div style={{ marginTop: 4, fontWeight: 500, color: "var(--red)", fontFamily: "var(--font-mono)", fontSize: 13 }}>{fmt(rfq.forcedCloseTime)}</div>
          </div>
          {rfq.pickupDate && (
            <div>
              <div className="label">Pickup / Service Date</div>
              <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 13 }}>{fmt(rfq.pickupDate)}</div>
            </div>
          )}
          <div>
            <div className="label">Extension Trigger</div>
            <div style={{ marginTop: 6 }}>
              <span style={{
                fontSize: 12, padding: "4px 12px", borderRadius: 100,
                background: "var(--accent-dim)", color: "var(--accent)",
                border: "1px solid rgba(0,229,160,0.15)", fontWeight: 600
              }}>
                {TRIGGER_LABELS[rfq.extensionTrigger]}
              </span>
            </div>
          </div>
          <div>
            <div className="label">Trigger Window (X)</div>
            <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 13 }}>{rfq.triggerWindow} min(s)</div>
          </div>
          <div>
            <div className="label">Extension Duration (Y)</div>
            <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 13 }}>{rfq.extensionDuration} min(s)</div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "20px 24px 0" }}>
              <div className="section-title">Supplier Quote Rankings</div>
            </div>
            <BidTable bids={bids} />
          </div>
          <ActivityLog logs={rfq.activityLogs} />
        </div>

        <div>
          {isActive ? (
            <BidForm rfqId={id} onBidPlaced={load} />
          ) : (
            <div className="card">
              <div className="section-title">Bidding Closed</div>
              <div className="text-muted" style={{ fontSize: 13 }}>
                This auction is {statusMeta[status]?.label?.toLowerCase()}. No further quotes accepted.
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
