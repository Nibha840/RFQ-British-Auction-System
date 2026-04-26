/**
 * RFQ Model
 * Represents a Request for Quotation with British Auction configuration.
 * Supports three extension trigger modes:
 *   BID_RECEIVED      — any bid in trigger window extends the auction
 *   ANY_RANK_CHANGE   — any ranking change extends the auction
 *   L1_RANK_CHANGE    — only when L1 (lowest bidder) changes
 */

const mongoose = require("mongoose");

const ActivityLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["BID_PLACED", "TIME_EXTENDED", "AUCTION_CLOSED", "AUCTION_CREATED"],
      required: true,
    },
    message: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
);

const RFQSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "RFQ name is required"],
      trim: true,
      maxlength: [200, "Name cannot exceed 200 characters"],
    },
    referenceId: {
      type: String,
      trim: true,
    },
    startTime: {
      type: Date,
      required: [true, "Start time is required"],
    },
    bidCloseTime: {
      type: Date,
      required: [true, "Bid close time is required"],
    },
    forcedCloseTime: {
      type: Date,
      required: [true, "Forced close time is required"],
    },
    pickupDate: {
      type: Date,
      default: null,
    },

    // ── British Auction Config ─────────────────────────────────────────────
    // X: If a trigger occurs within this many minutes of bidCloseTime → extend
    triggerWindow: {
      type: Number,
      required: [true, "Trigger window is required"],
      min: [1, "Trigger window must be at least 1 minute"],
    },
    // Y: How many minutes to add to bidCloseTime when triggered
    extensionDuration: {
      type: Number,
      required: [true, "Extension duration is required"],
      min: [1, "Extension duration must be at least 1 minute"],
    },
    // Which activity triggers an extension
    extensionTrigger: {
      type: String,
      enum: ["BID_RECEIVED", "ANY_RANK_CHANGE", "L1_RANK_CHANGE"],
      default: "BID_RECEIVED",
      required: true,
    },

    status: {
      type: String,
      enum: ["UPCOMING", "ACTIVE", "CLOSED", "FORCE_CLOSED"],
      default: "ACTIVE",
    },

    // Denormalized lowest bid for fast listing queries
    lowestBid: {
      price: { type: Number, default: null },
      supplierId: { type: String, default: null },
      supplierName: { type: String, default: null },
    },

    activityLogs: [ActivityLogSchema],
  },
  { timestamps: true }
);

// ── Validation ────────────────────────────────────────────────────────────────
RFQSchema.pre("validate", function (next) {
  if (this.forcedCloseTime <= this.bidCloseTime) {
    return next(new Error("forcedCloseTime must be greater than bidCloseTime"));
  }
  next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
RFQSchema.methods.computeStatus = function () {
  const now = new Date();
  if (now >= this.forcedCloseTime) return "FORCE_CLOSED";
  if (now >= this.bidCloseTime) return "CLOSED";
  if (this.startTime && now < this.startTime) return "UPCOMING";
  return "ACTIVE";
};

RFQSchema.methods.addLog = function (type, message, metadata = {}) {
  this.activityLogs.push({ type, message, metadata, timestamp: new Date() });
};

module.exports = mongoose.model("RFQ", RFQSchema);
