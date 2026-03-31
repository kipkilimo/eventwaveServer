import { Types } from "mongoose";
import {
  Feedback,
  IFeedback,
  IFeedbackQuestion,
  IFeedbackResponse,
  IFeedbackParticipant,
  Sentiment,
  FeedbackStatus,
} from "../models/Feedback";

/* -----------------------------
 * Helpers
 * ----------------------------- */

const generateAccessKey = () =>
  Math.random().toString(36).substring(2, 10).toUpperCase();

const calculateSentiment = (score?: number): Sentiment | undefined => {
  if (score == null) return undefined;
  if (score <= 20) return Sentiment.VERY_NEGATIVE;
  if (score <= 40) return Sentiment.NEGATIVE;
  if (score <= 60) return Sentiment.NEUTRAL;
  if (score <= 80) return Sentiment.POSITIVE;
  return Sentiment.VERY_POSITIVE;
};

/* -----------------------------
 * Feedback Service
 * ----------------------------- */

export const FeedbackService = {
  /* ----------- CREATE ---------- */
  async createFeedback(
    data: Partial<IFeedback>,
    userId: string,
  ): Promise<IFeedback> {
    return Feedback.create({
      ...data,
      createdBy: new Types.ObjectId(userId),
      status: FeedbackStatus.DRAFT,
      accessKey: generateAccessKey(),
      isAcceptingResponses: false,
      questions: data.questions || [],
      responses: [],
      participants: [],
      totalParticipants: 0,
      reminderSent: false,
    });
  },

  /* ----------- UPDATE ---------- */
  async updateFeedback(
    id: string,
    input: Partial<IFeedback>,
  ): Promise<IFeedback | null> {
    return Feedback.findByIdAndUpdate(id, input, { new: true });
  },

  async deleteFeedback(id: string): Promise<boolean> {
    await Feedback.findByIdAndDelete(id);
    return true;
  },

  async closeFeedback(id: string): Promise<IFeedback | null> {
    return Feedback.findByIdAndUpdate(
      id,
      { status: FeedbackStatus.CLOSED },
      { new: true },
    );
  },

  async reopenFeedback(id: string): Promise<IFeedback | null> {
    return Feedback.findByIdAndUpdate(
      id,
      { status: FeedbackStatus.ACTIVE },
      { new: true },
    );
  },

  /* ----------- FETCH ----------- */
  async getById(id: string): Promise<IFeedback | null> {
    return Feedback.findById(id);
  },

  async getByAccessKey(accessKey: string): Promise<IFeedback | null> {
    return Feedback.findOne({
      accessKey,
      status: FeedbackStatus.ACTIVE,
    });
  },

  async getAll(
    filter: Partial<IFeedback> = {},
    limit = 20,
    offset = 0,
  ): Promise<IFeedback[]> {
    // @ts-ignore
    return Feedback.find(filter)
      .skip(offset)
      .limit(limit)
      .sort({ createdAt: -1 });
  },

  async getAllEventFeedbacks(eventId: string) {
    const feedbacks = await Feedback.find({
      targetType: "EVENT",
      targetId: eventId,
    })
      .populate("questions")
      .populate("responses")
      .sort({ createdAt: -1 })
      .lean();

    return feedbacks.map((feedback) => {
      const responses = feedback.responses || [];

      const ratings = responses
        .map((r: any) => r.rating)
        .filter((r: number) => typeof r === "number");

      const averageRating =
        ratings.length > 0
          ? ratings.reduce((a, b) => a + b, 0) / ratings.length
          : null;

      return {
        ...feedback,
        id: feedback._id,
        totalParticipants: new Set(
          responses.map((r: any) => r.participantId?.toString()),
        ).size,
        averageRating,
      };
    });
  },

  async getForTarget(
    targetId: string,
    targetType: string,
  ): Promise<IFeedback[]> {
    return Feedback.find({
      targetId: new Types.ObjectId(targetId),
      targetType,
    });
  },

  async getCreatedBy(userId: string): Promise<IFeedback[]> {
    return Feedback.find({ createdBy: new Types.ObjectId(userId) });
  },

  /* -------- SUBMISSION --------- */
  async submitFeedback(input: {
    feedbackId: string;
    participantId?: string;
    responses: {
      questionId: string;
      questionText: string;
      questionType: string;
      matrixValues?: number[];
    }[];
    isAnonymous?: boolean;
    sentimentScore?: number;
  }): Promise<IFeedback | null> {
    const sentiment = calculateSentiment(input.sentimentScore);

    // Convert questionId and participantId strings to ObjectId
    const responses: IFeedbackResponse[] = input.responses.map((r) => ({
      id: new Types.ObjectId().toHexString(),
      questionId: new Types.ObjectId(r.questionId),
      questionText: r.questionText,
      questionType: r.questionType as any,
      matrixValues: r.matrixValues || [],
      participantId: input.participantId
        ? new Types.ObjectId(input.participantId)
        : undefined,
      submittedAt: new Date(),
      sentiment,
    }));

    const participant: IFeedbackParticipant | undefined = input.isAnonymous
      ? undefined
      : {
          id: new Types.ObjectId().toHexString(),
          submittedAt: new Date(),
          sentiment,
        };

    return Feedback.findByIdAndUpdate(
      input.feedbackId,
      {
        $push: {
          responses: { $each: responses },
          ...(participant && { participants: participant }),
        },
        $inc: { totalParticipants: participant ? 1 : 0 },
      },
      { new: true },
    );
  },

  async deleteFeedbackResponse(
    feedbackId: string,
    responseId: string,
  ): Promise<IFeedback | null> {
    return Feedback.findByIdAndUpdate(
      feedbackId,
      { $pull: { responses: { id: responseId } } },
      { new: true },
    );
  },

  /* -------- PARTICIPANTS ------- */
  async addParticipants(
    feedbackId: string,
    participants: IFeedbackParticipant[],
  ): Promise<IFeedback | null> {
    return Feedback.findByIdAndUpdate(
      feedbackId,
      { $addToSet: { participants: { $each: participants } } },
      { new: true },
    );
  },

  async removeParticipants(
    feedbackId: string,
    participantIds: string[],
  ): Promise<IFeedback | null> {
    return Feedback.findByIdAndUpdate(
      feedbackId,
      { $pull: { participants: { id: { $in: participantIds } } } },
      { new: true },
    );
  },

  /* --------- ANALYTICS --------- */
  async getAnalytics(feedbackId: string): Promise<any> {
    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) return null;

    const total = feedback.responses.length;
    return {
      totalSubmissions: total,
      completionRate: total > 0 ? 1 : 0,
      averageRating: feedback.averageRating || null,
      averageSentimentScore: feedback.averageSentimentScore || null,
      questionAnalytics: [],
      sentimentDistribution: {
        veryNegative: 0,
        negative: 0,
        neutral: 0,
        positive: 0,
        veryPositive: 0,
        total,
      },
      submissionTrend: [],
    };
  },

  /* ----------- EXPORT ---------- */
  async exportResponses(
    feedbackId: string,
    format: "csv" | "json",
  ): Promise<any> {
    const feedback = await Feedback.findById(feedbackId);
    return {
      csvUrl: format === "csv" ? `/exports/${feedbackId}.csv` : null,
      jsonUrl: format === "json" ? `/exports/${feedbackId}.json` : null,
      generatedAt: new Date(),
      recordCount: feedback?.responses.length || 0,
    };
  },

  /* -------- ACCESS KEYS ------- */
  async generateAccessKeys(feedbackId: string, count = 1): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      keys.push(generateAccessKey());
    }
    return keys;
  },
};
