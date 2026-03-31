// sockets/handlers/livefeed.handlers.ts (SERVICE IMPLEMENTATION)

import { Socket } from "socket.io";
// Import Service Layer
import { LiveFeedService } from "../../services/livefeed.service";
import { namespaceManager } from "../services/namespace.manager";
import { LiveFeedTypeEnum, LiveFeedPriorityEnum } from "../../models/LiveFeed"; // Enums might still be useful for types

// Interface definitions (Kept as is for socket data shape)
interface LiveFeedData {
  eventId: string;
  content: string;
  type?: LiveFeedTypeEnum;
  priority?: LiveFeedPriorityEnum;
}
interface ReactionData {
  postId: string;
  emoji: string;
}
interface PinData {
  postId: string;
  pin: boolean; // Note: Service uses togglePin, which doesn't need this, but handler can keep it for client-side context
}
interface DeleteData {
  postId: string;
}
// ... (SocketUser interface omitted for brevity)

// Utility function for error handling in handlers
const handleSocketError = (error: any, callback?: Function) => {
  const errorMessage =
    error instanceof Error ? error.message : "An unknown error occurred";
  if (callback) {
    callback({ success: false, error: errorMessage });
  }
  // Optionally emit a generic error event
  // socket.emit("error", { message: errorMessage });
};

