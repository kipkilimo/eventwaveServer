import { Schema, model, Document } from "mongoose";

// =======================================
// 🧩 TYPE DEFINITIONS
// =======================================

export type TestType =
  | "MCQ_SINGLE"
  | "MCQ_MULTIPLE"
  | "TRUE_FALSE"
  | "MATCHING"
  | "FILL_BLANK";

export interface ITestQuestion {
  questionText: string;
  type: TestType;
  options?: string[];
  correctAnswer?: any;
  marks?: number;
  explanation?: string;
}

export interface ITestResponse {
  respondent: Schema.Types.ObjectId;
  responses: any;
  submittedAt: Date;
  totalScore?: number;
  timeTaken?: number; // seconds or minutes
}

export interface ITest extends Document {
  event: Schema.Types.ObjectId;
  title: string;
  description?: string;
  objective?: string;
  duration?: number; // in minutes
  totalMarks?: number;
  createdBy: Schema.Types.ObjectId;
  questions: ITestQuestion[];
  examItems?: any; // parsed JSON from XLSX upload
  responses?: ITestResponse[];
  createdAt: Date;
  updatedAt: Date;
}

// =======================================
// 🧱 SCHEMA DEFINITIONS
// =======================================

// Question schema
const questionSchema = new Schema<ITestQuestion>({
  questionText: {
    type: String,
    required: true,
    trim: true,
    set: (v: string) => (v.startsWith("=") ? `'${v}` : v),
  },
  type: {
    type: String,
    enum: [
      "MCQ_SINGLE",
      "MCQ_MULTIPLE",
      "TRUE_FALSE",
      "MATCHING",
      "FILL_BLANK",
    ],
    required: true,
  },
  options: {
    type: [String],
    set: (v: any) => {
      if (typeof v === "string")
        return v.split(";").map((x: string) => x.trim());
      return v;
    },
  },
  correctAnswer: {
    type: Schema.Types.Mixed,
    set: (v: any) => {
      if (typeof v === "string") {
        try {
          if (v.includes(";")) return v.split(";").map((x) => x.trim());
          return JSON.parse(v);
        } catch {
          return v.trim();
        }
      }
      return v;
    },
  },
  marks: { type: Number, default: 1 },
  explanation: { type: String, trim: true },
});

// Response schema
const responseSchema = new Schema<ITestResponse>({
  respondent: { type: Schema.Types.ObjectId, ref: "User" },
  responses: Schema.Types.Mixed,
  submittedAt: { type: Date, default: Date.now },
  totalScore: Number,
  timeTaken: Number,
});

// Main Test schema
const TestSchema = new Schema<ITest>(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    objective: { type: String, trim: true },
    duration: { type: Number }, // in minutes
    totalMarks: { type: Number },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    questions: [questionSchema],
    examItems: Schema.Types.Mixed, // XLSX parsed JSON stringified
    responses: [responseSchema],
  },
  { timestamps: true },
);

// =======================================
// 🧩 MODEL EXPORT
// =======================================
export const Test = model<ITest>("Test", TestSchema);
