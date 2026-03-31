import mongoose from "mongoose";

const { Schema } = mongoose;

/* ------------------------- ENUMS (matched to SDL) ------------------------- */

export const LiveFeedType = {
  TEXT: "TEXT",
  ANNOUNCEMENT: "ANNOUNCEMENT",
  UPDATE: "UPDATE",
  ALERT:"ALERT"
} as const;

export const LiveFeedPriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;

/* ----------------------- TYPESCRIPT TYPE DEFINITIONS ----------------------- */

export type LiveFeedTypeEnum = (typeof LiveFeedType)[keyof typeof LiveFeedType];
export type LiveFeedPriorityEnum =
  (typeof LiveFeedPriority)[keyof typeof LiveFeedPriority];

export interface IReaction {
  emoji: string;
  count: number;
  users: mongoose.Types.ObjectId[];
}

export interface ILiveFeed extends mongoose.Document {
  event: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  content: string;
  type: LiveFeedTypeEnum;
  priority: LiveFeedPriorityEnum;
  reactions: IReaction[];
  isPinned: boolean;
  isBreaking: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Virtual fields
  reactionCount: number;
}

/* ----------------------------- SUB-SCHEMAS -------------------------------- */

const ReactionSchema = new Schema<IReaction>(
  {
    emoji: { type: String, required: true },
    count: { type: Number, default: 1 },
    users: [{ type: Schema.Types.ObjectId, required: true }],
  },
  { _id: false }
);

/* --------------------------- MAIN SCHEMA ---------------------------------- */

const LiveFeedSchema = new Schema<ILiveFeed>(
  {
    event: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    content: { type: String, required: true },

    type: {
      type: String,
      enum: Object.values(LiveFeedType),
      default: LiveFeedType.TEXT,
      required: true,
    },

    priority: {
      type: String,
      enum: Object.values(LiveFeedPriority),
      default: LiveFeedPriority.MEDIUM,
      required: true,
    },

    reactions: {
      type: [ReactionSchema],
      default: [],
    },

    isPinned: { type: Boolean, default: false },
    isBreaking: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ---------------------------- INDEXES ------------------------------------ */

LiveFeedSchema.index({ event: 1, createdAt: -1 });
LiveFeedSchema.index({ author: 1, createdAt: -1 });
LiveFeedSchema.index({ isPinned: -1, createdAt: -1 });
LiveFeedSchema.index({ isBreaking: -1, createdAt: -1 });
LiveFeedSchema.index({ event: 1, isPinned: -1, isBreaking: -1, createdAt: -1 });
LiveFeedSchema.index({ priority: -1, createdAt: -1 });

/* ---------------------------- VIRTUALS ----------------------------------- */

LiveFeedSchema.virtual("reactionCount").get(function (this: ILiveFeed) {
  return this.reactions.reduce((sum, reaction) => sum + reaction.count, 0);
});

LiveFeedSchema.virtual("uniqueReactors").get(function (this: ILiveFeed) {
  const userSet = new Set<string>();
  this.reactions.forEach(reaction => {
    reaction.users.forEach(userId => userSet.add(userId.toString()));
  });
  return Array.from(userSet);
});

/**
 * FIXED: guard createdAt
 */
LiveFeedSchema.virtual("isActive").get(function (this: ILiveFeed) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return (
    this.reactions.length > 0 ||
    (this.createdAt && this.createdAt > twentyFourHoursAgo) ||
    this.isBreaking ||
    this.isPinned
  );
});

/**
 * FIXED: displayTime now fully safe
 */
LiveFeedSchema.virtual("displayTime").get(function (this: ILiveFeed) {
  if (!this.createdAt) return "Just now";

  const now = new Date();
  const diffMs = now.getTime() - this.createdAt.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return this.createdAt.toLocaleDateString();
});

/* ---------------------------- MODEL EXPORT -------------------------------- */

export const LiveFeed: mongoose.Model<ILiveFeed> =
  mongoose.models.LiveFeed || mongoose.model<ILiveFeed>("LiveFeed", LiveFeedSchema);
