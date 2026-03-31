import { gql } from "graphql-tag";

export const pollTypeDefs = gql`
  enum PollType {
    SINGLE_CHOICE
    MULTIPLE_CHOICE
    OPEN_TEXT
    RATING
    RANKING
  }

  # Add the missing PollOption type
  type PollOption {
    id: ID!
    text: String!
    votes: Int!
  }

  type Poll {
    id: ID!
    event: ID!
    question: String!
    type: PollType!
    options: [PollOption!]! # Now PollOption is defined
    createdBy: User!
    createdAt: Date!
    updatedAt: Date!
  }

  input PollOptionInput {
    text: String!
  }

  input CreatePollInput {
    event: ID!
    question: String!
    type: PollType!
    options: [PollOptionInput!]!
  }

  input VotePollInput {
    pollId: ID!
    selectedOptions: [String!]!
  }

  extend type Query {
    eventPolls(eventId: ID!): [Poll!]!
  }

  extend type Mutation {
    createPoll(input: CreatePollInput!): Poll!
    votePoll(input: VotePollInput!): Poll!
  }
`;
