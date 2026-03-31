// src/middleware/socketAuth.ts

import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { config } from "../config";
import { AuthenticatedSocket } from "../types/socket.types";

export const socketAuth = async (
  socket: Socket, 
  next: (err?: Error) => void
) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      console.warn("[SocketAuth] Missing token");
      return next(new Error("Unauthorized: No token provided"));
    }

    const decoded = jwt.verify(token, config.JWT_SECRET) as { id: string };

    if (!decoded?.id) {
      console.warn("[SocketAuth] Invalid token payload");
      return next(new Error("Unauthorized: Invalid token"));
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      console.warn("[SocketAuth] User not found");
      return next(new Error("Unauthorized: User not found"));
    }

    // Type assertion - we're modifying the socket object to match AuthenticatedSocket
    const authSocket = socket as AuthenticatedSocket;
    authSocket.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    console.log(`[SocketAuth] User ${user.name} authenticated`);
    next();
  } catch (err) {
    console.error("[SocketAuth] Auth failed", err);
    
    if (err instanceof jwt.JsonWebTokenError) {
      next(new Error("Unauthorized: Invalid token"));
    } else if (err instanceof jwt.TokenExpiredError) {
      next(new Error("Unauthorized: Token expired"));
    } else {
      next(new Error("Unauthorized: Authentication failed"));
    }
  }
};