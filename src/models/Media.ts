// src/models/Media.ts
import { Schema, model, Document } from "mongoose";

export type MediaType =
  | "AUDIO"
  | "IMAGE"
  | "VIDEO"
  | "DATASET"
  | "PROGRAM"
  | "DOCUMENT";

export interface IMedia extends Document {
  event: Schema.Types.ObjectId; // reference to Event
  uploader: Schema.Types.ObjectId; // reference to User
  title?: string;
  description?: string;
  type: MediaType;
  fileName: string;
  fileSize: number; // in bytes
  mimeType: string;
  mediaUrl: string; // S3 file URL
  uploadedAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<IMedia>(
  {
    event: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    uploader: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["AUDIO", "IMAGE", "VIDEO", "DATASET", "PROGRAM", "DOCUMENT"],
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    mediaUrl: {
      type: String,
      required: true,
    },
  },
  { timestamps: { createdAt: "uploadedAt", updatedAt: "updatedAt" } }
);

export const Media = model<IMedia>("Media", mediaSchema);
