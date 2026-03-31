import { gql } from "graphql-tag";

export const eventTypeDefs = gql`
  scalar Date
  scalar JSON

  # ENUMS
  enum EventType {
    MEETING
    WORKSHOP
    TRAINING
    SEMINAR
    CONFERENCE
    WEBINAR
  }

  enum EventStatus {
    DRAFT
    PUBLISHED
    ACTIVE
    COMPLETED
    CANCELLED
  }

  enum BillingStatus {
    PENDING
    PAID
    OVERDUE
    CANCELLED
    REFUNDED
    PRE_AGREED
  }

  # CORE TYPES
  type Event {
    id: ID!
    title: String!
    description: String
    eventSecret: String!
    eventKey: String!
    organizer: User!
    organization: Organization
    eventType: EventType!
    status: EventStatus!
    dateTime: DateTimeRange!
    location: Location!
    capacity: Int
    interactivity: InteractivitySettings
    branding: BrandingSettings
    participants: [User!]!
    facilitators: [User!]!
    admins: [User!]!
    isFreeEvent: Boolean!
    isShortEvent: Boolean!
    isSecureAccessEvent: Boolean!
    eventDuration: EventDuration
    billing: BillingInfo
    tags: [String!]
    categories: [String!]
    metadata: EventMetadata
    createdAt: Date!
    updatedAt: Date!
    # Session management fields
    sessionStartedAt: Date
    sessionPausedAt: Date
    sessionEndedAt: Date
  }

  type DateTimeRange {
    start: Date!
    end: Date!
  }

  type Location {
    name: String!
    address: String!
    virtualLink: String
    isVirtual: Boolean!
  }

  type InteractivitySettings {
    allowChat: Boolean!
    allowPrivateMessages: Boolean!
    allowPolls: Boolean!
    allowQnA: Boolean!
    allowFeedback: Boolean!
    allowScreenSharing: Boolean!
    allowBreakoutRooms: Boolean!
    allowWhiteboard: Boolean!
    liveReactions: Boolean!
    raiseHandFeature: Boolean!
  }

  type BrandingSettings {
    logoUrl: String
    themeColor: String
    bannerBg: String
  }

  type EventDuration {
    milliseconds: Float!
    hours: Float!
    minutes: Float!
    days: Float!
  }

  type BillingInfo {
    invoiceNumber: String
    dailyRate: Float
    days: Int
    originalAmount: Float
    discountAmount: Float
    finalAmount: Float
    currency: String!
    status: BillingStatus!
    paidAt: Date
    paymentMethod: String
  }

  type EventMetadata {
    timezone: String!
    language: String!
    createdAt: Date!
    updatedAt: Date!
    createdBy: ID
    isEnterprise: Boolean
  }

  # INPUTS
  input CreateFreeEventInput {
    title: String!
    description: String
    organizer: ID!
    eventType: EventType!
    start: Date!
    end: Date!
    location: LocationInput!
    capacity: Int
    tags: [String!]
    categories: [String!]
    interactivity: InteractivitySettingsInput
    branding: BrandingSettingsInput
    metadata: EventMetadataInput
  }

  input CreateStandardEventInput {
    title: String!
    description: String
    organizer: ID!
    organizationId: ID!
    eventType: EventType!
    start: Date!
    end: Date!
    location: LocationInput!
    capacity: Int
    tags: [String!]
    categories: [String!]
    interactivity: InteractivitySettingsInput
    branding: BrandingSettingsInput
    metadata: EventMetadataInput
  }

  input CreateEnterpriseEventInput {
    title: String!
    description: String
    organizer: ID!
    organizationId: ID!
    eventType: EventType!
    start: Date!
    end: Date!
    location: LocationInput
    capacity: Int
    tags: [String!]
    categories: [String!]
    interactivity: InteractivitySettingsInput
    branding: BrandingSettingsInput
    metadata: EventMetadataInput
  }

  input UpdateEventInput {
    title: String
    description: String
    eventType: EventType
    status: EventStatus
    start: Date
    end: Date
    location: LocationInput
    capacity: Int
    tags: [String!]
    categories: [String!]
    interactivity: InteractivitySettingsInput
    branding: BrandingSettingsInput
    metadata: EventMetadataInput
  }

  input LocationInput {
    name: String!
    address: String!
    virtualLink: String
    isVirtual: Boolean!
  }

  input InteractivitySettingsInput {
    allowChat: Boolean
    allowPrivateMessages: Boolean
    allowPolls: Boolean
    allowQnA: Boolean
    allowFeedback: Boolean
    allowScreenSharing: Boolean
    allowBreakoutRooms: Boolean
    allowWhiteboard: Boolean
    liveReactions: Boolean
    raiseHandFeature: Boolean
  }

  input BrandingSettingsInput {
    logoUrl: String
    themeColor: String
    bannerBg: String
  }

  input EventMetadataInput {
    timezone: String
    language: String
  }

  # FILTERS
  input EventFilters {
    status: EventStatus
    eventType: EventType
    organizationId: ID
    organizerId: ID
    isFreeEvent: Boolean
    isSecureAccessEvent: Boolean
    isShortEvent: Boolean
    fromDate: Date
    toDate: Date
    search: String
    isEnterprise: Boolean
  }

  # PAGINATION
  type EventConnection {
    edges: [EventEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type EventEdge {
    node: Event!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  # ROLE MANAGEMENT
  enum EventRole {
    ADMIN
    FACILITATOR
    PARTICIPANT
  }

  input UpdateEventRolesInput {
    eventId: ID!
    role: EventRole!
    add: [ID!]
    remove: [ID!]
  }

  # RESPONSE TYPES
  type AddParticipantToEventResponse {
    success: Boolean!
    message: String!
    event: Event!
  }

  type RemoveParticipantFromEventResponse {
    success: Boolean!
    message: String!
    event: Event!
  }

  # QUERIES
  extend type Query {
    events(filters: EventFilters, limit: Int, offset: Int): [Event!]!
    eventsPaginated(
      filters: EventFilters
      first: Int
      after: String
    ): EventConnection!
    event(id: ID!): Event
    eventBySecret(eventSecret: String!): Event
    userEvents(userId: ID!, status: EventStatus): [Event!]!
    userFacilitatingEvents(userId: ID!): [Event!]!
    userRelatedEvents(userId: ID!): [Event!]!
    organizationEvents(organizationId: ID!): [Event!]!
    eventsByOrganizer(organizerId: ID!): [Event!]!
    # // eventAnalytics(eventId: ID!): EventAnalytics
    freeEvents(limit: Int): [Event!]!
    upcomingFreeEvents(limit: Int): [Event!]!
    standardEvents(limit: Int): [Event!]!
    upcomingStandardEvents(limit: Int): [Event!]!
    enterpriseEvents(organizationId: ID, limit: Int): [Event!]!
  }

  # MUTATIONS
  extend type Mutation {
    # Event CRUD
    createFreeEvent(input: CreateFreeEventInput!): Event!
    createStandardEvent(input: CreateStandardEventInput!): Event!
    createEnterpriseEvent(input: CreateEnterpriseEventInput!): Event!
    updateEvent(id: ID!, input: UpdateEventInput!): Event!
    deleteEvent(id: ID!): Boolean!

    # Participant Management
    joinEvent(eventId: ID!): Event!
    leaveEvent(eventId: ID!): Event!
    registerForEvent(eventId: ID!): Event!
    unregisterFromEvent(eventId: ID!): Event!
    addParticipantToEvent(eventId: ID!): AddParticipantToEventResponse!
    removeParticipantFromEvent(
      eventId: ID!
    ): RemoveParticipantFromEventResponse!

    # Role Management
    updateEventRoles(input: UpdateEventRolesInput!): Event!

    # Event Status Management
    publishEvent(id: ID!): Event!
    cancelEvent(id: ID!): Event!
    completeEvent(id: ID!): Event!

    # Session Management
    startSession(eventId: ID!): Event!
    pauseSession(eventId: ID!): Event!
    endSession(eventId: ID!): Event!

    # Billing
    generateEventInvoice(eventId: ID!): BillingInfo!
    markInvoiceAsPaid(eventId: ID!, paymentMethod: String): Event!
  }
`;
