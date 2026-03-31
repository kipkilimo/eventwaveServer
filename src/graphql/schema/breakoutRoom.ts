import { gql } from "graphql-tag";

export const breakoutRoomTypeDefs = gql`
  type BreakoutRoom {
    id: ID!
    event: Event!          # or Event! if you want deep nested fetching
    name: String!
    description: String
    facilitator: User
    participants: [User!]!
    isActive: Boolean!
    capacity: Int
    createdAt: Date!
    updatedAt: Date!
  }

  input CreateBreakoutRoomInput {
    event: ID!
    name: String!
    description: String
    facilitator: ID
    capacity: Int
  }

  input UpdateBreakoutRoomInput {
    id: ID!
    name: String
    description: String
    facilitator: ID
    capacity: Int
    isActive: Boolean
  }

  extend type Query {
    breakoutRoom(id: ID!): BreakoutRoom
    breakoutRooms(eventId: ID!): [BreakoutRoom!]!
  }

  extend type Mutation {
    createBreakoutRoom(input: CreateBreakoutRoomInput!): BreakoutRoom!
    updateBreakoutRoom(input: UpdateBreakoutRoomInput!): BreakoutRoom!

    addParticipantToBreakoutRoom(roomId: ID!, userId: ID!): BreakoutRoom!
    removeParticipantFromBreakoutRoom(roomId: ID!, userId: ID!): BreakoutRoom!
  }
`;
