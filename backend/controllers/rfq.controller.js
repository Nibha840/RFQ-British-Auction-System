/**
 * RFQ Controller
 * Handles creation and retrieval of RFQs
 */

const RFQ = require("../models/rfq.model");
const Bid = require("../models/bid.model");

/**
 * POST /rfq/create
 */
const createRFQ = async (req, res, next) => {
  try {
    const {
      name,
      referenceId,
      startTime,
      bidCloseTime,
      forcedCloseTime,
      pickupDate,
      triggerWindow,
      extensionDuration,
      extensionTrigger,
    } = req.body;

    if (!name || !startTime || !bidCloseTime || !forcedCloseTime || !triggerWindow || !extensionDuration) {
      return res.status(400).json({ success: false, message: "All required fields must be provided" });
    }

    const rfq = new RFQ({
      name,
      referenceId: referenceId || `RFQ-${Date.now()}`,
      startTime: new Date(startTime),
      bidCloseTime: new Date(bidCloseTime),
      forcedCloseTime: new Date(forcedCloseTime),
      pickupDate: pickupDate ? new Date(pickupDate) : null,
      triggerWindow: Number(triggerWindow),
      extensionDuration: Number(extensionDuration),
      extensionTrigger: extensionTrigger || "BID_RECEIVED",
    });

    rfq.addLog("AUCTION_CREATED", `RFQ "${name}" created`, {
      triggerWindow,
      extensionDuration,
      extensionTrigger: extensionTrigger || "BID_RECEIVED",
    });

    await rfq.save();

    const io = req.app.get("io");
    io.emit("rfq:created", { rfq });

    return res.status(201).json({ success: true, message: "RFQ created successfully", data: rfq });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};

/**
 * GET /rfq/list
 */
const listRFQs = async (req, res, next) => {
  try {
    const rfqs = await RFQ.find().sort({ createdAt: -1 }).lean();
    const now = new Date();
    const enriched = rfqs.map((rfq) => {
      let status;
      if (now >= new Date(rfq.forcedCloseTime)) status = "FORCE_CLOSED";
      else if (now >= new Date(rfq.bidCloseTime)) status = "CLOSED";
      else status = "ACTIVE";
      return { ...rfq, status };
    });
    return res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /rfq/:id
 */
const getRFQ = async (req, res, next) => {
  try {
    const rfq = await RFQ.findById(req.params.id).lean();
    if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });

    const bids = await Bid.find({ rfqId: rfq._id }).sort({ price: 1, placedAt: 1 }).lean();
    const rankedBids = bids.map((bid, idx) => ({ ...bid, rank: `L${idx + 1}` }));

    const now = new Date();
    let status;
    if (now >= new Date(rfq.forcedCloseTime)) status = "FORCE_CLOSED";
    else if (now >= new Date(rfq.bidCloseTime)) status = "CLOSED";
    else status = "ACTIVE";

    return res.json({ success: true, data: { ...rfq, status, bids: rankedBids } });
  } catch (err) {
    next(err);
  }
};

module.exports = { createRFQ, listRFQs, getRFQ };
