/**
 * Socket.io Event Handler
 * Manages real-time room subscriptions for RFQ auction updates
 */

const initializeSocket = (io) => {
  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Client joins a specific RFQ room to receive live updates
    socket.on("rfq:join", (rfqId) => {
      socket.join(`rfq:${rfqId}`);
      console.log(`[Socket] ${socket.id} joined room rfq:${rfqId}`);
    });

    // Client leaves an RFQ room
    socket.on("rfq:leave", (rfqId) => {
      socket.leave(`rfq:${rfqId}`);
      console.log(`[Socket] ${socket.id} left room rfq:${rfqId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
};

module.exports = { initializeSocket };
