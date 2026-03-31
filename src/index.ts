import "dotenv/config";
import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import bodyParser from "body-parser";
import cors from "cors";
import http from "http";
import https from "https";
import fs from "fs";
import os from "os";
import { Server } from "socket.io";
import routes from "./routers";

import connectDatabase from "./config/database";
import { typeDefs } from "./graphql/schema/typeDefs";
import resolvers from "./graphql/resolvers";
import { createContext } from "./graphql/context";
import { registerAllHandlers } from "./sockets/handlers";
import { authMiddleware } from "./middleware/auth.middleware";
import { namespaceManager } from "./sockets/services/namespace.manager";
import "./models";
import { startScheduler } from "./routers";

let started = false;

export let socketIO: Server | null = null;
export let server: http.Server | https.Server | null = null;

const normalize = (url: string) => url?.replace(/\/$/, "");

// ✅ Get local IP dynamically
const getLocalIp = () => {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
};

export const startServer = async () => {
  if (started) return { httpServer: server, io: socketIO };
  started = true;

  const app = express();

  // ==============================
  // CORS — Allow LAN + local dev
  // ==============================
  const clientOrigin = normalize(
    process.env.NODE_ENV === "production"
      ? process.env.CLIENT_URL || ""
      : process.env.CLIENT_DEV_URL || "http://localhost:5173",
  );

  const LAN_ORIGINS = [
    clientOrigin,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (
          LAN_ORIGINS.includes(origin) ||
          origin.startsWith("http://192.168.") ||
          origin.startsWith("http://10.") ||
          origin.startsWith("http://172.")
        ) {
          return callback(null, true);
        }

        return callback(new Error("❌ CORS Blocked"));
      },
      credentials: true,
    }),
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ==============================
  // Apollo GraphQL
  // ==============================
  const apolloServer = new ApolloServer({ typeDefs, resolvers });
  await apolloServer.start();

  app.use(
    "/graphql",
    bodyParser.json(),
    expressMiddleware(apolloServer, {
      context: async ({ req, res }) => createContext({ req, res }),
    }),
  );

  app.use("/api", routes);

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/connections", (req, res) => {
    res.json(namespaceManager.getActiveConnections());
  });

  // ==============================
  // Database
  // ==============================
  await connectDatabase();

  // ==============================
  // HTTP/HTTPS SERVER
  // ==============================
  const PORT = process.env.PORT || 4003;
  let httpServerInternal;

  if (process.env.NODE_ENV === "production") {
    const cert = process.env.SSL_CERT_PATH;
    const key = process.env.SSL_KEY_PATH;

    if (cert && key && fs.existsSync(cert) && fs.existsSync(key)) {
      httpServerInternal = https.createServer(
        {
          key: fs.readFileSync(key),
          cert: fs.readFileSync(cert),
        },
        app,
      );
    } else {
      httpServerInternal = http.createServer(app);
    }
  } else {
    httpServerInternal = http.createServer(app);
  }

  // ==============================
  // Socket.IO (LAN support)
  // ==============================
  const io = new Server(httpServerInternal, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (
          LAN_ORIGINS.includes(origin) ||
          origin.startsWith("http://192.168.") ||
          origin.startsWith("http://10.") ||
          origin.startsWith("http://172.")
        ) {
          return callback(null, true);
        }

        return callback(new Error("❌ Socket.IO CORS Blocked"));
      },
      credentials: true,
    },
    path: "/socket.io/",
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    socket.on("disconnect", () => {});
  });

  io.use(authMiddleware);
  namespaceManager.initialize(io);
  registerAllHandlers(io);

  // ==============================
  // Start server
  // ==============================
  const HOST = "0.0.0.0";

  httpServerInternal.listen({ port: PORT, host: HOST }, () => {
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const IP = getLocalIp();

    console.log(`📡 GraphQL: ${protocol}://${IP}:${PORT}/graphql`);
    console.log(`⚡ Socket.IO: ${protocol}://${IP}:${PORT}`);
    console.log(`🔌 Socket path: /socket.io/`);
    console.log(`🩺 Health: ${protocol}://${IP}:${PORT}/health`);
    console.log(`🌐 Accessible on LAN IP: ${IP}`);
  });

  server = httpServerInternal;
  socketIO = io;

  return { httpServer: httpServerInternal, io };
};

// ==============================
// Auto-start
// ==============================
if (process.env.AUTO_START !== "false") {
  startServer().catch((err) => console.error("❌ Startup failed:", err));
  startScheduler();
}
