// src/middleware/auth.middleware.ts
import { Socket } from "socket.io";
import { AuthenticatedSocket } from "../types/socket";
import { authenticateUser } from "../utils/auth";

export const authMiddleware = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void,
) => {
  try {
    // Extract token from auth or headers
    const token =
      socket.handshake.auth?.token || socket.handshake.headers?.authorization;

    if (!token) {
      console.log("Socket connection attempt without token");
      return next(new Error("Authentication required"));
    }

    // Use your existing authenticateUser utility
    const user = await authenticateUser(token);

    if (!user) {
      console.log("Socket authentication failed - invalid token");
      return next(new Error("Invalid or expired token"));
    }

    // Attach user to socket
    socket.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    socket.isAuthenticated = true;
    socket.token = token;

    console.log(`Socket authenticated for user: ${user.email} (${user.role})`);
    next();
  } catch (error) {
    console.error("Socket authentication error:", error);
    if (error instanceof Error) {
      return next(error);
    }
    next(new Error("Authentication failed"));
  }
};

// Optional: Role-based middleware
export const requireRole = (requiredRole: string) => {
  return (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    if (!socket.user) {
      return next(new Error("Authentication required"));
    }

    if (socket.user.role !== requiredRole) {
      return next(
        new Error(`Insufficient permissions. Required role: ${requiredRole}`),
      );
    }

    next();
  };
};

// Middleware for specific permission checks
export const requirePermission = (resourceType: string) => {
  return (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    if (!socket.user) {
      return next(new Error("Authentication required"));
    }

    const canCreate = canCreateResource(socket.user, resourceType);
    if (!canCreate) {
      return next(new Error(`No permission to create ${resourceType}`));
    }

    next();
  };
};

// Helper function matching your auth utility
function canCreateResource(user: any, resourceType: string): boolean {
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
