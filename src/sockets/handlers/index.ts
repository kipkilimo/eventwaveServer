// sockets/handlers/index.ts
import { Server } from "socket.io";
import { setupLiveFeedHandlers } from "./livefeed.handlers";
import { setupAnalyticsHandlers } from "./analytics.handlers";

export const registerAllHandlers = (io: Server) => {
  io.on("connection", (socket) => {
    console.log(`🔌 New connection: ${socket.id}`);
    
    // Register all tool handlers
    setupLiveFeedHandlers(socket);
    setupAnalyticsHandlers(socket);
    
    socket.on("disconnect", () => {
      console.log(`❌ Disconnected: ${socket.id}`);
    });
  });
};