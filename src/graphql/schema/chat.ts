import { gql } from "graphql-tag";

export const chatTypeDefs = gql`
  type Chat {
    id: ID!
    event: ID!
    sender: User!
    content: String!
    type: ChatType!
    mediaUrl: String
    createdAt: Date!
    updatedAt: Date!
  }

  enum ChatType {
    text
    image
    file
  }

  input CreateChatInput {
    event: ID!
    content: String!
    type: ChatType
    mediaUrl: String
  }

  extend type Query {
    eventChats(eventId: ID!): [Chat!]!
  }

  extend type Mutation {
    createChat(input: CreateChatInput!): Chat!
  }
`;
