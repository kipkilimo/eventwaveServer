// sockets/handlers/chat.handler.ts
import { Socket } from "socket.io";
import { ChatMessage } from "../../models/ChatMessage";

export const setupChatHandlers = (socket: Socket) => {
  const userId = socket.data.user?.id;
  const userName = socket.data.user?.name || "Anonymous";
  const userRole = socket.data.user?.role || "participant";

  // 1. JOIN CHAT
  socket.on("chat:join", async ({ eventId }: { eventId: string }) => {
    try {
      await socket.join(`chat:${eventId}`);
      
      const messages = await ChatMessage.find({ eventId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      
      socket.emit("chat:messages", { eventId, messages: messages.reverse() });
      
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 2. SEND MESSAGE
  socket.on("chat:message", async (data: {
    eventId: string;
    message: string;
    replyTo?: string;
  }) => {
    try {
      const chatMessage = new ChatMessage({
        eventId: data.eventId,
        senderId: userId,
        senderName: userName,
        senderRole: userRole,
        message: data.message.trim(),
        replyTo: data.replyTo,
        isDeleted: false
      });

      await chatMessage.save();

      socket.to(`chat:${data.eventId}`).emit("chat:new", { message: chatMessage });
      socket.emit("chat:message:sent", { message: chatMessage });

    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 3. DELETE MESSAGE
  socket.on("chat:delete", async (data: { messageId: string }) => {
    try {
      const message = await ChatMessage.findById(data.messageId);
      if (!message) throw new Error("Message not found");

      const canDelete = message.senderId === userId || ["facilitator", "admin"].includes(userRole);
      if (!canDelete) throw new Error("Unauthorized");

      await ChatMessage.findByIdAndUpdate(data.messageId, {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId
      });

      socket.to(`chat:${message.eventId}`).emit("chat:deleted", { 
        messageId: data.messageId 
      });

    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 4. TYPING INDICATOR
  socket.on("chat:typing", (data: { eventId: string; isTyping: boolean }) => {
    try {
      socket.to(`chat:${data.eventId}`).emit("chat:userTyping", {
        userId,
        userName,
        isTyping: data.isTyping
      });

    } catch (error) {
      console.error("Error in typing indicator:", error);
    }
  });

  // 5. MESSAGE REACTION (like/unlike)
  socket.on("chat:reaction", async (data: {
    messageId: string;
    reaction: string;
  }) => {
    try {
      const message = await ChatMessage.findById(data.messageId);
      if (!message) throw new Error("Message not found");

      const existingReaction = message.reactions.find(r => 
        r.userId === userId && r.reaction === data.reaction
      );

      if (existingReaction) {
        // Remove reaction
        message.reactions = message.reactions.filter(r => 
          !(r.userId === userId && r.reaction === data.reaction)
        );
      } else {
        // Add reaction
        message.reactions.push({
          userId,
          reaction: data.reaction,
          createdAt: new Date()
        });
      }

      await message.save();

      socket.to(`chat:${message.eventId}`).emit("chat:reactionUpdated", {
        messageId: data.messageId,
        reactions: message.reactions
      });

    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });
};