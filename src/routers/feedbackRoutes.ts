import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import XLSX from "xlsx";
import { Types } from "mongoose";

import {
  FeedbackModel,
  QuestionType,
  FeedbackStatus,
} from "../models/Feedback";

const router = Router();

/* ===========================
 * TYPES
 * =========================== */

type RawQuestion = {
  text: string;
  type: QuestionType;
  isRequired?: boolean;
  order?: number;
  options?: string[];
  minLabel?: string;
  maxLabel?: string;
  placeholder?: string;
  metadata?: string;
};

/* ===========================
 * MULTER CONFIG (1 FILE ONLY)
 * =========================== */

const uploadDir = "uploads/feedback";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const id = req.query.feedbackId || "feedback";
    cb(null, `${id}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 7 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".xlsx", ".xls", ".csv", ".json"];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext)
      ? cb(null, true)
      : cb(new Error("Only CSV, XLSX, or JSON allowed"));
  },
});

/* ===========================
 * FILE PARSER
 * =========================== */

const parseUploadedFile = (
  filePath: string,
  ext: string
): RawQuestion[] => {
  if (ext === ".json") {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  if (ext === ".csv") {
    const rows = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    const headers = rows[0].split(",").map((h) => h.trim());

    return rows.slice(1).map((row, idx) => {
      const values = row.split(",").map((v) => v.trim());
      const q: any = { order: idx + 1 };

      headers.forEach((h, i) => {
        if (h === "options") q.options = values[i]?.split(";");
        else if (h === "isRequired") q.isRequired = values[i] === "true";
        else q[h] = values[i];
      });

      return q;
    });
  }

  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet) as RawQuestion[];
};

/* ===========================
 * VALIDATION & NORMALIZATION
 * =========================== */

const validateQuestions = (questions: RawQuestion[]) => {
  if (!questions.length) throw new Error("No questions found");
  if (questions.length > 15)
    throw new Error("Maximum 15 questions allowed");

  const seenOrders = new Set<number>();

  return questions.map((q, index) => {
    if (!q.text) throw new Error(`Question ${index + 1} missing text`);
    if (!q.type) throw new Error(`Question ${index + 1} missing type`);

    const order = q.order ?? index + 1;
    if (seenOrders.has(order))
      throw new Error(`Duplicate order ${order}`);
    seenOrders.add(order);

    return {
      text: q.text.trim(),
      type: q.type,
      isRequired: Boolean(q.isRequired),
      options: q.options ?? [],
      minLabel: q.minLabel,
      maxLabel: q.maxLabel,
      placeholder: q.placeholder,
      metadata: q.metadata,
      order,
    };
  });
};

/* ===========================
 * ROUTES
 * =========================== */

router.post(
  "/bulk-create",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) throw new Error("No file uploaded");

      const feedbackId = req.query.feedbackId as string;
      if (!Types.ObjectId.isValid(feedbackId))
        throw new Error("Invalid feedbackId");

      const ext = path.extname(req.file.originalname).toLowerCase();
      const raw = parseUploadedFile(req.file.path, ext);
      const questions = validateQuestions(raw);

      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        {
          questions,
          status: FeedbackStatus.ACTIVE,
        },
        { new: true }
      );

      if (!feedback) throw new Error("Feedback not found");

      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        feedbackId: feedback._id,
        totalQuestions: questions.length,
      });
    } catch (err: any) {
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);

      res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }
);

export default router;
