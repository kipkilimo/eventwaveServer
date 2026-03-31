// sockets/services/namespace.manager.ts
import { Server, Socket } from "socket.io";

interface ConnectionInfo {
  socketId: string;
  userId: string;
  userName: string;
  userRole: string;
  eventId?: string;
  tool: string; // 'livefeed', 'poll', 'qna', etc.
  joinedAt: Date;
  lastActivity: Date;
}

interface EventConnections {
  [eventId: string]: {
    [tool: string]: ConnectionInfo[];
  };
}

interface UserConnections {
  [userId: string]: ConnectionInfo[];
}

class NamespaceManager {
  private io: Server | null = null;
  private connections: Map<string, ConnectionInfo> = new Map(); // socketId -> ConnectionInfo
  private eventConnections: EventConnections = {};
  private userConnections: UserConnections = {};

  initialize(io: Server) {
    this.io = io;
    console.log("✅ Namespace Manager initialized");
  }

  getIO(): Server {
    if (!this.io) {
      throw new Error("Socket.IO server not initialized. Call initialize() first.");
    }
    return this.io;
  }

  /**
   * Register a new connection
   */
  registerConnection(socket: Socket, tool: string, eventId?: string): ConnectionInfo {
    const connectionInfo: ConnectionInfo = {
      socketId: socket.id,
      userId: socket.data.user?.id || "anonymous",
      userName: socket.data.user?.name || "Anonymous",
      userRole: socket.data.user?.role || "participant",
      eventId,
      tool,
      joinedAt: new Date(),
      lastActivity: new Date(),
    };

    this.connections.set(socket.id, connectionInfo);

    // Store by event
    if (eventId) {
      if (!this.eventConnections[eventId]) {
        this.eventConnections[eventId] = {};
      }
      if (!this.eventConnections[eventId][tool]) {
        this.eventConnections[eventId][tool] = [];
      }
      this.eventConnections[eventId][tool].push(connectionInfo);
    }

    // Store by user
    if (connectionInfo.userId !== "anonymous") {
      if (!this.userConnections[connectionInfo.userId]) {
        this.userConnections[connectionInfo.userId] = [];
      }
      this.userConnections[connectionInfo.userId].push(connectionInfo);
    }

    this.logConnection("➕", connectionInfo);
    return connectionInfo;
  }

