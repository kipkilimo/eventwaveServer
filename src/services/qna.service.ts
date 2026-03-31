// src/services/qna.service.ts
import { QnA, IQnA } from "../models/QnA";
import { Types } from "mongoose";

export const qnaService = {
  async fetchEventQnA(eventId: string): Promise<IQnA[]> {
    return QnA.find({ event: eventId }).sort({ createdAt: -1 });
  },

  async createQnA(data: Partial<IQnA> & { userId: string }): Promise<IQnA> {
    const qna = new QnA({
      ...data,
      askedBy: data.userId,
      isAnswered: false,
    });
    return qna.save();
  },

  async answerQnA({ qnaId, answer, userId }: { qnaId: string; answer: string; userId: string }): Promise<IQnA | null> {
    return QnA.findByIdAndUpdate(
      qnaId,
      { answer, answeredBy: userId, isAnswered: true },
      { new: true }
    );
  },

  async toggleUpvote(qnaId: string, userId: string): Promise<IQnA | null> {
    const qna = await QnA.findById(qnaId);
    if (!qna) return null;

    const userIndex = qna.upvotes.findIndex(u => u.toString() === userId);
    if (userIndex > -1) qna.upvotes.splice(userIndex, 1);
    else qna.upvotes.push(new Types.ObjectId(userId));

    return qna.save();
  },

  async addSatisfaction({ qnaId, score, userId }: { qnaId: string; score: number; userId: string }): Promise<IQnA | null> {
    const qna = await QnA.findById(qnaId);
    if (!qna) return null;

    const existing = qna.satisfactionScores.find(s => s.user.toString() === userId);
    if (existing) existing.score = score;
    else qna.satisfactionScores.push({ user: new Types.ObjectId(userId), score, updatedAt: new Date() });

    return qna.save();
  },

  async pinQnA(qnaId: string, pinned: boolean): Promise<IQnA | null> {
    return QnA.findByIdAndUpdate(qnaId, { isPinned: pinned }, { new: true });
  },
};
