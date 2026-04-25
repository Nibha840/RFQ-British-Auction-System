import React, { createContext, useContext, useState, useCallback } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import AuctionList from "./pages/AuctionList";
import AuctionDetail from "./pages/AuctionDetail";
import CreateRFQ from "./pages/CreateRFQ";

// ── Toast Context ─────────────────────────────────────────────────────────────
export const ToastContext = createContext(null);

export const useToast = () => useContext(ToastContext);

const ICONS = { success: "✓", warn: "⚡", error: "✕", info: "ℹ" };

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "success", duration = 4000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const typeClass = { success: "toast-accent", warn: "toast-warn", error: "toast-error", info: "" };

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${typeClass[t.type] || ""}`}>
            <span>{ICONS[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav className="nav">
      <div className="nav-brand">
        <div className="nav-logo-icon">⚡</div>
        <div className="nav-logo">
          RFQ<span>Auction</span>
        </div>
      </div>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Auctions
        </NavLink>
        <NavLink to="/create" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          + New RFQ
        </NavLink>
      </div>
    </nav>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="app-footer">
      RFQ Auction System — Real-Time British Auction Platform &nbsp;·&nbsp; Built with React & Socket.io
    </footer>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ToastProvider>
      <div className="app-shell">
        <Nav />
        <Routes>
          <Route path="/" element={<AuctionList />} />
          <Route path="/rfq/:id" element={<AuctionDetail />} />
          <Route path="/create" element={<CreateRFQ />} />
        </Routes>
        <Footer />
      </div>
    </ToastProvider>
  );
}
