import { qnaService } from "../../services/qna.service";
import { qnaSocket } from "../../sockets/handlers/qna.handlers";
import { normalizeQnA } from "../../utils/qna.normalizer";

const serviceAvailable = () => {
  if (!qnaService || !qnaSocket) {
    console.error("QnA service or socket handler not available.");
    return false;
  }
  return true;
};

export const qnaResolvers = {
  Query: {
    eventQnA: async (_: any, { eventId }: { eventId: string }) => {
      const qnas = await qnaService.fetchEventQnA(eventId);
      return qnas.map(normalizeQnA).filter(Boolean);
    },
  },

  Mutation: {
    async createQnA(_: any, { input }: any, ctx: any) {
      if (!serviceAvailable() || !ctx?.user?.id) return null;
      const qna = await qnaService.createQnA({ ...input, userId: ctx.user.id });
      const payload = normalizeQnA(qna);
      if (payload) qnaSocket.broadcastNewQnA(payload.event, payload);
      return payload;
    },

    async answerQnA(_: any, { input }: any, ctx: any) {
      if (!serviceAvailable() || !ctx?.user?.id) return null;
      const qna = await qnaService.answerQnA({ ...input, userId: ctx.user.id });
      const payload = normalizeQnA(qna);
      if (payload) qnaSocket.broadcastQnAUpdate(payload.event, payload);
      return payload;
    },

    async toggleUpvote(_: any, { input }: any, ctx: any) {
      if (!serviceAvailable() || !ctx?.user?.id) return null;
      const qna = await qnaService.toggleUpvote(input.qnaId, ctx.user.id);
      const payload = normalizeQnA(qna);
      if (payload) qnaSocket.broadcastQnAUpdate(payload.event, payload);
      return payload;
    },

    async addSatisfaction(_: any, { input }: any, ctx: any) {
      if (!serviceAvailable() || !ctx?.user?.id) return null;
      const qna = await qnaService.addSatisfaction({ ...input, userId: ctx.user.id });
      const payload = normalizeQnA(qna);
      if (payload) qnaSocket.broadcastQnAUpdate(payload.event, payload);
      return payload;
    },

    async pinQnA(_: any, { qnaId, pinned }: any) {
      if (!serviceAvailable()) return null;
      const qna = await qnaService.pinQnA(qnaId, pinned);
      const payload = normalizeQnA(qna);
      if (payload) qnaSocket.broadcastQnAUpdate(payload.event, payload);
      return payload;
    },
  },

  QnA: {
    upvoteCount: (qna: any) => qna?.upvoteCount ?? 0,
  },
};
