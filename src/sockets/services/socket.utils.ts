// sockets/services/socket.utils.ts
import { namespaceManager } from "./namespace.manager";

export const SocketUtils = {
  /**
   * Notify all facilitators in an event
   */
  notifyFacilitators(eventId: string, eventName: string, data: any): void {
    const io = namespaceManager.getIO();
    const connections = namespaceManager.getConnectionsByEvent(eventId);
    
    connections.forEach((connection) => {
      if (['facilitator', 'admin'].includes(connection.userRole)) {
        io.to(connection.socketId).emit(eventName, data);
      }
    });
  },

  /**
   * Send a system announcement to all users in an event
   */
  sendSystemAnnouncement(eventId: string, message: string, type: 'info' | 'warning' | 'success' = 'info'): void {
    namespaceManager.broadcastToEvent(
      eventId,
      '*', // All tools
      'system:announcement',
      { message, type, timestamp: new Date() }
    );
  },

  /**
   * Kick user from all event rooms
   */
  kickUserFromEvent(userId: string, eventId: string, reason?: string): void {
    const io = namespaceManager.getIO();
    const userConnections = namespaceManager.getConnectionsByUser(userId);
    
    userConnections.forEach((connection) => {
      if (connection.eventId === eventId) {
        const socket = io.sockets.sockets.get(connection.socketId);
        if (socket) {
          socket.emit('system:kicked', { eventId, reason });
          socket.leave(`livefeed:${eventId}`);
          socket.leave(`poll:${eventId}`);
          socket.leave(`qna:${eventId}`);
          // ... leave all other rooms
        }
      }
    });
  },

  /**
   * Get online users in an event
   */
  getOnlineUsers(eventId: string): Array<{ userId: string; name: string; role: string; tools: string[] }> {
    const connections = namespaceManager.getConnectionsByEvent(eventId);
    const usersMap = new Map();
    
    connections.forEach((connection) => {
      if (!usersMap.has(connection.userId)) {
        usersMap.set(connection.userId, {
          userId: connection.userId,
          name: connection.userName,
          role: connection.userRole,
          tools: []
        });
      }
      
      const user = usersMap.get(connection.userId);
      if (!user.tools.includes(connection.tool)) {
        user.tools.push(connection.tool);
      }
    });
    
    return Array.from(usersMap.values());
  }
};