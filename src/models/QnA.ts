// src/models/QnA.ts
import { Schema, model, Document, Types } from "mongoose";

export interface ISatisfactionScore {
  user: Types.ObjectId;
  score: number;
  updatedAt: Date;
}

export interface IQnA extends Document {
  event: Types.ObjectId;
  question: string;
  answer?: string;
  askedBy?: Types.ObjectId | null;
  answeredBy?: Types.ObjectId | null;
  isAnonymous?: boolean;
  isAnswered: boolean;
  isPinned: boolean;
  tags: string[];
  upvotes: Types.ObjectId[];
  satisfactionScores: ISatisfactionScore[];
  createdAt: Date;
  updatedAt: Date;
}

const SatisfactionScoreSchema = new Schema<ISatisfactionScore>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    score: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const QnASchema = new Schema<IQnA>(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    question: { type: String, required: true },
    answer: { type: String },
    askedBy: { type: Schema.Types.ObjectId, ref: "User" },
    answeredBy: { type: Schema.Types.ObjectId, ref: "User" },
    isAnonymous: { type: Boolean, default: false },
    isAnswered: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    upvotes: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    satisfactionScores: { type: [SatisfactionScoreSchema], default: [] },
  },
  { timestamps: true }
);

export const QnA = model<IQnA>("QnA", QnASchema);
