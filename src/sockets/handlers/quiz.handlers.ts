import { Server } from "socket.io";
import type { QnA } from "../../types/qna.types";

let io: Server;

export const initQnASocket = (serverIO: Server) => {
  io = serverIO;

  io.on("connection", (socket) => {
    socket.on("joinEventQnA", (eventId: string) => {
      socket.join(`qna:${eventId}`);
    });

    socket.on("leaveEventQnA", (eventId: string) => {
      socket.leave(`qna:${eventId}`);
    });
  });
};

export const qnaSocket = {
  broadcastNewQnA(qna: QnA) {
    io.to(`qna:${qna.event}`).emit("qna:new", qna);
  },

  broadcastQnAUpdate(qna: QnA) {
    io.to(`qna:${qna.event}`).emit("qna:update", qna);
  },
};
