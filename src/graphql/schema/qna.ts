import { gql } from "graphql-tag";

export const qnaTypeDefs = gql`
  extend type Query {
    eventQnA(eventId: ID!): [QnA!]!
  }

  extend type Mutation {
    createQnA(input: CreateQnAInput!): QnA!
    answerQnA(input: AnswerQnAInput!): QnA!
    toggleUpvote(input: ToggleUpvoteInput!): QnA!
    addSatisfaction(input: AddSatisfactionInput!): QnA!
    pinQnA(qnaId: ID!, pinned: Boolean!): QnA!
  }

  type QnA {
    id: ID!
    event: ID!
    question: String!
    answer: String
    askedBy: User
    answeredBy: User
    isAnonymous: Boolean
    isAnswered: Boolean!
    isPinned: Boolean!
    tags: [String!]

    upvotes: [User!]!
    upvoteCount: Int!

    satisfactionScores: [SatisfactionScore!]

    createdAt: Date!
    updatedAt: Date!
  }

  type SatisfactionScore {
    user: User!
    score: Int!
    updatedAt: Date!
  }

  input CreateQnAInput {
    event: ID!
    question: String!
    isAnonymous: Boolean
    tags: [String!]
  }

  input AnswerQnAInput {
    qnaId: ID!
    answer: String!
  }

  input ToggleUpvoteInput {
    qnaId: ID!
  }

  input AddSatisfactionInput {
    qnaId: ID!
    score: Int!
  }
`;
