import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createRFQ } from "../services/api";
import { useToast } from "../App";

const toLocalInput = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const now = new Date();
const plus30 = new Date(now.getTime() + 30 * 60000);
const plus90 = new Date(now.getTime() + 90 * 60000);
const plus7d = new Date(now.getTime() + 7 * 24 * 60 * 60000);

const TRIGGER_OPTIONS = [
  {
    value: "BID_RECEIVED",
    label: "Any Bid Received",
    desc: "Extend whenever any supplier submits a bid within trigger window",
    icon: "📩",
  },
  {
    value: "ANY_RANK_CHANGE",
    label: "Any Rank Change",
    desc: "Extend when any supplier's ranking position changes within trigger window",
    icon: "🔄",
  },
  {
    value: "L1_RANK_CHANGE",
    label: "L1 (Lowest Bidder) Change",
    desc: "Extend only when the lowest-priced supplier changes within trigger window",
    icon: "🏆",
  },
];

const DEFAULT = {
  name: "",
  referenceId: "",
  startTime: toLocalInput(now),
  bidCloseTime: toLocalInput(plus30),
  forcedCloseTime: toLocalInput(plus90),
  pickupDate: toLocalInput(plus7d),
  triggerWindow: "5",
  extensionDuration: "10",
  extensionTrigger: "BID_RECEIVED",
};

// Move Field component outside to prevent re-creation on every render
const Field = ({ id, label, hint, children, error }) => (
  <div className="field">
    <label htmlFor={id}>{label}</label>
    {children}
    {error && <span style={{ fontSize: 11, color: "var(--red)", marginTop: 2 }}>{error}</span>}
    {hint && !error && <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{hint}</span>}
  </div>
);

