// src/models/Event.ts
import { Schema, model, Document, Types } from "mongoose";

export interface IEvent extends Document {
  title: string;
  description?: string;
  eventSecret: string;
  eventKey: string; // Add eventKey field
  organizer: Types.ObjectId;
  organization?: Types.ObjectId;
  eventType: string;
  status: string;
  dateTime: {
    start: Date;
    end: Date;
  };
  location: {
    name: string;
    address: string;
    virtualLink?: string;
    isVirtual: boolean;
  };
  capacity?: number;
  interactivity?: {
    allowChat: boolean;
    allowPrivateMessages: boolean;
    allowPolls: boolean;
    allowQnA: boolean;
    allowFeedback: boolean;
    allowScreenSharing: boolean;
    allowBreakoutRooms: boolean;
    allowWhiteboard: boolean;
    liveReactions: boolean;
    raiseHandFeature: boolean;
  };
  branding?: {
    logoUrl?: string;
    themeColor?: string;
    bannerBg?: string;
  };
  participants: Types.ObjectId[];
  facilitators: Types.ObjectId[];
  admins: Types.ObjectId[];
  isFreeEvent: boolean;
  isShortEvent: boolean;
  isSecureAccessEvent?: boolean;
  eventDuration?: {
    milliseconds: number;
    hours: number;
    minutes: number;
    days: number;
  };
  billing?: {
    invoiceNumber?: string;
    dailyRate?: number;
    days?: number;
    originalAmount?: number;
    discountAmount?: number;
    finalAmount?: number;
    currency: string;
    status: string;
    paidAt?: Date;
    paymentMethod?: string;
  };
  tags: string[];
  categories: string[];
  metadata: {
    timezone: string;
    language: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: Types.ObjectId;
    isEnterprise?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  // Session management fields
  sessionStartedAt?: Date;
  sessionPausedAt?: Date;
  sessionEndedAt?: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true },
    description: { type: String },
    eventSecret: { type: String, required: true, unique: true },
    eventKey: { type: String, required: true, unique: false }, // Add eventKey field
    organizer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    organization: { type: Schema.Types.ObjectId, ref: "Organization" },
    eventType: {
      type: String,
      enum: [
        "MEETING",
        "WORKSHOP",
        "TRAINING",
        "SEMINAR",
        "CONFERENCE",
        "WEBINAR",
      ],
      default: "WORKSHOP",
    },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"],
      default: "DRAFT",
    },
    dateTime: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    location: {
      name: { type: String, required: true },
      address: { type: String, required: true },
      virtualLink: { type: String },
      isVirtual: { type: Boolean, default: false },
    },
    capacity: { type: Number },
    interactivity: {
      allowChat: { type: Boolean, default: true },
      allowPrivateMessages: { type: Boolean, default: true },
      allowPolls: { type: Boolean, default: true },
      allowQnA: { type: Boolean, default: true },
      allowFeedback: { type: Boolean, default: true },
      allowScreenSharing: { type: Boolean, default: true },
      allowBreakoutRooms: { type: Boolean, default: true },
      allowWhiteboard: { type: Boolean, default: true },
      liveReactions: { type: Boolean, default: true },
      raiseHandFeature: { type: Boolean, default: true },
    },
    branding: {
      logoUrl: { type: String },
      themeColor: { type: String },
      bannerBg: { type: String },
    },
    participants: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    facilitators: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    admins: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    isFreeEvent: { type: Boolean, default: false },
    isShortEvent: { type: Boolean, default: false },
    isSecureAccessEvent: { type: Boolean, default: false },
    eventDuration: {
      milliseconds: { type: Number },
      hours: { type: Number },
      minutes: { type: Number },
      days: { type: Number },
    },
    billing: {
      invoiceNumber: { type: String },
      dailyRate: { type: Number },
      days: { type: Number },
      originalAmount: { type: Number },
      discountAmount: { type: Number },
      finalAmount: { type: Number },
      currency: { type: String, default: "USD" },
      status: {
        type: String,
        enum: [
          "PENDING",
          "PAID",
          "OVERDUE",
          "CANCELLED",
          "REFUNDED",
          "PRE_AGREED",
        ],
        default: "PENDING",
      },
      paidAt: { type: Date },
      paymentMethod: { type: String },
    },
    tags: [{ type: String, default: [] }],
    categories: [{ type: String, default: [] }],
    metadata: {
      timezone: { type: String, default: "UTC" },
      language: { type: String, default: "en" },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
      createdBy: { type: Schema.Types.ObjectId, ref: "User" },
      isEnterprise: { type: Boolean, default: false },
    },
    // Session management fields
    sessionStartedAt: { type: Date },
    sessionPausedAt: { type: Date },
    sessionEndedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Pre-save middleware to calculate event duration
EventSchema.pre("save", function (next) {
  if (this.dateTime && this.dateTime.start && this.dateTime.end) {
    const durationMs =
      this.dateTime.end.getTime() - this.dateTime.start.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    const durationMinutes = durationMs / (1000 * 60);
    const durationDays = Number(
      (durationMs / (1000 * 60 * 60 * 24)).toFixed(5),
    );

    this.eventDuration = {
      milliseconds: durationMs,
      hours: durationHours,
      minutes: durationMinutes,
      days: durationDays,
    };
  }
  next();
});

export const Event = model<IEvent>("Event", EventSchema);
