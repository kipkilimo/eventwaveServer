import { Schema, model, Document, Types } from "mongoose";

// ============================
// ENUMS
// ============================
export type SubscriptionTier = "FREE" | "PRO" | "ENTERPRISE";
export type OrganizationStatus =
  | "ACTIVE"
  | "TRIAL"
  | "PAST_DUE"
  | "SUSPENDED"
  | "BLOCKED"
  | "CANCELLED"
  | "PENDING_APPROVAL";
export type BillingStatus =
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED"
  | "TRIAL"
  | "EXPIRED"
  | "SUSPENDED";
export type BillingCycle = "MONTHLY" | "QUARTERLY" | "ANNUAL";
export type BillingAction =
  | "SUBSCRIPTION_STARTED"
  | "SUBSCRIPTION_RENEWED"
  | "SUBSCRIPTION_CANCELLED"
  | "SUBSCRIPTION_CHANGED"
  | "INVOICE_CREATED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_FAILED"
  | "CREDIT_APPLIED"
  | "REFUND_ISSUED"
  | "QUOTA_EXCEEDED"
  | "TIER_UPGRADED"
  | "TIER_DOWNGRADED";
export type LegalDocumentType =
  | "TERMS_OF_SERVICE"
  | "PRIVACY_POLICY"
  | "DATA_PROCESSING_AGREEMENT"
  | "SERVICE_LEVEL_AGREEMENT"
  | "ENTERPRISE_CONTRACT";
export type VerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "REVIEW_REQUIRED";

// ============================
// INTERFACES
// ============================

export interface ILegalDocument {
  type: LegalDocumentType;
  url: string;
  version: string;
  signedAt?: Date;
  signedBy?: Types.ObjectId;
}

export interface IQuotaUsage {
  eventsUsed: number;
  eventsLimit: number;
  participantsUsed: number;
  participantsLimit: number;
  storageUsedGB: number;
  storageLimitGB: number;
  apiCallsThisMonth: number;
  apiCallsLimit: number;
  concurrentEventsUsed: number;
  concurrentEventsLimit: number;
  customDomainEnabled: boolean;
  ssoEnabled: boolean;
  apiAccessEnabled: boolean;
  dedicatedSupportEnabled: boolean;
}

export interface IBillingHistoryEntry {
  _id?: Types.ObjectId; // MongoDB's default _id, optional for new entries
  action: BillingAction;
  description: string;
  amount?: number;
  date: Date;
  invoiceId?: Types.ObjectId;
  metadata?: Record<string, any>;
}

export interface IOrganizationMetadata {
  createdVia: string;
  approvalRequired: boolean;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  sourceIp?: string;
  userAgent?: string;
  verificationStatus: VerificationStatus;
  verifiedAt?: Date;
}

export interface IOrganization extends Document {
  // Basic Info
  name: string;
  email: string;
  address?: string;
  phone?: string;
  website?: string;

  // Billing & Subscription
  subscriptionTier: SubscriptionTier;
  billingStatus: BillingStatus;
  nextBillingDate?: Date;
  billingCycle: BillingCycle;
  trialEndsAt?: Date;
  subscriptionStartDate?: Date;
  subscriptionEndDate?: Date;

  // Limits & Quotas
  maxEvents: number;
  maxParticipantsPerEvent: number;
  maxConcurrentEvents: number;
  maxStorageGB: number;
  currentEventCount: number;
  currentParticipantCount: number;
  eventsThisMonth: number;

  // Billing-specific fields
  billingEmail?: string;
  billingAddress?: string;
  taxId?: string;
  registrationNumber?: string;
  paymentMethodId?: string;
  autoRenew: boolean;

  // Enterprise features (only for ENTERPRISE tier)
  customDomain?: string;
  ssoEnabled: boolean;
  ssoConfig?: Record<string, any>;
  apiAccessEnabled: boolean;
  webhookUrl?: string;
  webhookEvents?: string[];
  dedicatedSupport: boolean;
  customSLA: boolean;

  // Legal & Compliance
  orgLegalDocuments: ILegalDocument[];
  termsAcceptedAt?: Date;
  privacyPolicyAcceptedAt?: Date;

  // Status tracking
  isBlocked: boolean;
  isSuspended: boolean;
  orgType: string;
  status: OrganizationStatus;

