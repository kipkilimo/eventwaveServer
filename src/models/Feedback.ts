import { Schema, model, Types, Document } from "mongoose";

/* ===========================
 * ENUMS
 * =========================== */

export enum QuestionType {
  LIKERT_MATRIX = "LIKERT_MATRIX",
  NPS_SCALE = "NPS_SCALE",
  SINGLE_CHOICE = "SINGLE_CHOICE",
  MULTIPLE_CHOICE = "MULTIPLE_CHOICE",
  FREE_TEXT = "FREE_TEXT",
  BOOLEAN = "BOOLEAN",
}

export enum FeedbackTargetType {
  EVENT = "EVENT",
  COURSE = "COURSE",
  SESSION = "SESSION",
  PRODUCT = "PRODUCT",
  INSTRUCTOR = "INSTRUCTOR",
  SYSTEM = "SYSTEM",
}

export enum Sentiment {
  VERY_NEGATIVE = "VERY_NEGATIVE",
  NEGATIVE = "NEGATIVE",
  NEUTRAL = "NEUTRAL",
  POSITIVE = "POSITIVE",
  VERY_POSITIVE = "VERY_POSITIVE",
}

export enum FeedbackStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
  ARCHIVED = "ARCHIVED",
}

export enum ResponseWindowDuration {
  MINUTES_15 = "MINUTES_15",
  HOUR_1 = "HOUR_1",
  HOURS_3 = "HOURS_3",
  DAY_1 = "DAY_1",
  WEEK_1 = "WEEK_1",
  OPEN = "OPEN",
}

/* ===========================
 * INTERFACES
 * =========================== */

export interface IFeedbackQuestion {
  id: string;
  text: string;
  type: QuestionType;
  isRequired: boolean;
  metadata?: string;
  matrixItems?: string[];
  matrixScale?: number;
  options?: string[];
  minValue?: number;
  maxValue?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFeedbackResponse {
  id: string;
  questionId: Types.ObjectId;
  questionText: string;
  questionType: QuestionType;
  matrixValues?: number[];
  valueInt?: number;
  valueText?: string;
  valueBoolean?: boolean;
  valueList?: string[];
  participantId?: Types.ObjectId;
  submittedAt: Date;
  sentiment?: Sentiment;
}

export interface IFeedbackParticipant {
  id: string;
  name?: string;
  email?: string;
  submittedAt?: Date;
  sentiment?: Sentiment;
}

export interface IFeedback extends Document {
  title: string;
  description?: string;
  targetId: Types.ObjectId;
  targetType: FeedbackTargetType;
  accessKey: string;
  status: FeedbackStatus;
  questions: IFeedbackQuestion[];
  responses: IFeedbackResponse[];
  participants: IFeedbackParticipant[];
  totalParticipants: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  closesAt?: Date;
  isAnonymous: boolean;
  allowMultipleSubmissions: boolean;
  reminderSent: boolean;
  metadata?: string;
  averageRating?: number;
  averageSentimentScore?: number;
  isAcceptingResponses: boolean;
  lastAcceptedResponsesDate?: string;
  responseWindowDuration: ResponseWindowDuration;
}

/* ===========================
 * SCHEMAS
 * =========================== */

const FeedbackQuestionSchema = new Schema<IFeedbackQuestion>(
  {
    id: {
      type: String,
      required: true,
      default: () => new Types.ObjectId().toHexString(),
    },
    text: { type: String, required: true },
    type: { type: String, enum: Object.values(QuestionType), required: true },
    isRequired: { type: Boolean, default: false },
    metadata: { type: String },
    matrixItems: { type: [String] },
    matrixScale: { type: Number, default: 5 },
    options: { type: [String] },
    minValue: { type: Number },
    maxValue: { type: Number },
  },
  { timestamps: true },
);

const FeedbackResponseSchema = new Schema<IFeedbackResponse>(
  {
    id: {
      type: String,
      required: true,
      default: () => new Types.ObjectId().toHexString(),
    },
    questionId: { type: Schema.Types.ObjectId, required: true },
    questionText: { type: String, required: true },
    questionType: {
      type: String,
      enum: Object.values(QuestionType),
      required: true,
    },
    matrixValues: { type: [Number] },
    valueInt: { type: Number },
    valueText: { type: String },
    valueBoolean: { type: Boolean },
    valueList: { type: [String] },
    participantId: { type: Schema.Types.ObjectId, ref: "User" },
    submittedAt: { type: Date, default: Date.now },
    sentiment: { type: String, enum: Object.values(Sentiment) },
  },
  { _id: true },
);

const FeedbackParticipantSchema = new Schema<IFeedbackParticipant>(
  {
    id: {
      type: String,
      required: true,
      default: () => new Types.ObjectId().toHexString(),
    },
    name: { type: String },
    email: { type: String },
    submittedAt: { type: Date, default: Date.now },
    sentiment: { type: String, enum: Object.values(Sentiment) },
  },
  { _id: true },
);

const FeedbackSchema = new Schema<IFeedback>(
  {
    title: { type: String, required: true },
    description: { type: String },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetType: {
      type: String,
      enum: Object.values(FeedbackTargetType),
      required: true,
    },
    accessKey: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: Object.values(FeedbackStatus),
      default: FeedbackStatus.DRAFT,
    },
    questions: { type: [FeedbackQuestionSchema], default: [] },
    responses: { type: [FeedbackResponseSchema], default: [] },
    participants: { type: [FeedbackParticipantSchema], default: [] },
    totalParticipants: { type: Number, default: 0 },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    closesAt: { type: Date },
    isAnonymous: { type: Boolean, default: true },
    allowMultipleSubmissions: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false },
    metadata: { type: String },
    averageRating: { type: Number },
    averageSentimentScore: { type: Number },
    isAcceptingResponses: { type: Boolean, default: false },
    lastAcceptedResponsesDate: { type: String },
    responseWindowDuration: {
      type: String,
      enum: Object.values(ResponseWindowDuration),
      default: ResponseWindowDuration.OPEN,
    },
  },
  { timestamps: true },
);

/* ===========================
 * EXPORT
 * =========================== */

export const Feedback = model<IFeedback>("Feedback", FeedbackSchema);
