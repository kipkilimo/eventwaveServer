import { gql } from "graphql-tag";

export const organizationTypeDefs = gql`
  """
  Represents an organization / tenant in the system with enhanced billing capabilities.
  """
  type Organization {
    id: ID
    name: String
    address: String
    email: String
    phone: String
    website: String

    # Billing & Subscription
    subscriptionTier: SubscriptionTier
    billingStatus: BillingStatus
    nextBillingDate: Date
    billingCycle: BillingCycle
    trialEndsAt: Date
    subscriptionStartDate: Date
    subscriptionEndDate: Date

    # Limits & Quotas
    maxEvents: Int
    maxParticipantsPerEvent: Int
    maxConcurrentEvents: Int
    maxStorageGB: Int
    currentEventCount: Int
    currentParticipantCount: Int
    eventsThisMonth: Int

    # Billing-specific fields
    billingEmail: String
    billingAddress: String
    taxId: String
    registrationNumber: String
    paymentMethodId: String
    autoRenew: Boolean!

    # Enterprise features (only for ENTERPRISE tier)
    customDomain: String
    ssoEnabled: Boolean!
    apiAccessEnabled: Boolean!
    webhookUrl: String
    dedicatedSupport: Boolean!
    customSLA: Boolean!

    # Legal & Compliance
    orgLegalDocuments: [LegalDocument]
    termsAcceptedAt: Date
    privacyPolicyAcceptedAt: Date

    # Status tracking
    isBlocked: Boolean
    isSuspended: Boolean
    orgType: String
    status: OrganizationStatus

    # Relationships
    createdBy: User
    users: [User]
    admins: [User]
    invoices: [Invoice]
    events: [Event]
    payments: [Payment]
    billingHistory: [BillingHistoryEntry]
    quotas: QuotaUsage

    # Metadata
    metadata: OrganizationMetadata
    createdAt: Date
    updatedAt: Date
  }

  """
  Organization status for lifecycle tracking
  """
  enum OrganizationStatus {
    ACTIVE
    TRIAL
    PAST_DUE
    SUSPENDED
    BLOCKED
    CANCELLED
    PENDING_APPROVAL
  }

  """
  Subscription tiers - Only 3 tiers available
  """
  enum SubscriptionTier {
    FREE
    PRO
    ENTERPRISE
  }

  """
  Billing status for subscription management
  """
  enum BillingStatus {
    ACTIVE
    PAST_DUE
    CANCELLED
    TRIAL
    EXPIRED
    SUSPENDED
  }

  """
  Billing cycle options
  """
  enum BillingCycle {
    MONTHLY
    QUARTERLY
    ANNUAL
  }

  """
  Legal documents associated with organization
  """
  type LegalDocument {
    type: LegalDocumentType!
    url: String!
    version: String!
    signedAt: Date
    signedBy: ID
  }

  enum LegalDocumentType {
    TERMS_OF_SERVICE
    PRIVACY_POLICY
    DATA_PROCESSING_AGREEMENT
    SERVICE_LEVEL_AGREEMENT
    ENTERPRISE_CONTRACT
  }

  """
  Quota usage tracking with tier-specific limits
  """
  type QuotaUsage {
    eventsUsed: Int!
    eventsLimit: Int!
    participantsUsed: Int!
    participantsLimit: Int!
    storageUsedGB: Float!
    storageLimitGB: Int!
    apiCallsThisMonth: Int!
    apiCallsLimit: Int!
    concurrentEventsUsed: Int!
    concurrentEventsLimit: Int!
    # Tier-specific features
    customDomainEnabled: Boolean!
    ssoEnabled: Boolean!
    apiAccessEnabled: Boolean!
    dedicatedSupportEnabled: Boolean!
  }

  """
  Billing history entry
  """
  type BillingHistoryEntry {
    id: ID!
    action: BillingAction!
    description: String!
    amount: Float
    date: Date!
    invoiceId: ID
    metadata: JSON
  }

  enum BillingAction {
    SUBSCRIPTION_STARTED
    SUBSCRIPTION_RENEWED
    SUBSCRIPTION_CANCELLED
    SUBSCRIPTION_CHANGED
    INVOICE_CREATED
    PAYMENT_RECEIVED
    PAYMENT_FAILED
    CREDIT_APPLIED
    REFUND_ISSUED
    QUOTA_EXCEEDED
    TIER_UPGRADED
    TIER_DOWNGRADED
  }

  """
  Organization metadata for creation tracking
  """
  type OrganizationMetadata {
    createdVia: String!
    approvalRequired: Boolean!
    approvedBy: ID
    approvedAt: Date
    sourceIp: String
    userAgent: String
    verificationStatus: VerificationStatus
    verifiedAt: Date
  }

  enum VerificationStatus {
    PENDING
    VERIFIED
    REJECTED
    REVIEW_REQUIRED
  }

  """
  Tier limits configuration
  """
  type TierLimits {
    tier: SubscriptionTier!
    maxEvents: Int!
    maxParticipantsPerEvent: Int!
    maxConcurrentEvents: Int!
    maxStorageGB: Int!
    maxApiCallsPerMonth: Int!
    features: TierFeatures!
  }

  type TierFeatures {
    customDomain: Boolean!
    ssoEnabled: Boolean!
    apiAccess: Boolean!
    dedicatedSupport: Boolean!
    customSLA: Boolean!
    advancedAnalytics: Boolean!
    whiteLabeling: Boolean!
    prioritySupport: Boolean!
  }

  """
  Input for creating organization (simplified)
  """
  input CreateOrganizationInput {
    createdBy: ID!
    name: String!
    email: String!
    orgType: String!
    subscriptionTier: SubscriptionTier = FREE
    phone: String
    address: String
    website: String
    maxEvents: Int
    maxParticipants: Int
    orgLegalDocuments: [String]
  }

  """
  Express Organization Creation - Simplified with minimal validation
  """
  input ExpressCreateOrganizationInput {
    name: String!
    email: String!
    phone: String
    address: String
    website: String
    orgType: String
    subscriptionTier: SubscriptionTier = FREE
    maxEvents: Int
    maxParticipants: Int
    orgLegalDocuments: [String]
    billingEmail: String
    autoRenew: Boolean = true
  }

  """
  Standard Organization Creation - Comprehensive with full validation
  """
  input StandardCreateOrganizationInput {
    orgCreator: ID! # Mandatory - Reference to User model
    name: String!
    email: String!
    phone: String
    address: String
    website: String
    orgType: String!
    subscriptionTier: SubscriptionTier!
    maxEvents: Int
    maxParticipantsPerEvent: Int
    orgLegalDocuments: [String]
    taxId: String
    registrationNumber: String
    billingAddress: String
    billingEmail: String
    primaryContactName: String
    primaryContactPhone: String
    billingCycle: BillingCycle = MONTHLY
    autoRenew: Boolean = true
  }

  """
  Input for updating organization
  """
  input UpdateOrganizationInput {
    id: ID!
    name: String
    email: String
    orgType: String
    subscriptionTier: SubscriptionTier
    maxEvents: Int
    maxParticipantsPerEvent: Int
    isBlocked: Boolean
    phone: String
    address: String
    website: String
    orgLegalDocuments: [String]
    billingEmail: String
    billingAddress: String
    autoRenew: Boolean
  }

  """
  Input for subscription management
  """
  input UpdateSubscriptionInput {
    organizationId: ID!
    subscriptionTier: SubscriptionTier!
    billingCycle: BillingCycle
    autoRenew: Boolean
    paymentMethodId: String
  }

  """
  Input for billing address update
  """
  input UpdateBillingAddressInput {
    organizationId: ID!
    billingAddress: String!
    billingEmail: String
    taxId: String
  }

  """
  Organization analytics for billing and usage
  """
  type OrganizationAnalytics {
    totalEventsCreated: Int!
    totalParticipantsRegistered: Int!
    averageEventAttendance: Float!
    totalRevenue: Float!
    pendingInvoices: Int!
    overdueInvoices: Int!
    activeEvents: Int!
    eventsThisMonth: Int!
    participantsThisMonth: Int!
    apiUsagePercentage: Float!
    storageUsagePercentage: Float!
    estimatedNextInvoice: Float
    usageByEventType: [EventTypeUsage!]!
    tierSavings: TierSavings
  }

  type EventTypeUsage {
    eventType: String!
    count: Int!
    participants: Int!
  }

  type TierSavings {
    currentTier: SubscriptionTier!
    estimatedMonthlyCost: Float!
    savingsFromFreeTier: Float!
    recommendedTier: SubscriptionTier
  }

  """
  Invoice preview for upcoming billing
  """
  type InvoicePreview {
    period: BillingPeriod!
    subtotal: Float!
    discount: Float!
    tax: Float!
    total: Float!
    lineItems: [InvoiceLineItem!]!
    tierBreakdown: TierBreakdown
  }

  type BillingPeriod {
    start: Date!
    end: Date!
  }

  type InvoiceLineItem {
    description: String!
    quantity: Int!
    unitPrice: Float!
    amount: Float!
    type: LineItemType!
  }

  type TierBreakdown {
    baseSubscription: Float!
    overageCharges: Float!
    enterpriseFeatures: Float
    total: Float!
  }

  enum LineItemType {
    SUBSCRIPTION
    EVENT_FEE
    PARTICIPANT_FEE
    OVERAGE
    DISCOUNT
    TAX
    CREDIT
    ENTERPRISE_FEATURE
  }

  """
  Paginated organizations response
  """
  type PaginatedOrganizations {
    data: [Organization!]!
    total: Int!
    page: Int!
    limit: Int!
  }

  # ============================
  # QUERIES
  # ============================
  extend type Query {
    organizationsPaginated(
      page: Int = 1
      limit: Int = 10
      filters: OrganizationFilters
    ): PaginatedOrganizations!

    organization(id: ID!): Organization
    myOrganizations(userId: ID!): [Organization!]!

    # Tier Information
    tierLimits(tier: SubscriptionTier!): TierLimits!
    allTierLimits: [TierLimits!]!
    organizationTierRecommendation(organizationId: ID!): TierSavings!

    # Billing & Analytics Queries
    organizationAnalytics(organizationId: ID!): OrganizationAnalytics!
    organizationQuota(organizationId: ID!): QuotaUsage!
    upcomingInvoicePreview(organizationId: ID!): InvoicePreview!
    organizationInvoices(
      organizationId: ID!
      limit: Int
      offset: Int
    ): [Invoice!]!
    organizationPayments(
      organizationId: ID!
      limit: Int
      offset: Int
    ): [Payment!]!
    organizationBillingHistory(
      organizationId: ID!
      limit: Int
    ): [BillingHistoryEntry!]!

    # Bulk operations for enterprise
    organizationsByTier(tier: SubscriptionTier!): [Organization!]!
    organizationsNeedingBillingUpdate(threshold: Date!): [Organization!]!

    # Enterprise-specific queries
    enterpriseOrganizations: [Organization!]!
    organizationsEligibleForEnterpriseUpgrade: [Organization!]!
  }

  input OrganizationFilters {
    status: OrganizationStatus
    subscriptionTier: SubscriptionTier
    billingStatus: BillingStatus
    isBlocked: Boolean
    createdAfter: Date
    createdBefore: Date
    search: String
    hasCustomDomain: Boolean
    ssoEnabled: Boolean
  }

  # ============================
  # MUTATIONS
  # ============================
  extend type Mutation {
    """
    Organization Management
    """
    expressCreateOrganization(
      input: ExpressCreateOrganizationInput!
    ): Organization!

    standardCreateOrganization(
      input: StandardCreateOrganizationInput!
    ): Organization!

    updateOrganization(input: UpdateOrganizationInput!): Organization!
    deleteOrganization(id: ID!): Boolean!

    """
    Subscription Management
    """
    updateSubscription(input: UpdateSubscriptionInput!): Organization!
    cancelSubscription(organizationId: ID!): Organization!
    renewSubscription(organizationId: ID!): Organization!
    updateBillingAddress(input: UpdateBillingAddressInput!): Organization!
    upgradeToPro(organizationId: ID!, billingCycle: BillingCycle): Organization!
    upgradeToEnterprise(
      organizationId: ID!
      billingCycle: BillingCycle
      customDomain: String
    ): Organization!
    downgradeToFree(organizationId: ID!): Organization!

    """
    Quota Management
    """
    checkAndUpdateQuotas(organizationId: ID!): QuotaUsage!
    requestQuotaIncrease(
      organizationId: ID!
      quotaType: String!
      requestedAmount: Int!
    ): Boolean!

    """
    Billing Operations
    """
    generateMonthlyInvoice(organizationId: ID!): Invoice!
    processPayment(
      organizationId: ID!
      invoiceId: ID!
      paymentMethodId: String
    ): Payment!
    applyCredit(organizationId: ID!, amount: Float!, reason: String!): Boolean!

    """
    Enterprise Features
    """
    enableSSO(
      organizationId: ID!
      ssoProvider: String!
      ssoConfig: JSON!
    ): Organization!
    disableSSO(organizationId: ID!): Organization!
    setCustomDomain(organizationId: ID!, domain: String!): Organization!
    configureWebhook(
      organizationId: ID!
      webhookUrl: String!
      events: [String!]!
    ): Organization!

    """
    Verification & Compliance
    """
    verifyOrganization(
      organizationId: ID!
      approved: Boolean!
      reviewerId: ID!
    ): Organization!
    uploadLegalDocument(
      organizationId: ID!
      documentType: LegalDocumentType!
      url: String!
    ): Boolean!

    """
    Bulk Operations (Enterprise)
    """
    bulkUpdateSubscriptions(
      organizationIds: [ID!]!
      subscriptionTier: SubscriptionTier!
    ): [Organization!]!
    bulkEnableSSO(
      organizationIds: [ID!]!
      ssoProvider: String!
    ): [Organization!]!
  }

  # Scalar definitions
  scalar Date
  scalar JSON
`;