  // Relationships
  createdBy: Types.ObjectId;
  users: Types.ObjectId[];
  admins: Types.ObjectId[];
  invoices: Types.ObjectId[];
  events: Types.ObjectId[];
  payments: Types.ObjectId[];
  billingHistory: Types.DocumentArray<IBillingHistoryEntry>;
  quotas: IQuotaUsage;

  // Metadata
  metadata: IOrganizationMetadata;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================
// SUB-DOCUMENT SCHEMAS
// ============================

const LegalDocumentSchema = new Schema<ILegalDocument>(
  {
    type: {
      type: String,
      enum: [
        "TERMS_OF_SERVICE",
        "PRIVACY_POLICY",
        "DATA_PROCESSING_AGREEMENT",
        "SERVICE_LEVEL_AGREEMENT",
        "ENTERPRISE_CONTRACT",
      ],
      required: true,
    },
    url: { type: String, required: true },
    version: { type: String, required: true },
    signedAt: { type: Date },
    signedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true },
);

const QuotaUsageSchema = new Schema<IQuotaUsage>(
  {
    eventsUsed: { type: Number, default: 0, min: 0 },
    eventsLimit: { type: Number, default: 10 },
    participantsUsed: { type: Number, default: 0, min: 0 },
    participantsLimit: { type: Number, default: 100 },
    storageUsedGB: { type: Number, default: 0, min: 0 },
    storageLimitGB: { type: Number, default: 1 },
    apiCallsThisMonth: { type: Number, default: 0, min: 0 },
    apiCallsLimit: { type: Number, default: 1000 },
    concurrentEventsUsed: { type: Number, default: 0, min: 0 },
    concurrentEventsLimit: { type: Number, default: 1 },
    customDomainEnabled: { type: Boolean, default: false },
    ssoEnabled: { type: Boolean, default: false },
    apiAccessEnabled: { type: Boolean, default: false },
    dedicatedSupportEnabled: { type: Boolean, default: false },
  },
  { _id: false },
);

const BillingHistoryEntrySchema = new Schema<IBillingHistoryEntry>(
  {
    action: {
      type: String,
      enum: [
        "SUBSCRIPTION_STARTED",
        "SUBSCRIPTION_RENEWED",
        "SUBSCRIPTION_CANCELLED",
        "SUBSCRIPTION_CHANGED",
        "INVOICE_CREATED",
        "PAYMENT_RECEIVED",
        "PAYMENT_FAILED",
        "CREDIT_APPLIED",
        "REFUND_ISSUED",
        "QUOTA_EXCEEDED",
        "TIER_UPGRADED",
        "TIER_DOWNGRADED",
      ],
      required: true,
    },
    description: { type: String, required: true },
    amount: { type: Number },
    date: { type: Date, default: Date.now },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: true },
);

const OrganizationMetadataSchema = new Schema<IOrganizationMetadata>(
  {
    createdVia: { type: String, required: true },
    approvalRequired: { type: Boolean, default: false },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    sourceIp: { type: String },
    userAgent: { type: String },
    verificationStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED", "REVIEW_REQUIRED"],
      default: "PENDING",
    },
    verifiedAt: { type: Date },
  },
  { _id: false },
);

// ============================
// MAIN ORGANIZATION SCHEMA
// ============================

