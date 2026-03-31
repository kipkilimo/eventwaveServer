import { gql } from "graphql-tag";

export const userTypeDefs = gql`
  """
  User roles from Mongoose schema
  """
  enum UserRole {
    SUPER
    FACILITATOR
    ADMIN
    PARTICIPANT
  }

  """
  User object returned by the API
  """
  type User {
    id: ID
    name: String
    email: String
    phone: String
    role: UserRole
    organizations: [Organization]
    events: [Event]
    createdAt: Date
    updatedAt: Date
  }

  """
  Input type for creating a user
  """
  input CreateUserInput {
    name: String!
    email: String!
    phone: String!
    role: UserRole
    organizationId: ID
  }

  """
  Input type for updating a user
  """
  input UpdateUserInput {
    name: String
    email: String
    phone: String
    role: UserRole
    organizationId: ID
  }

  """
  Response returned when logging in or registering
  """
  type AuthPayload {
    token: String!
    user: User!
  }

  """
  Response returned for participant login
  """
  type ParticipantLoginPayload {
    token: String!
    user: User!
    event: Event!
  }

  extend type Query {
    users: [User!]!
    user(id: ID!): User
    me: User
  }
  type VerifyEventKeyPayload {
    success: Boolean!
    message: String!
    event: Event
  }
  extend type Mutation {
    register(input: CreateUserInput!): AuthPayload!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    deleteUser(id: ID!): Boolean!
    login(email: String!, password: String!): AuthPayload!

    verifyEventKey(
      eventKey: String! # Only eventKey is required
    ): VerifyEventKeyPayload!

    """
    Participant login with eventSecret + phone
    """
    participantLogin(
      eventSecret: String!
      phone: String!
    ): ParticipantLoginPayload!
  }
`;
