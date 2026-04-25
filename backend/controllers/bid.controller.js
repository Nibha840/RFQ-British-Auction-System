/**
 * Bid Controller
 * Handles bid/quote placement with British Auction extension logic.
 *
 * Three extension trigger modes (set per-RFQ):
 *   BID_RECEIVED    — any bid in trigger window triggers extension
 *   ANY_RANK_CHANGE — extension if the new bid changes anyone's rank
 *   L1_RANK_CHANGE  — extension only if the new L1 (lowest bidder) changes
 */

const RFQ = require("../models/rfq.model");
const Bid = require("../models/bid.model");

// ── Helper: determine if a rank change occurred ───────────────────────────────

/**
 * Returns true if adding `newPrice` to existing bids changes any ranking.
 * A rank changes whenever newPrice is strictly less than any existing bid price.
 */
const anyRankChanged = (sortedPrices, newPrice) => {
  return sortedPrices.some((p) => newPrice < p);
};

/**
 * Returns true if the new bid becomes the new L1 (lowest overall price).
 */
const l1Changed = (sortedPrices, newPrice) => {
  if (sortedPrices.length === 0) return true; // first bid → new L1
  return newPrice < sortedPrices[0];
};

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * POST /bid/place
 * Place a quote on an active RFQ.
 */
