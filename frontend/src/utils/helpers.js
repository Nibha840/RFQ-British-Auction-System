import { format, formatDistanceToNow, isPast } from "date-fns";

export const fmt = (date) =>
  date ? format(new Date(date), "dd MMM yyyy, HH:mm:ss") : "—";

export const fromNow = (date) =>
  date ? formatDistanceToNow(new Date(date), { addSuffix: true }) : "—";

export const getStatus = (rfq) => {
  const now = new Date();
  if (isPast(new Date(rfq.forcedCloseTime))) return "FORCE_CLOSED";
  if (isPast(new Date(rfq.bidCloseTime))) return "CLOSED";
  return "ACTIVE";
};

export const statusMeta = {
  ACTIVE: { label: "Active", color: "#00e5a0" },
  CLOSED: { label: "Closed", color: "#f59e0b" },
  FORCE_CLOSED: { label: "Force Closed", color: "#ef4444" },
};

export const rankColor = (rank) => {
  if (rank === "L1") return "#00e5a0";
  if (rank === "L2") return "#60a5fa";
  if (rank === "L3") return "#f59e0b";
  return "#94a3b8";
};

export const formatPrice = (p) =>
  p != null ? `₹${Number(p).toLocaleString("en-IN")}` : "—";
