/**
 * Bid Model
 * Stores individual bids/quotes placed by suppliers for a given RFQ.
 * Includes full quote breakdown: freight, origin, destination charges,
 * transit time, carrier name, and quote validity.
 */

const mongoose = require("mongoose");

const BidSchema = new mongoose.Schema(
  {
    rfqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RFQ",
      required: [true, "RFQ reference is required"],
      index: true,
    },

    // ── Supplier Info ──────────────────────────────────────────────────────
    supplierId: {
      type: String,
      required: [true, "Supplier ID is required"],
      trim: true,
    },
    supplierName: {
      type: String,
      required: [true, "Supplier name is required"],
      trim: true,
    },
    carrierName: {
      type: String,
      required: [true, "Carrier name is required"],
      trim: true,
    },

    // ── Charge Breakdown ───────────────────────────────────────────────────
    freightCharges: {
      type: Number,
      required: [true, "Freight charges are required"],
      min: [0, "Freight charges cannot be negative"],
    },
    originCharges: {
      type: Number,
      required: [true, "Origin charges are required"],
      min: [0, "Origin charges cannot be negative"],
    },
    destinationCharges: {
      type: Number,
      required: [true, "Destination charges are required"],
      min: [0, "Destination charges cannot be negative"],
    },

    // Computed total price = freightCharges + originCharges + destinationCharges
    price: {
      type: Number,
      required: true,
      min: [0.01, "Total price must be greater than 0"],
    },

    // ── Quote Details ──────────────────────────────────────────────────────
    transitTime: {
      type: Number, // in days
      required: [true, "Transit time is required"],
      min: [1, "Transit time must be at least 1 day"],
    },
    quoteValidity: {
      type: Date,
      required: [true, "Quote validity date is required"],
    },

    // ── Auction Metadata ───────────────────────────────────────────────────
    rankAtSubmission: {
      type: Number,
      default: null,
    },
    placedAt: {
      type: Date,
      default: Date.now,
    },
    triggeredExtension: {
      type: Boolean,
      default: false,
    },
    // Which trigger type caused the extension (if any)
    extensionTriggerType: {
      type: String,
      enum: ["BID_RECEIVED", "ANY_RANK_CHANGE", "L1_RANK_CHANGE", null],
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for efficient sorted fetching per RFQ
BidSchema.index({ rfqId: 1, price: 1 });

module.exports = mongoose.model("Bid", BidSchema);
