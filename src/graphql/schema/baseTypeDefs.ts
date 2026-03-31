import { gql } from "graphql-tag";

export const baseTypeDefs = gql`
  scalar Date
  scalar JSON

  # Root placeholders
  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }

  type Subscription {
    _empty: String
  }

  # Shared Enums
  enum UserRole {
    ADMIN
    ORGANIZER
    ADMIN
    PARTICIPANT
    GUEST
  }

  enum EventStatus {
    DRAFT
    PUBLISHED
    ACTIVE
    COMPLETED
    CANCELLED
  }

  enum SubscriptionTier {
    FREE 
    PRO
    BUSINESS
  }

  enum EventType {
    CONFERENCE
    WORKSHOP
    SEMINAR
    WEBINAR
    TRAINING
    SYMPOSIUM
  }


  enum RecurrencePattern {
    DAILY
    WEEKLY
    MONTHLY
    YEARLY
    NONE
  }
`;
