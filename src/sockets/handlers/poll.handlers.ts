// sockets/handlers/poll.handler.ts
import { Socket } from "socket.io";
import { Poll } from "../../models/Poll";

export const setupPollHandlers = (socket: Socket) => {
  const userId = socket.data.user?.id;
  const userRole = socket.data.user?.role || "participant";

  // 1. JOIN POLL ROOM
  socket.on("poll:join", async ({ eventId, pollId }: { eventId: string; pollId?: string }) => {
    try {
      const room = pollId ? `poll:${pollId}` : `poll:event:${eventId}`;
      await socket.join(room);
      
      if (pollId) {
        const poll = await Poll.findById(pollId);
        socket.emit("poll:joined", { pollId, poll });
      } else {
        const polls = await Poll.find({ eventId, isActive: true });
        socket.emit("poll:list", { eventId, polls });
      }
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 2. CREATE POLL (Facilitator only)
  socket.on("poll:create", async (data: {
    eventId: string;
    question: string;
    options: string[];
    isAnonymous?: boolean;
  }) => {
    try {
      if (!["facilitator", "admin"].includes(userRole)) {
        throw new Error("Unauthorized to create polls");
      }

      const poll = new Poll({
        eventId: data.eventId,
        question: data.question,
        options: data.options.map(option => ({
          text: option,
          votes: 0,
          voters: []
        })),
        createdBy: userId,
        isAnonymous: data.isAnonymous || false,
        isActive: true,
        totalVotes: 0
      });

      await poll.save();

      socket.to(`poll:event:${data.eventId}`).emit("poll:created", { poll });

    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 3. VOTE ON POLL
  socket.on("poll:vote", async (data: { pollId: string; optionIndex: number }) => {
    try {
      const poll = await Poll.findById(data.pollId);
      if (!poll) throw new Error("Poll not found");
      if (!poll.isActive) throw new Error("Poll is closed");

      // Remove previous vote if any
      poll.options.forEach(option => {
        const voterIndex = option.voters.indexOf(userId);
        if (voterIndex > -1) {
          option.votes--;
          option.voters.splice(voterIndex, 1);
          poll.totalVotes--;
        }
      });

      // Add new vote
      poll.options[data.optionIndex].votes++;
      poll.options[data.optionIndex].voters.push(userId);
      poll.totalVotes++;

      await poll.save();

      socket.to(`poll:${data.pollId}`).emit("poll:updated", { 
        pollId: data.pollId, 
        options: poll.options,
        totalVotes: poll.totalVotes
      });

    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 4. TOGGLE POLL ACTIVE STATE
  socket.on("poll:toggle", async (data: { pollId: string; isActive: boolean }) => {
    try {
      if (!["facilitator", "admin"].includes(userRole)) {
        throw new Error("Unauthorized to toggle polls");
      }

      await Poll.findByIdAndUpdate(data.pollId, { 
        isActive: data.isActive 
      });

      socket.to(`poll:${data.pollId}`).emit("poll:toggled", {
        pollId: data.pollId,
        isActive: data.isActive
      });

    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  // 5. END POLL
  socket.on("poll:end", async (data: { pollId: string }) => {
    try {
      if (!["facilitator", "admin"].includes(userRole)) {
        throw new Error("Unauthorized to end polls");
      }

      await Poll.findByIdAndUpdate(data.pollId, { 
        isActive: false,
        endedAt: new Date()
      });

      socket.to(`poll:event:${data.eventId}`).emit("poll:ended", { pollId: data.pollId });

    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });
};