const placeBid = async (req, res, next) => {
  try {
    const {
      rfqId,
      supplierId,
      supplierName,
      carrierName,
      freightCharges,
      originCharges,
      destinationCharges,
      transitTime,
      quoteValidity,
    } = req.body;

    // ── Input validation ──────────────────────────────────────────────────
    if (
      !rfqId || !supplierId || !supplierName || !carrierName ||
      freightCharges === undefined || originCharges === undefined || destinationCharges === undefined ||
      !transitTime || !quoteValidity
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required: rfqId, supplierId, supplierName, carrierName, freightCharges, originCharges, destinationCharges, transitTime, quoteValidity",
      });
    }

    const freight = Number(freightCharges);
    const origin = Number(originCharges);
    const destination = Number(destinationCharges);

    if ([freight, origin, destination].some((v) => isNaN(v) || v < 0)) {
      return res.status(400).json({ success: false, message: "Charges must be non-negative numbers" });
    }

    // Total price = sum of all charges
    const totalPrice = freight + origin + destination;
    if (totalPrice <= 0) {
      return res.status(400).json({ success: false, message: "Total price must be greater than 0" });
    }

    // ── Fetch RFQ ─────────────────────────────────────────────────────────
    const rfq = await RFQ.findById(rfqId);
    if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });

    const now = new Date();

    // ── Auction window checks ─────────────────────────────────────────────
    if (now < rfq.startTime) {
      return res.status(400).json({ success: false, message: "Auction has not started yet" });
    }
    if (now >= rfq.forcedCloseTime) {
      if (rfq.status !== "FORCE_CLOSED") {
        rfq.status = "FORCE_CLOSED";
        rfq.addLog("AUCTION_CLOSED", "Auction force-closed — forced close time reached");
        await rfq.save();
      }
      return res.status(400).json({ success: false, message: "Auction is force-closed" });
    }
    if (now >= rfq.bidCloseTime) {
      if (rfq.status !== "CLOSED") {
        rfq.status = "CLOSED";
        rfq.addLog("AUCTION_CLOSED", "Auction closed — bid close time reached");
        await rfq.save();
      }
      return res.status(400).json({ success: false, message: "Auction is closed" });
    }

    // ── Fetch existing bids for rank analysis ─────────────────────────────
    const existingBids = await Bid.find({ rfqId }).sort({ price: 1 }).lean();
    const existingPrices = existingBids.map((b) => b.price);

    // ── British Auction Extension Logic ───────────────────────────────────
    let timeExtended = false;
    let oldBidCloseTime = rfq.bidCloseTime;
    let extensionTriggerType = null;

    const msUntilClose = rfq.bidCloseTime.getTime() - now.getTime();
    const triggerWindowMs = rfq.triggerWindow * 60 * 1000;
    const withinTriggerWindow = msUntilClose <= triggerWindowMs;

    if (withinTriggerWindow) {
      let shouldExtend = false;

      switch (rfq.extensionTrigger) {
        case "BID_RECEIVED":
          // Any bid within trigger window → extend
          shouldExtend = true;
          extensionTriggerType = "BID_RECEIVED";
          break;

        case "ANY_RANK_CHANGE":
          // Extend if the new bid changes anyone's ranking position
          shouldExtend = anyRankChanged(existingPrices, totalPrice);
          if (shouldExtend) extensionTriggerType = "ANY_RANK_CHANGE";
          break;

        case "L1_RANK_CHANGE":
          // Extend only if the new bid becomes the new lowest (L1)
          shouldExtend = l1Changed(existingPrices, totalPrice);
          if (shouldExtend) extensionTriggerType = "L1_RANK_CHANGE";
          break;

        default:
          shouldExtend = true;
      }

      if (shouldExtend) {
        const proposed = new Date(rfq.bidCloseTime.getTime() + rfq.extensionDuration * 60 * 1000);
        const newClose = proposed <= rfq.forcedCloseTime ? proposed : rfq.forcedCloseTime;

        if (newClose > rfq.bidCloseTime) {
          rfq.bidCloseTime = newClose;
          timeExtended = true;
        }
      }
    }

    // ── Save the new bid ──────────────────────────────────────────────────
    const bid = new Bid({
      rfqId,
      supplierId,
      supplierName,
      carrierName,
      freightCharges: freight,
      originCharges: origin,
      destinationCharges: destination,
      price: totalPrice,
      transitTime: Number(transitTime),
      quoteValidity: new Date(quoteValidity),
      placedAt: now,
      triggeredExtension: timeExtended,
      extensionTriggerType,
      rankAtSubmission: existingBids.length + 1,
    });
    await bid.save();

    // ── Activity logs ─────────────────────────────────────────────────────
    rfq.addLog(
      "BID_PLACED",
      `${supplierName} (${carrierName}) submitted a quote of ₹${totalPrice.toLocaleString("en-IN")}`,
      { supplierId, supplierName, carrierName, price: totalPrice, bidId: bid._id }
    );

    if (timeExtended) {
      const triggerLabels = {
        BID_RECEIVED: "bid received in trigger window",
        ANY_RANK_CHANGE: "supplier ranking changed in trigger window",
        L1_RANK_CHANGE: "L1 (lowest bidder) changed in trigger window",
      };
      rfq.addLog(
        "TIME_EXTENDED",
        `Bid close time extended by ${rfq.extensionDuration} min(s) — ${triggerLabels[extensionTriggerType]}`,
        {
          oldBidCloseTime,
          newBidCloseTime: rfq.bidCloseTime,
          extensionDuration: rfq.extensionDuration,
          triggeredBy: supplierName,
          triggerType: extensionTriggerType,
          reason: triggerLabels[extensionTriggerType],
        }
      );
    }

    // ── Update denormalized lowest bid on RFQ ─────────────────────────────
    const currentLowest = await Bid.findOne({ rfqId }).sort({ price: 1 }).lean();
    if (currentLowest) {
      rfq.lowestBid = {
        price: currentLowest.price,
        supplierId: currentLowest.supplierId,
        supplierName: currentLowest.supplierName,
      };
    }

    await rfq.save();

    // ── Re-fetch all bids sorted for response ─────────────────────────────
    const allBids = await Bid.find({ rfqId }).sort({ price: 1, placedAt: 1 }).lean();
    const rankedBids = allBids.map((b, idx) => ({ ...b, rank: `L${idx + 1}` }));

    // ── Emit real-time updates ────────────────────────────────────────────
    const io = req.app.get("io");

    io.to(`rfq:${rfqId}`).emit("bid:placed", {
      bid: {
        ...bid.toObject(),
        rank: rankedBids.find((b) => b._id.equals(bid._id))?.rank,
      },
      rankedBids,
      rfq: {
        _id: rfq._id,
        bidCloseTime: rfq.bidCloseTime,
        forcedCloseTime: rfq.forcedCloseTime,
        lowestBid: rfq.lowestBid,
        activityLogs: rfq.activityLogs,
        status: rfq.status,
      },
      timeExtended,
      ...(timeExtended && {
        extension: {
          oldBidCloseTime,
          newBidCloseTime: rfq.bidCloseTime,
          extensionDuration: rfq.extensionDuration,
          triggerType: extensionTriggerType,
        },
      }),
    });

    io.emit("rfq:updated", {
      rfqId,
      bidCloseTime: rfq.bidCloseTime,
      lowestBid: rfq.lowestBid,
      status: rfq.status,
    });

    return res.status(201).json({
      success: true,
      message: "Quote submitted successfully",
      data: {
        bid: bid.toObject(),
        timeExtended,
        newBidCloseTime: rfq.bidCloseTime,
        currentRanking: rankedBids,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { placeBid };
