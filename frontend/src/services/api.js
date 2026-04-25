/**
 * API Service
 * Centralised axios instance for all backend calls
 */

import axios from "axios";

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000",
  headers: { "Content-Type": "application/json" },
});

// ── RFQ APIs ──────────────────────────────────────────────────────────────────

export const createRFQ = (payload) => API.post("/rfq/create", payload);
export const listRFQs = () => API.get("/rfq/list");
export const getRFQ = (id) => API.get(`/rfq/${id}`);

// ── Bid APIs ──────────────────────────────────────────────────────────────────

export const placeBid = (payload) => API.post("/bid/place", payload);

export default API;
