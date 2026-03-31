import { gql } from "graphql-tag";

export const testTypeDefs = gql`
  # ==========================
  # CUSTOM SCALARS (Required for Mongoose types)
  # ==========================
  scalar Date
  # Used for flexible data like 'correctAnswer' and 'responses'
  scalar JSON

  # ==========================
  # ENUMS
  # ==========================
  enum TestType {
    MCQ_SINGLE
    MCQ_MULTIPLE
    TRUE_FALSE
    MATCHING
    FILL_BLANK
  }

  # ==========================
  # SUB-TYPES
  # ==========================
  # Corresponds to ITestResponse
  type TestResponse {
    # ID is usually the response's own ID, or implicitly from the Test response array.
    # Changed from ID! to ID as it's a sub-document in Mongoose.
    id: ID
    # Note: Event and User types are assumed to be defined elsewhere (e.g., in other typeDefs)
    respondent: User! # Changed to non-null based on Mongoose schema (required: true)
    responses: JSON # The actual submitted answers
    submittedAt: Date! # Changed to non-null based on Mongoose schema (default: Date.now)
    score: Float # Added from Mongoose schema
  }

  # Corresponds to ITestQuestion
  type TestQuestion {
    questionText: String!
    type: TestType!
    options: [String]
    correctAnswer: JSON
    marks: Float! # Added from Mongoose schema (default: 1, so non-null)
  }

  # ==========================
  # MAIN TYPE (Corresponds to ITest)
  # ==========================
  type Test {
    id: ID!
    # Note: Event and User types are assumed to be defined elsewhere (e.g., in other typeDefs)
    event: Event! # Reference to Event (required: true)
    title: String!
    totalMarks: Float! # Added from Mongoose schema (required: true)
    duration: Int! # Added from Mongoose schema (required: true, in minutes)
    description: String # Added from Mongoose schema
    objective: String # Added from Mongoose schema
    createdBy: User! # Reference to User (required: true)
    questions: [TestQuestion!]! # Renamed 'examItems' to 'questions' for GQL clarity
    responses: [TestResponse!]
    createdAt: Date!
    updatedAt: Date!
  }

  # ==========================
  # INPUT TYPES
  # ==========================
  input TestQuestionInput {
    questionText: String!
    type: TestType!
    options: [String]
    correctAnswer: JSON
    marks: Float # Include for question creation
  }

  input CreateTestInput {
    event: ID!
    title: String!
    totalMarks: Float! # Added from Mongoose schema
    duration: Int! # Added from Mongoose schema
    description: String
    objective: String
    questions: [TestQuestionInput!]! # Renamed 'examItems' to 'questions'
  }

  input SubmitTestResponseInput {
    TestId: ID!
    responses: JSON!
  }

  # ==========================
  # QUERIES
  # ==========================
  extend type Query {
    getAllTests: [Test!]!
    getTestsByEvent(eventId: ID!): [Test!]!
    getTestById(id: ID!): Test
  }

  # ==========================
  # MUTATIONS
  # ==========================
  extend type Mutation {
    createTest(input: CreateTestInput!): Test!
    # File handling often requires specific input/scalar, using String for fileUrl
    processTestFromS3(eventId: ID!, title: String!, fileUrl: String!): Test! # title changed to non-null for required context
    submitTestResponse(input: SubmitTestResponseInput!): Test!
    deleteTest(id: ID!): Boolean!
  }
`;
