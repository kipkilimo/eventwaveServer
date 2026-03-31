// src/utils/qna.normalizer.ts
import { IQnA } from "../models/QnA";
import { QnA as QnAType } from "../types/qna.types";

export const normalizeQnA = (qna: IQnA | null): QnAType | null => {
  if (!qna) return null;
  const obj = "toObject" in qna ? qna.toObject() : qna;

  return {
    id: obj._id?.toString(),
    event: obj.event?.toString() ?? "",
    question: obj.question,
    answer: obj.answer,
    askedBy: obj.askedBy?.toString() ?? null,
    answeredBy: obj.answeredBy?.toString() ?? null,
    isAnonymous: obj.isAnonymous,
    isAnswered: obj.isAnswered,
    isPinned: obj.isPinned,
    tags: obj.tags ?? [],
    upvotes: obj.upvotes?.map(u => u.toString()) ?? [],
    upvoteCount: obj.upvotes?.length ?? 0,
    satisfactionScores: obj.satisfactionScores?.map(s => ({
      user: s.user.toString(),
      score: s.score,
      updatedAt: s.updatedAt,
    })) ?? [],
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
};
