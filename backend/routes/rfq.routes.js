const express = require("express");
const router = express.Router();
const { createRFQ, listRFQs, getRFQ } = require("../controllers/rfq.controller");

router.post("/create", createRFQ);
router.get("/list", listRFQs);
router.get("/:id", getRFQ);

module.exports = router;