export const setupLiveFeedHandlers = (socket: Socket) => {
  const userId = socket.data.user?.id || "anonymous";
  const userName = socket.data.user?.name || "Anonymous";
  const userRole = socket.data.user?.role || "participant";

  // 1. JOIN EVENT - USES LiveFeedService.getPosts
  socket.on(
    "livefeed:join",
    async ({ eventId }: { eventId: string }, callback: Function) => {
      try {
        await socket.join(`livefeed:${eventId}`);
        namespaceManager.registerConnection(socket, "livefeed", eventId);
        console.log(`👤 ${userName} joined livefeed:${eventId}`);

        if (callback) {
          callback({
            success: true,
            eventId,
            message: `Joined livefeed:${eventId}`,
          });
        }
        socket.emit("livefeed:joined", { eventId });

        // Fetch posts via Service
        const { items: posts } = await LiveFeedService.getPosts({
          eventId,
          page: 1,
          limit: 50,
        });
        socket.emit("livefeed:posts", { eventId, posts });
      } catch (error) {
        handleSocketError(error, callback);
      }
    }
  );

  // 2. CREATE POST - USES LiveFeedService.createPost
  socket.on(
    "livefeed:post:create",
    async (data: LiveFeedData, callback?: Function) => {
      try {
        // Business logic (validation, saving, population) is entirely in the service
        const post = await LiveFeedService.createPost({
          eventId: data.eventId,
          authorId: userId,
          content: data.content,
          type: data.type,
          priority: data.priority,
        });

        namespaceManager.updateActivity(socket.id);

        if (callback) {
          callback({ success: true, postId: post._id, post });
        }
        // Broadcast the fully populated post
        socket
          .to(`livefeed:${data.eventId}`)
          .emit("livefeed:post:new", { post });
        socket.emit("livefeed:post:created", { post });
      } catch (error) {
        handleSocketError(error, callback);
      }
    }
  );

  // 3. ADD REACTION - USES LiveFeedService.addReaction
  socket.on(
    "livefeed:reaction:add",
    async (data: ReactionData, callback?: Function) => {
      try {
        // Fully updated + normalized post
        const post = await LiveFeedService.addReaction({
          postId: data.postId,
          emoji: data.emoji,
          userId: userId,
        });

        namespaceManager.updateActivity(socket.id);

        const eventId = post.event.id; // FIXED (normalizePost removed _id)

        // Acknowledge to caller
        if (callback) {
          callback({
            success: true,
            postId: data.postId,
            reactions: post.reactions,
            post,
          });
        }

        // Notify all other users in the room
        socket.to(`livefeed:${eventId}`).emit("livefeed:reaction:updated", {
          postId: data.postId,
          reactions: post.reactions,
          post,
        });

        // Notify the triggering user (same event name for consistency)
        socket.emit("livefeed:reaction:updated", {
          postId: data.postId,
          reactions: post.reactions,
          post,
        });
      } catch (error) {
        handleSocketError(error, callback);
      }
    }
  );

  // 4. PIN/UNPIN - USES LiveFeedService.togglePin
  /* ---------------- PIN ---------------- */
  socket.on(
    "livefeed:post:pin",
    async (data: PinData, callback?: Function) => {
      try {
        const post = await LiveFeedService.togglePin(data);

        namespaceManager.updateActivity(socket.id);

        const eventId = post.event.id;

        if (callback) {
          callback({
            success: true,
            postId: data.postId,
            isPinned: post.isPinned,
            post,
          });
        }

        socket
          .to(`livefeed:${eventId}`)
          .emit("livefeed:post:pinned", { postId: data.postId, isPinned: post.isPinned, post });

        socket.emit("livefeed:post:pinned", { postId: data.postId, isPinned: post.isPinned, post });
      } catch (error) {
        handleSocketError(error, callback);
      }
    }
  );

  // 5. DELETE - USES LiveFeedService.deletePost
  socket.on(
    "livefeed:post:delete",
    async (data: DeleteData, callback?: Function) => {
      try {
        // Need eventId for broadcasting deletion. Get it before deleting.
        const postToDelete = await LiveFeedService.getPost(data.postId);
        const eventId = postToDelete.event._id;

        // The service handles permission check and deletion
        await LiveFeedService.deletePost({
          postId: data.postId,
          userId: userId,
          userRole: userRole,
        });

        namespaceManager.updateActivity(socket.id);

        if (callback) {
          callback({ success: true, postId: data.postId });
        }
        // Broadcast the deletion
        socket.to(`livefeed:${eventId}`).emit("livefeed:post:deleted", {
          postId: data.postId,
          deletedBy: { id: userId, name: userName, role: userRole },
        });
        socket.emit("livefeed:post:deleted", { postId: data.postId });
      } catch (error) {
        handleSocketError(error, callback);
      }
    }
  );
  socket.on(
    "livefeed:post:breaking",
    async (data: { postId: string }, callback?: Function) => {
      try {
        const post = await LiveFeedService.toggleBreaking({
          postId: data.postId,
          userRole,
        });

        namespaceManager.updateActivity(socket.id);

        const eventId = post.event.id; // IMPORTANT: normalized from _id → id

        // ACK to caller
        if (callback) {
          callback({
            success: true,
            postId: data.postId,
            isBreaking: post.isBreaking,
            post,
          });
        }

        // Broadcast to room (everyone else)
        socket
          .to(`livefeed:${eventId}`)
          .emit("livefeed:post:breaking:updated", {
            postId: data.postId,
            isBreaking: post.isBreaking,
            post,
          });

        // Emit also to the caller for local update
        socket.emit("livefeed:post:breaking:updated", {
          postId: data.postId,
          isBreaking: post.isBreaking,
          post,
        });
      } catch (error) {
        handleSocketError(error, callback);
      }
    }
  );

  // 6. UPDATE POST - USES LiveFeedService.updatePost
  socket.on(
    "livefeed:post:update",
    async (
      data: {
        postId: string;
        content: string;
        type?: string;
        priority?: string;
      },
      callback?: Function
    ) => {
      try {
        // The service handles permission check, update, and population
        const post = await LiveFeedService.updatePost({
          postId: data.postId,
          userId: userId,
          content: data.content,
          type: data.type,
          priority: data.priority,
          userRole: userRole,
        });

        namespaceManager.updateActivity(socket.id);

        if (callback) {
          callback({ success: true, post });
        }
        // Broadcast the updated post
        socket
          .to(`livefeed:${post.event._id}`)
          .emit("livefeed:post:updated", { post });
        socket.emit("livefeed:post:updated", { post });
      } catch (error) {
        handleSocketError(error, callback);
      }
    }
  );

  // LEAVE EVENT (Unchanged - transport logic)
  socket.on(
    "livefeed:leave",
    ({ eventId }: { eventId: string }, callback?: Function) => {
      socket.leave(`livefeed:${eventId}`);
      namespaceManager.removeConnection(socket.id);
      if (callback) {
        callback({
          success: true,
          eventId,
          message: `Left livefeed:${eventId}`,
        });
      }
      socket.emit("livefeed:left", { eventId });
    }
  );

  // Handle disconnection cleanup (Unchanged)
  socket.on("disconnect", () => {
    namespaceManager.removeConnection(socket.id);
  });
};
