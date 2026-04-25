/**
 * Socket Service
 * Singleton Socket.io client instance
 */

import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

socket.on("connect", () => console.log("[Socket] Connected:", socket.id));
socket.on("disconnect", () => console.log("[Socket] Disconnected"));
socket.on("connect_error", (err) => console.error("[Socket] Error:", err.message));

export default socket;
