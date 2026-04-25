const express = require("express");
const router = express.Router();
const { placeBid } = require("../controllers/bid.controller");

router.post("/place", placeBid);

module.exports = router;
