/* ===========================
   ENUMS
=========================== */

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
   CORE TYPES
=========================== */

export interface CommonResponse {
  value: string;
  count: number;
  percentage: number;
}

export interface SentimentDistribution {
  veryNegative: number;
  negative: number;
  neutral: number;
  positive: number;
  veryPositive: number;
  total: number;
}

export interface DailySubmissionCount {
  date: string;
  count: number;
}

export interface QuestionAnalytics {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  responseCount: number;
  averageRating?: number;
  commonResponses: CommonResponse[];
  sentimentDistribution?: SentimentDistribution;
}

export interface FeedbackAnalytics {
  totalSubmissions: number;
  completionRate: number;
  averageRating?: number;
  averageSentimentScore?: number;
  questionAnalytics: QuestionAnalytics[];
  sentimentDistribution: SentimentDistribution;
  submissionTrend: DailySubmissionCount[];
}

/* ===========================
   FEEDBACK MODELS
=========================== */

export interface FeedbackQuestion {
  id: string;
  text: string;
  type: QuestionType;  // only LIKERT_MATRIX
  isRequired: boolean;
  metadata?: string;

  // Matrix-specific
  matrixItems: string[];   // rows (L)
  matrixScale: number;     // columns (M)

  createdAt: string;
  updatedAt: string;
}

export interface FeedbackResponse {
  id: string;
  questionId: string;
  questionText: string;
  questionType: QuestionType; // LIKERT_MATRIX
  matrixValues: number[];     // ratings per row
  participantId?: string;
  submittedAt: string;
  sentiment?: Sentiment;
}

export interface FeedbackParticipant {
  id: string;
  name?: string;
  email?: string;
  submittedAt?: string;
  sentiment?: Sentiment;
}

export interface Feedback {
  id: string;
  title: string;
  description?: string;
  targetId: string;
  targetType: FeedbackTargetType;
  accessKey: string;
  status: FeedbackStatus;
  questions: FeedbackQuestion[];
  responses: FeedbackResponse[];
  participants: FeedbackParticipant[];
  totalParticipants: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closesAt?: string;
  isAnonymous: boolean;
  allowMultipleSubmissions: boolean;
  reminderSent: boolean;
  metadata?: string;
  analytics?: FeedbackAnalytics;
  averageRating?: number;
  averageSentimentScore?: number;

  // Response acceptance tracking
  isAcceptingResponses: boolean;
  lastAcceptedResponsesDate?: string;
  responseWindowDuration: ResponseWindowDuration;
}

/* ===========================
   INPUT TYPES
=========================== */

export interface FeedbackQuestionInput {
  text: string;
  type: QuestionType;  // only LIKERT_MATRIX
  isRequired?: boolean;
  metadata?: string;

  // Matrix-specific
  matrixItems: string[];   // rows (L)
  matrixScale?: number;    // columns (M), default 5
}

export interface FeedbackResponseInput {
  questionId: string;
  matrixValues: number[];  // ratings per row
}

export interface FeedbackSubmissionInput {
  feedbackId: string;
  participantId?: string;
  responses: FeedbackResponseInput[];
  isAnonymous?: boolean;
  sentimentScore?: number;
  additionalComments?: string;
}

export interface FeedbackFilterInput {
  targetType?: FeedbackTargetType;
  targetId?: string;
  status?: FeedbackStatus;
  createdBy?: string;
  startDate?: string;
  endDate?: string;
  minAverageRating?: number;
  hasSentiment?: boolean;
}

export interface UpdateFeedbackInput {
  title?: string;
  description?: string;
  status?: FeedbackStatus;
  isAnonymous?: boolean;
  metadata?: string;
  questions?: FeedbackQuestionInput[];
  closesAt?: string;
  responseWindowDuration?: ResponseWindowDuration;
}

/* ===========================
   CHART / DASHBOARD TYPES
=========================== */

export interface TimeSeriesPoint {
  date: string;
  value: number;
  label: string;
  isCurrent?: boolean;
}

export interface QuestionTypeDistribution {
  name: string;
  count: number;
  percentage: number;
  color: string;
  startAngle: number;
}

export interface RecentSubmission {
  id: string;
  participantId: string;
  submittedAt: string;
  sentiment: Sentiment;
  preview: string;
  rating: number;
}