const organizationSchema = new Schema<IOrganization>(
  {
    // Basic Info
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },

    // Billing & Subscription
    subscriptionTier: {
      type: String,
      enum: ["FREE", "PRO", "ENTERPRISE"],
      default: "FREE",
      required: true,
      index: true,
    },
    billingStatus: {
      type: String,
      enum: [
        "ACTIVE",
        "PAST_DUE",
        "CANCELLED",
        "TRIAL",
        "EXPIRED",
        "SUSPENDED",
      ],
      default: "ACTIVE",
      required: true,
      index: true,
    },
    nextBillingDate: { type: Date },
    billingCycle: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "ANNUAL"],
      default: "MONTHLY",
    },
    trialEndsAt: { type: Date },
    subscriptionStartDate: { type: Date, default: Date.now },
    subscriptionEndDate: { type: Date },

    // Limits & Quotas
    maxEvents: { type: Number, default: 10, min: 0 },
    maxParticipantsPerEvent: { type: Number, default: 100, min: 0 },
    maxConcurrentEvents: { type: Number, default: 1, min: 0 },
    maxStorageGB: { type: Number, default: 1, min: 0 },
    currentEventCount: { type: Number, default: 0, min: 0 },
    currentParticipantCount: { type: Number, default: 0, min: 0 },
    eventsThisMonth: { type: Number, default: 0, min: 0 },

    // Billing-specific fields
    billingEmail: { type: String, lowercase: true, trim: true },
    billingAddress: { type: String, trim: true },
    taxId: { type: String, trim: true },
    registrationNumber: { type: String, trim: true },
    paymentMethodId: { type: String },
    autoRenew: { type: Boolean, default: true },

    // Enterprise features
    customDomain: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    ssoEnabled: { type: Boolean, default: false },
    ssoConfig: { type: Schema.Types.Mixed },
    apiAccessEnabled: { type: Boolean, default: false },
    webhookUrl: { type: String, trim: true },
    webhookEvents: [{ type: String }],
    dedicatedSupport: { type: Boolean, default: false },
    customSLA: { type: Boolean, default: false },

    // Legal & Compliance
    orgLegalDocuments: [LegalDocumentSchema],
    termsAcceptedAt: { type: Date },
    privacyPolicyAcceptedAt: { type: Date },

    // Status tracking
    isBlocked: { type: Boolean, default: false, index: true },
    isSuspended: { type: Boolean, default: false, index: true },
    orgType: {
      type: String,
      default: "Healthcare & Life Sciences",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "ACTIVE",
        "TRIAL",
        "PAST_DUE",
        "SUSPENDED",
        "BLOCKED",
        "CANCELLED",
        "PENDING_APPROVAL",
      ],
      default: "PENDING_APPROVAL",
      required: true,
      index: true,
    },

    // Relationships
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    users: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    admins: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    invoices: [
      {
        type: Schema.Types.ObjectId,
        ref: "Invoice",
      },
    ],
    events: [
      {
        type: Schema.Types.ObjectId,
        ref: "Event",
      },
    ],
    payments: [
      {
        type: Schema.Types.ObjectId,
        ref: "Payment",
      },
    ],
    billingHistory: [BillingHistoryEntrySchema],
    quotas: { type: QuotaUsageSchema, default: () => ({}) },

    // Metadata
    metadata: { type: OrganizationMetadataSchema, required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ============================
// INDEXES
// ============================

// Text search indexes
organizationSchema.index({ name: "text", email: "text" });

// Compound indexes for common queries
organizationSchema.index({ subscriptionTier: 1, status: 1 });
organizationSchema.index({ billingStatus: 1, nextBillingDate: 1 });
organizationSchema.index({ status: 1, isBlocked: 1, isSuspended: 1 });
organizationSchema.index({ "metadata.verificationStatus": 1, status: 1 });

// Enterprise-specific indexes
organizationSchema.index({ customDomain: 1 }, { sparse: true });
organizationSchema.index({ ssoEnabled: 1, subscriptionTier: 1 });
organizationSchema.index({ apiAccessEnabled: 1, subscriptionTier: 1 });

// Date-based indexes for billing
organizationSchema.index({ nextBillingDate: 1, billingStatus: 1 });
organizationSchema.index({ subscriptionEndDate: 1, status: 1 });
organizationSchema.index({ trialEndsAt: 1, status: 1 });

// Quota monitoring indexes
organizationSchema.index({ "quotas.eventsUsed": 1, "quotas.eventsLimit": 1 });
organizationSchema.index({
  "quotas.storageUsedGB": 1,
  "quotas.storageLimitGB": 1,
});
organizationSchema.index({ eventsThisMonth: 1, maxEvents: 1 });

// ============================
// VIRTUALS
// ============================

organizationSchema.virtual("isOverQuota").get(function (this: IOrganization) {
  return (
    this.quotas.eventsUsed >= this.quotas.eventsLimit ||
    this.quotas.participantsUsed >= this.quotas.participantsLimit ||
    this.quotas.storageUsedGB >= this.quotas.storageLimitGB ||
    this.eventsThisMonth >= this.maxEvents
  );
});

organizationSchema.virtual("daysUntilTrialEnds").get(function (
  this: IOrganization,
) {
  if (!this.trialEndsAt) return null;
  const now = new Date();
  const diffTime = this.trialEndsAt.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

organizationSchema.virtual("isEnterprise").get(function (this: IOrganization) {
  return this.subscriptionTier === "ENTERPRISE";
});

organizationSchema.virtual("hasEnterpriseFeatures").get(function (
  this: IOrganization,
) {
  return this.ssoEnabled || this.apiAccessEnabled || this.customDomain;
});

// ============================
// METHODS
// ============================

organizationSchema.methods.updateQuotas = async function (this: IOrganization) {
  // This method would be implemented to recalculate quotas based on current usage
  // You would query related collections (events, participants, etc.) and update
  return this;
};

organizationSchema.methods.checkAndApplyTrialLimits = async function (
  this: IOrganization,
) {
  if (
    this.status === "TRIAL" &&
    this.trialEndsAt &&
    this.trialEndsAt < new Date()
  ) {
    this.status = "PAST_DUE";
    this.billingStatus = "EXPIRED";
    await this.save();
  }
  return this;
};

organizationSchema.methods.canCreateEvent = function (
  this: IOrganization,
): boolean {
  return (
    this.status === "ACTIVE" &&
    !this.isBlocked &&
    !this.isSuspended &&
    this.currentEventCount < this.maxEvents &&
    this.eventsThisMonth < this.maxEvents
  );
};

// ============================
// MIDDLEWARE
// ============================

// Pre-save middleware to update status based on billing status
organizationSchema.pre("save", function (next) {
  if (this.isModified("billingStatus")) {
    if (this.billingStatus === "PAST_DUE") {
      this.status = "PAST_DUE";
    } else if (this.billingStatus === "SUSPENDED") {
      this.status = "SUSPENDED";
    } else if (this.billingStatus === "CANCELLED") {
      this.status = "CANCELLED";
    } else if (this.billingStatus === "ACTIVE" && this.status === "PAST_DUE") {
      this.status = "ACTIVE";
    }
  }
  next();
});

// Pre-save middleware to set tier-specific limits
organizationSchema.pre("save", function (next) {
  // Set limits based on subscription tier
  if (this.isModified("subscriptionTier")) {
    const tierLimits = {
      FREE: {
        maxEvents: 10,
        maxParticipantsPerEvent: 100,
        maxConcurrentEvents: 1,
        maxStorageGB: 1,
        quotas: {
          eventsLimit: 10,
          participantsLimit: 100,
          storageLimitGB: 1,
          apiCallsLimit: 1000,
          concurrentEventsLimit: 1,
        },
      },
      PRO: {
        maxEvents: 100,
        maxParticipantsPerEvent: 1000,
        maxConcurrentEvents: 5,
        maxStorageGB: 10,
        quotas: {
          eventsLimit: 100,
          participantsLimit: 1000,
          storageLimitGB: 10,
          apiCallsLimit: 10000,
          concurrentEventsLimit: 5,
        },
      },
      ENTERPRISE: {
        maxEvents: 1000,
        maxParticipantsPerEvent: 10000,
        maxConcurrentEvents: 50,
        maxStorageGB: 100,
        quotas: {
          eventsLimit: 1000,
          participantsLimit: 10000,
          storageLimitGB: 100,
          apiCallsLimit: 100000,
          concurrentEventsLimit: 50,
        },
      },
    };

    const limits = tierLimits[this.subscriptionTier];
    this.maxEvents = limits.maxEvents;
    this.maxParticipantsPerEvent = limits.maxParticipantsPerEvent;
    this.maxConcurrentEvents = limits.maxConcurrentEvents;
    this.maxStorageGB = limits.maxStorageGB;

    if (this.quotas) {
      this.quotas.eventsLimit = limits.quotas.eventsLimit;
      this.quotas.participantsLimit = limits.quotas.participantsLimit;
      this.quotas.storageLimitGB = limits.quotas.storageLimitGB;
      this.quotas.apiCallsLimit = limits.quotas.apiCallsLimit;
      this.quotas.concurrentEventsLimit = limits.quotas.concurrentEventsLimit;
    }

    // Set enterprise-specific flags
    if (this.subscriptionTier === "ENTERPRISE") {
      this.dedicatedSupport = true;
      this.apiAccessEnabled = true;
    }
  }
  next();
});

// ============================
// MODEL
// ============================

export const Organization = model<IOrganization>(
  "Organization",
  organizationSchema,
);
