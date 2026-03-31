import { gql } from "graphql-tag";

export const sharedTypeDefs = gql`
  scalar Date
  scalar JSON

  # ======================
  # ENUMS
  # ======================
  enum UserRole {
    SUPER
    FACILITATOR
    ADMIN
    PARTICIPANT
  }

  enum SubscriptionTier {
    FREE
    PRO
    BUSINESS 
  }

  enum EventType {
    CONFERENCE
    RECEPTION
    SEMINAR
    WORKSHOP
  }

  enum EventStatus {
    DRAFT
    PUBLISHED
    ACTIVE
    COMPLETED
    CANCELLED
  }



  enum RecurrencePattern {
    DAILY
    WEEKLY
    MONTHLY
    YEARLY
  }

  # ======================
  # SHARED TYPES
  # ======================
  type DateTimeRange {
    start: Date!
    end: Date!
  }

  type Resources {
    name: String
    url: String
  }

  # ======================
  # ROOT TYPES
  # ======================
  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }

  type Subscription {
    _empty: String
  }
`;
