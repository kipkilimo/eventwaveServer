// src/graphql/typeDefs/mediaTypeDefs.ts
import { gql } from "graphql-tag";

export const mediaTypeDefs = gql`
  enum MediaType {
    AUDIO
    IMAGE
    VIDEO
    DATASET
    PROGRAM
    DOCUMENT
  }

  type Media {
    id: ID!
    event: Event!
    uploader: User!
    title: String
    description: String
    type: MediaType!
    fileName: String!
    fileSize: Int!
    mimeType: String!
    mediaUrl: String!
    uploadedAt: Date!
    updatedAt: Date!
  }

  input CreateMediaInput {
    event: ID!
    uploader: ID!
    title: String
    description: String
    type: MediaType!
    fileName: String!
    fileSize: Int!
    mimeType: String!
    mediaUrl: String!
  }

  type Query {
    getMediaById(id: ID!): Media
    getEventMedia(eventId: ID!): [Media!]!
    getUserMedia(userId: ID!): [Media!]!
  }

  type Mutation {
    createMedia(input: CreateMediaInput!): Media!
    deleteMedia(id: ID!): Boolean!
  }
`;