export default function CreateRFQ() {
  const [form, setForm] = useState(DEFAULT);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const addToast = useToast();

  const set = useCallback((k) => (e) => {
    const newVal = e.target.value;
    setForm((f) => ({ ...f, [k]: newVal }));
    // Clear error if one exists
    setErrors((er) => {
      if (er[k]) {
        return { ...er, [k]: undefined };
      }
      return er;
    });
  }, []);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.startTime) e.startTime = "Required";
    if (!form.bidCloseTime) e.bidCloseTime = "Required";
    if (!form.forcedCloseTime) e.forcedCloseTime = "Required";
    if (new Date(form.bidCloseTime) <= new Date(form.startTime))
      e.bidCloseTime = "Must be after start time";
    if (new Date(form.forcedCloseTime) <= new Date(form.bidCloseTime))
      e.forcedCloseTime = "Must be after bid close time";
    if (!form.triggerWindow || Number(form.triggerWindow) < 1)
      e.triggerWindow = "Min 1 minute";
    if (!form.extensionDuration || Number(form.extensionDuration) < 1)
      e.extensionDuration = "Min 1 minute";
    return e;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) return setErrors(errs);
    setLoading(true);
    try {
      const res = await createRFQ({
        ...form,
        startTime: new Date(form.startTime).toISOString(),
        bidCloseTime: new Date(form.bidCloseTime).toISOString(),
        forcedCloseTime: new Date(form.forcedCloseTime).toISOString(),
        pickupDate: form.pickupDate ? new Date(form.pickupDate).toISOString() : undefined,
        triggerWindow: Number(form.triggerWindow),
        extensionDuration: Number(form.extensionDuration),
      });
      addToast("RFQ created successfully!", "success");
      navigate(`/rfq/${res.data.data._id}`);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to create RFQ", "error");
    } finally {
      setLoading(false);
    }
  };

  const selectedTrigger = TRIGGER_OPTIONS.find((t) => t.value === form.extensionTrigger);

  // Step indicators
  const steps = [
    { num: 1, label: "Basic Info" },
    { num: 2, label: "Timeline" },
    { num: 3, label: "Auction Config" },
  ];

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <h1 className="page-title">Create New RFQ</h1>
      <p className="text-muted" style={{ marginTop: -16, marginBottom: 28, fontSize: 13 }}>
        Configure a Request for Quotation with British Auction parameters.
      </p>

      {/* Step indicator */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 28, padding: "14px 20px",
        background: "var(--bg-glass)", borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)", backdropFilter: "blur(12px)"
      }}>
        {steps.map((s, i) => (
          <React.Fragment key={s.num}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 8,
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#000"
              }}>{s.num}</div>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: "var(--border-bright)", alignSelf: "center", margin: "0 8px" }} />
            )}
          </React.Fragment>
        ))}
      </div>

      <form onSubmit={submit}>
        {/* ── Basic Info ─────────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title">Basic Information</div>
          <div className="grid-2">
            <Field id="name" label="RFQ Name *" error={errors.name}>
              <input id="name" className="input" placeholder="e.g. Industrial Fasteners Q4" value={form.name} onChange={set("name")} />
            </Field>
            <Field id="referenceId" label="Reference ID" error={errors.referenceId}>
              <input id="referenceId" className="input" placeholder="Auto-generated if empty" value={form.referenceId} onChange={set("referenceId")} />
            </Field>
          </div>
        </div>

        {/* ── Timeline ───────────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title">Auction Timeline</div>
          <div className="grid-2">
            <Field id="startTime" label="Bid Start Date & Time *" error={errors.startTime}>
              <input id="startTime" type="datetime-local" className="input" value={form.startTime} onChange={set("startTime")} />
            </Field>
            <Field id="pickupDate" label="Pickup / Service Date" error={errors.pickupDate}>
              <input id="pickupDate" type="datetime-local" className="input" value={form.pickupDate} onChange={set("pickupDate")} />
            </Field>
            <Field id="bidCloseTime" label="Bid Close Date & Time *" error={errors.bidCloseTime}>
              <input id="bidCloseTime" type="datetime-local" className="input" value={form.bidCloseTime} onChange={set("bidCloseTime")} />
            </Field>
            <Field id="forcedCloseTime" label="Forced Bid Close Date & Time *" hint="Hard deadline — auction never extends past this" error={errors.forcedCloseTime}>
              <input id="forcedCloseTime" type="datetime-local" className="input" value={form.forcedCloseTime} onChange={set("forcedCloseTime")} />
            </Field>
          </div>
        </div>

        {/* ── British Auction Config ──────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 28 }}>
          <div className="section-title">British Auction Configuration</div>

          <div className="grid-2" style={{ marginBottom: 20 }}>
            <Field id="triggerWindow" label="Trigger Window — X (minutes)" hint="Monitor last X mins before close" error={errors.triggerWindow}>
              <input id="triggerWindow" type="number" min="1" className="input" value={form.triggerWindow} onChange={set("triggerWindow")} />
            </Field>
            <Field id="extensionDuration" label="Extension Duration — Y (minutes)" hint="Extend bidCloseTime by Y mins when triggered" error={errors.extensionDuration}>
              <input id="extensionDuration" type="number" min="1" className="input" value={form.extensionDuration} onChange={set("extensionDuration")} />
            </Field>
          </div>

          {/* Extension Trigger Type */}
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Extension Trigger Type *</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              {TRIGGER_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "14px 16px",
                    border: `1px solid ${form.extensionTrigger === opt.value ? "rgba(0,229,160,0.3)" : "var(--border-bright)"}`,
                    borderRadius: "var(--radius)",
                    cursor: "pointer",
                    background: form.extensionTrigger === opt.value ? "var(--accent-dim)" : "var(--bg)",
                    transition: "all 200ms",
                    boxShadow: form.extensionTrigger === opt.value ? "0 0 16px rgba(0,229,160,0.06)" : "none",
                  }}
                >
                  <input
                    type="radio"
                    name="extensionTrigger"
                    value={opt.value}
                    checked={form.extensionTrigger === opt.value}
                    onChange={set("extensionTrigger")}
                    style={{ marginTop: 2, accentColor: "var(--accent)" }}
                  />
                  <span style={{ fontSize: 18, marginTop: -2 }}>{opt.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: form.extensionTrigger === opt.value ? "var(--accent)" : "var(--text)" }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Summary box */}
          <div style={{
            padding: "14px 18px",
            background: "var(--accent-dim)",
            borderRadius: "var(--radius)",
            fontSize: 12,
            color: "var(--accent)",
            lineHeight: 1.7,
            border: "1px solid rgba(0,229,160,0.12)"
          }}>
            <strong>How it works:</strong> If{" "}
            <strong>{selectedTrigger?.label.toLowerCase()}</strong> occurs within the last{" "}
            <strong>{form.triggerWindow || "X"} min(s)</strong> of bid close time, the auction
            extends by <strong>{form.extensionDuration || "Y"} min(s)</strong>. Extension can
            never exceed forced close time.
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : "Create RFQ"}
          </button>
          <button type="button" className="btn btn-outline btn-lg" onClick={() => navigate("/")}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
