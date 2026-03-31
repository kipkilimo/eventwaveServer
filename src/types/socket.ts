// src/types/socket.ts
import { Socket } from "socket.io";
import { IUser } from "../models/User";

// Define SocketUser based on your IUser model
export interface SocketUser extends Pick<IUser, "id" | "email" | "role"> {
  // Add any socket-specific user properties
  connectedAt?: Date;
  rooms?: string[];
}

// Main authenticated socket interface
export interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
  isAuthenticated?: boolean;
  token?: string; // Store the token for easy access

  // You can add role-based methods
  hasRole?(role: string): boolean;
  canCreateResource?(resourceType: string): boolean;
}

// Type guard for authentication
export function isAuthenticatedSocket(
  socket: Socket,
): socket is AuthenticatedSocket {
  const authSocket = socket as AuthenticatedSocket;
  return !!authSocket.user && authSocket.isAuthenticated === true;
}

// Role checking helper
export function socketHasRole(
  socket: AuthenticatedSocket,
  role: string,
): boolean {
  return socket.user?.role === role;
}

// Permission checking helper (matching your auth utility)
export function socketCanCreateResource(
  socket: AuthenticatedSocket,
  resourceType: string,
): boolean {
  const { user } = socket;
  if (!user) return false;

  switch (resourceType) {
    case "Chat":
    case "Feedback":
      return ["PARTICIPANT", "FACILITATOR", "SUPER"].includes(user.role);
    case "Poll":
    case "Test":
    case "QnA":
    case "LiveFeed":
    case "Notice":
    case "Program":
      return ["FACILITATOR", "SUPER"].includes(user.role);
    default:
      return false;
  }
}