// Supporting types that might be referenced
export const userTypeDefs = gql`
  type User {
    id: ID
    name: String
    email: String
    phone: String
    role: UserRole
    organizations: [Organization]
    createdAt: Date
    updatedAt: Date
  }

  enum UserRole {
    PARTICIPANT
    FACILITATOR
    ADMIN
    SUPER
  }
`;

export const eventTypeDefs = gql`
  type Event {
    id: ID
    title: String
    description: String
    status: EventStatus
    organization: Organization
    eventType: EventType
    isFreeEvent: Boolean
    billing: BillingInfo
    createdAt: Date
    updatedAt: Date
  }

  enum EventStatus {
    DRAFT
    PUBLISHED
    CANCELLED
    COMPLETED
  }

  enum EventType {
    MEETING
    WORKSHOP
    TRAINING
    SEMINAR
    CONFERENCE
    WEBINAR
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

  enum BillingStatus {
    PENDING
    PAID
    OVERDUE
    CANCELLED
    REFUNDED
    PRE_AGREED
  }
`;

export const invoiceTypeDefs = gql`
  type Invoice {
    id: ID
    invoiceNumber: String
    amount: Float
    tax: Float
    totalAmount: Float
    status: InvoiceStatus
    organization: Organization
    events: [Event]
    dueDate: Date
    paidAt: Date
    pdfUrl: String
    lineItems: [InvoiceLineItem]
    metadata: JSON
    createdAt: Date
    updatedAt: Date
  }

  type InvoiceLineItem {
    description: String!
    quantity: Int!
    unitPrice: Float!
    amount: Float!
    eventId: ID
    type: LineItemType!
  }

  enum InvoiceStatus {
    DRAFT
    PENDING
    PAID
    OVERDUE
    CANCELLED
    REFUNDED
  }

  enum LineItemType {
    SUBSCRIPTION
    EVENT_FEE
    PARTICIPANT_FEE
    OVERAGE
    DISCOUNT
    TAX
  }

  scalar JSON
`;

export const paymentTypeDefs = gql`
  type Payment {
    id: ID
    amount: Float
    currency: String!
    status: PaymentStatus
    method: String
    organization: Organization
    invoice: Invoice
    transactionId: String
    failureReason: String
    refundedAt: Date
    refundAmount: Float
    metadata: JSON
    createdAt: Date
  }

  enum PaymentStatus {
    PENDING
    SUCCESSFUL
    FAILED
    REFUNDED
    PARTIALLY_REFUNDED
  }

  scalar JSON
`;
