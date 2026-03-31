// src/graphql/types/qna.types.ts
import { Types } from "mongoose";

export interface QnA {
  id?: string; // optional for Mongo -> GraphQL mapping
  event: string;
  question: string;
  answer?: string;
  askedBy?: string | null;
  answeredBy?: string | null;
  isAnonymous?: boolean;
  isAnswered: boolean;
  isPinned: boolean;
  tags: string[];
  upvotes: string[];
  upvoteCount?: number;
  satisfactionScores: { user: string; score: number; updatedAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}