  /**
   * Update connection activity
   */
  updateActivity(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  /**
   * Remove a connection
   */
  removeConnection(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (!connection) return;

    // Remove from connections map
    this.connections.delete(socketId);

    // Remove from event connections
    if (connection.eventId && this.eventConnections[connection.eventId]?.[connection.tool]) {
      this.eventConnections[connection.eventId][connection.tool] = this.eventConnections[
        connection.eventId
      ][connection.tool].filter((conn) => conn.socketId !== socketId);

      // Clean up empty arrays
      if (this.eventConnections[connection.eventId][connection.tool].length === 0) {
        delete this.eventConnections[connection.eventId][connection.tool];
      }
    }

    // Remove from user connections
    if (connection.userId !== "anonymous" && this.userConnections[connection.userId]) {
      this.userConnections[connection.userId] = this.userConnections[connection.userId].filter(
        (conn) => conn.socketId !== socketId
      );

      if (this.userConnections[connection.userId].length === 0) {
        delete this.userConnections[connection.userId];
      }
    }

    this.logConnection("➖", connection);
  }

  /**
   * Get all connections for a specific event and tool
   */
  getConnectionsByEvent(eventId: string, tool?: string): ConnectionInfo[] {
    if (!this.eventConnections[eventId]) return [];

    if (tool) {
      return this.eventConnections[eventId][tool] || [];
    }

    // Return all connections for the event
    return Object.values(this.eventConnections[eventId]).flat();
  }

  /**
   * Get all connections for a specific user
   */
  getConnectionsByUser(userId: string): ConnectionInfo[] {
    return this.userConnections[userId] || [];
  }

  /**
   * Get all active connections grouped by tool
   */
  getActiveConnections(): {
    total: number;
    byTool: { [tool: string]: number };
    byEvent: { [eventId: string]: number };
  } {
    const byTool: { [tool: string]: number } = {};
    const byEvent: { [eventId: string]: number } = {};

    this.connections.forEach((connection) => {
      // Count by tool
      byTool[connection.tool] = (byTool[connection.tool] || 0) + 1;

      // Count by event
      if (connection.eventId) {
        byEvent[connection.eventId] = (byEvent[connection.eventId] || 0) + 1;
      }
    });

    return {
      total: this.connections.size,
      byTool,
      byEvent,
    };
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const now = new Date();
    const activeConnections = Array.from(this.connections.values()).filter(
      (conn) => now.getTime() - conn.lastActivity.getTime() < 5 * 60 * 1000 // Last 5 minutes
    );

    return {
      totalConnections: this.connections.size,
      activeConnections: activeConnections.length,
      uniqueUsers: Object.keys(this.userConnections).length,
      eventsWithConnections: Object.keys(this.eventConnections).length,
      connectionDistribution: this.getActiveConnections(),
    };
  }

  /**
   * Broadcast to all connections in an event for a specific tool
   */
  broadcastToEvent(eventId: string, tool: string, eventName: string, data: any): void {
    if (!this.io) return;

    const room = `${tool}:${eventId}`;
    this.io.to(room).emit(eventName, data);
    console.log(`📢 Broadcast to ${room}: ${eventName}`, { eventId, tool });
  }

  /**
   * Send to specific user across all their connections
   */
  sendToUser(userId: string, eventName: string, data: any): void {
    if (!this.io) return;

    const userConnections = this.getConnectionsByUser(userId);
    userConnections.forEach((connection) => {
      this.io?.to(connection.socketId).emit(eventName, data);
    });

    if (userConnections.length > 0) {
      console.log(`📨 Sent to user ${userId}: ${eventName}`, { connections: userConnections.length });
    }
  }

  /**
   * Clean up inactive connections (for maintenance)
   */
  cleanupInactiveConnections(maxInactiveMinutes = 30): number {
    const now = new Date();
    const inactiveThreshold = maxInactiveMinutes * 60 * 1000;
    let cleaned = 0;

    this.connections.forEach((connection, socketId) => {
      const inactiveTime = now.getTime() - connection.lastActivity.getTime();
      if (inactiveTime > inactiveThreshold) {
        // Force disconnect
        const socket = this.io?.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
        this.removeConnection(socketId);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} inactive connections`);
    }

    return cleaned;
  }

  /**
   * Get all events with active connections
   */
  getActiveEvents(): string[] {
    return Object.keys(this.eventConnections);
  }

  /**
   * Check if user is connected to an event
   */
  isUserConnectedToEvent(userId: string, eventId: string): boolean {
    const userConnections = this.getConnectionsByUser(userId);
    return userConnections.some((conn) => conn.eventId === eventId);
  }

  /**
   * Get all tools a user is using in an event
   */
  getUserEventTools(userId: string, eventId: string): string[] {
    const userConnections = this.getConnectionsByUser(userId);
    const tools = new Set<string>();

    userConnections.forEach((conn) => {
      if (conn.eventId === eventId) {
        tools.add(conn.tool);
      }
    });

    return Array.from(tools);
  }

  /**
   * Private helper for logging
   */
  private logConnection(action: string, connection: ConnectionInfo): void {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const eventInfo = connection.eventId ? ` | Event: ${connection.eventId}` : '';
    console.log(
      `${action} [${timestamp}] ${connection.tool.toUpperCase()} | ${connection.userName} (${connection.userId})${eventInfo}`
    );
  }
}

// Singleton instance
export const namespaceManager = new NamespaceManager();