// schema/feedbackSchema.ts
import { gql } from "apollo-server-express";

export const feedbackTypeDefs = gql`
  scalar Date

  # ===========================
  # ENUMS
  # ===========================

  enum QuestionType {
    LIKERT_MATRIX
    NPS_SCALE
    SINGLE_CHOICE
    MULTIPLE_CHOICE
    FREE_TEXT
    BOOLEAN
  }

  enum FeedbackTargetType {
    EVENT
    COURSE
    SESSION
    PRODUCT
    INSTRUCTOR
    SYSTEM
  }

  enum Sentiment {
    VERY_NEGATIVE
    NEGATIVE
    NEUTRAL
    POSITIVE
    VERY_POSITIVE
  }

  enum FeedbackStatus {
    DRAFT
    ACTIVE
    CLOSED
    ARCHIVED
  }

  enum ResponseWindowDuration {
    MINUTES_15
    HOUR_1
    HOURS_3
    DAY_1
    WEEK_1
    OPEN
  }

  # ===========================
  # INPUT TYPES
  # ===========================

  input FeedbackQuestionInput {
    text: String!
    type: QuestionType!
    isRequired: Boolean = false
    metadata: String

    # ===== Likert Matrix =====
    matrixItems: [String!]
    matrixScale: Int = 5

    # ===== Choice / NPS =====
    options: [String!]
    minValue: Int
    maxValue: Int
  }

  input FeedbackResponseInput {
    questionId: ID!

    # ===== Likert =====
    matrixValues: [Int!]

    # ===== Scalar responses =====
    valueInt: Int
    valueText: String
    valueBoolean: Boolean
    valueList: [String!]
  }

  input FeedbackSubmissionInput {
    feedbackId: ID!
    participantId: ID
    responses: [FeedbackResponseInput!]!
    isAnonymous: Boolean = false
    sentimentScore: Int
    additionalComments: String
  }

  input FeedbackFilterInput {
    targetType: FeedbackTargetType
    targetId: ID
    status: FeedbackStatus
    createdBy: ID
    startDate: String
    endDate: String
    minAverageRating: Float
    hasSentiment: Boolean
  }

  input UpdateFeedbackInput {
    title: String
    description: String
    status: FeedbackStatus
    isAnonymous: Boolean
    metadata: String
    questions: [FeedbackQuestionInput!]
    closesAt: String
    responseWindowDuration: ResponseWindowDuration
  }

  # ===========================
  # CORE TYPES
  # ===========================

  type FeedbackQuestion {
    id: ID!
    text: String!
    type: QuestionType!
    isRequired: Boolean!
    metadata: String

    # ===== Likert =====
    matrixItems: [String!]
    matrixScale: Int

    # ===== Choice / NPS =====
    options: [String!]
    minValue: Int
    maxValue: Int

    createdAt: Date!
    updatedAt: Date!
  }

  type FeedbackResponse {
    id: ID!
    questionId: ID!
    questionText: String!
    questionType: QuestionType!

    # ===== Likert =====
    matrixValues: [Int!]

    # ===== Scalar =====
    valueInt: Int
    valueText: String
    valueBoolean: Boolean
    valueList: [String!]

    participantId: ID
    submittedAt: Date!
    sentiment: Sentiment
  }

  type FeedbackParticipant {
    id: ID!
    name: String
    email: String
    submittedAt: Date
    sentiment: Sentiment
  }

  type Feedback {
    id: ID!
    title: String!
    description: String
    targetId: ID!
    targetType: FeedbackTargetType!
    accessKey: String!
    status: FeedbackStatus!
    questions: [FeedbackQuestion!]!
    responses: [FeedbackResponse!]!
    participants: [FeedbackParticipant!]!
    totalParticipants: Int!
    createdBy: ID!
    createdAt: Date!
    updatedAt: Date!
    closesAt: Date
    isAnonymous: Boolean!
    allowMultipleSubmissions: Boolean!
    reminderSent: Boolean!
    metadata: String
    analytics: FeedbackAnalytics
    averageRating: Float
    averageSentimentScore: Float

    isAcceptingResponses: Boolean!
    lastAcceptedResponsesDate: String
    responseWindowDuration: ResponseWindowDuration!
  }

  # ===========================
  # ANALYTICS
  # ===========================

  type FeedbackAnalytics {
    totalSubmissions: Int!
    completionRate: Float!
    averageRating: Float
    averageSentimentScore: Float
    questionAnalytics: [QuestionAnalytics!]!
    sentimentDistribution: SentimentDistribution!
    submissionTrend: [DailySubmissionCount!]!
  }

  type QuestionAnalytics {
    questionId: ID!
    questionText: String!
    questionType: QuestionType!
    responseCount: Int!
    averageRating: Float
    commonResponses: [CommonResponse!]!
    sentimentDistribution: SentimentDistribution
  }

  type CommonResponse {
    value: String!
    count: Int!
    percentage: Float
  }

  type SentimentDistribution {
    veryNegative: Int!
    negative: Int!
    neutral: Int!
    positive: Int!
    veryPositive: Int!
    total: Int!
  }

  type DailySubmissionCount {
    date: String!
    count: Int!
  }

  type FeedbackSummary {
    id: ID!
    title: String!
    targetType: FeedbackTargetType!
    targetId: ID!
    totalSubmissions: Int!
    averageRating: Float
    averageSentiment: Sentiment
    status: FeedbackStatus!
    createdAt: Date!
  }

  type FeedbackExport {
    csvUrl: String
    jsonUrl: String
    generatedAt: Date!
    recordCount: Int!
  }

  # ===========================
  # QUERIES
  # ===========================

  type Query {
    getFeedbackById(id: ID!): Feedback
    getAllEventFeedbacks(eventId: ID!): [Feedback]
    getFeedbackByAccessKey(accessKey: String!): Feedback

    getAllFeedbacks(
      filter: FeedbackFilterInput
      limit: Int = 20
      offset: Int = 0
    ): [FeedbackSummary!]!

    getFeedbackForTarget(
      targetId: ID!
      targetType: FeedbackTargetType!
    ): [Feedback!]!

    getFeedbackAnalytics(feedbackId: ID!): FeedbackAnalytics
    getMyFeedbackSubmissions(userId: ID!): [Feedback!]!
    getCreatedFeedbacks(userId: ID!): [Feedback!]!

    exportFeedbackResponses(
      feedbackId: ID!
      format: String = "csv"
    ): FeedbackExport!
  }

  # ===========================
  # MUTATIONS
  # ===========================

  type Mutation {
    createFeedback(
      title: String!
      description: String
      targetId: ID!
      targetType: FeedbackTargetType!
      questions: [FeedbackQuestionInput!]!
      isAnonymous: Boolean = true
      allowMultipleSubmissions: Boolean = false
      closesAt: String
      metadata: String
      responseWindowDuration: ResponseWindowDuration = OPEN
    ): Feedback!

    updateFeedback(id: ID!, input: UpdateFeedbackInput!): Feedback!
    deleteFeedback(id: ID!): Boolean!
    closeFeedback(id: ID!): Feedback!
    reopenFeedback(id: ID!): Feedback!

    submitFeedback(input: FeedbackSubmissionInput!): FeedbackResponse!
    deleteFeedbackResponse(responseId: ID!): Boolean!

    addFeedbackParticipants(
      feedbackId: ID!
      participantIds: [ID!]!
    ): Feedback!

    removeFeedbackParticipants(
      feedbackId: ID!
      participantIds: [ID!]!
    ): Feedback!

    sendFeedbackReminder(feedbackId: ID!): Boolean!
    generateFeedbackAccessKeys(
      feedbackId: ID!
      count: Int = 1
    ): [String!]!
  }
`;
