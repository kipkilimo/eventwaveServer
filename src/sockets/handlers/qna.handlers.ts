import { Server as SocketIOServer } from "socket.io";
import type { QnA } from "../../types/qna.types";

let io: SocketIOServer;

export const setSocketIOInstance = (ioInstance: SocketIOServer) => {
  io = ioInstance;
};

export const qnaSocket = {
  broadcastNewQnA(eventId: string, qna: QnA) {
    io?.to(eventId).emit("qna:new", qna);
  },

  broadcastQnAUpdate(eventId: string, qna: QnA) {
    io?.to(eventId).emit("qna:update", qna);
  },
};
