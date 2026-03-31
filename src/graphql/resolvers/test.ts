import * as XLSX from "xlsx";
import axios from "axios";
import { Test, ITestQuestion } from "../../models/Test";
import { Event } from "../../models/Event";
import { User } from "../../models/User";
import { requireAuth } from "../../utils/auth";

// ===============================
// 🧩 INPUT INTERFACES (from SDL)
// ===============================
interface CreateTestInput {
  event: string;
  title: string;
  totalMarks: number;
  duration: number;
  description?: string;
  objective?: string;
  questions: ITestQuestion[];
}

interface ProcessTestFromS3Args {
  eventId: string;
  title: string;
  fileUrl: string;
}

// ===============================
// 🧠 QUERY RESOLVERS
// ===============================
const Query = {
  // List all Tests (admin/debugging)
  getAllTests: async () => Test.find().populate("createdBy event"),

  // List Tests by event
  getTestsByEvent: async (_: any, { eventId }: { eventId: string }) =>
    Test.find({ event: eventId }).populate("createdBy event"),

  // Fetch single Test
  getTestById: async (_: any, { id }: { id: string }) =>
    Test.findById(id).populate("createdBy event responses.respondent"),
};

// ===============================
// ⚙️ MUTATION RESOLVERS
// ===============================
const Mutation = {
  /**
   * 1️⃣ Create Test manually via JSON input
   */
  createTest: async (
    _: any,
    { input }: { input: CreateTestInput },
    { user }: any,
  ) => {
    requireAuth(user);

    const { questions, ...TestDetails } = input;

    const test = new Test({
      ...TestDetails,
      questions, // ✅ aligned with model field
      createdBy: user.id,
    });

    await test.save();
    return test.populate("createdBy event");
  },

  /**
   * 2️⃣ Process XLSX Test from AWS S3
   */
  processTestFromS3: async (
    _: any,
    { eventId, title, fileUrl }: ProcessTestFromS3Args,
    { user }: any,
  ) => {
    requireAuth(user);

    try {
      // Fetch XLSX file from S3
      const response = await axios.get(fileUrl, {
        responseType: "arraybuffer",
      });
      const workbook = XLSX.read(response.data, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      let totalMarks = 0;

      // Convert sheet rows into questions
      const questions: ITestQuestion[] = sheet.map((row: any) => {
        const questionText = String(row["questionText"] || "").trim();
        const type = String(
          row["type"] || "MCQ_SINGLE",
        ).trim() as ITestQuestion["type"];
        const marks = Number(row["marks"]) > 0 ? Number(row["marks"]) : 1;

        const options = row["options"]
          ? String(row["options"])
              .split(";")
              .map((o: string) => o.trim())
          : [];

        const correctAnswerRaw = row["correctAnswer"] || "";
        let correctAnswer: any = correctAnswerRaw;

        try {
          if (
            typeof correctAnswerRaw === "string" &&
            correctAnswerRaw.includes(";")
          ) {
            correctAnswer = correctAnswerRaw
              .split(";")
              .map((v: string) => v.trim());
          } else if (
            typeof correctAnswerRaw === "string" &&
            correctAnswerRaw.startsWith("{")
          ) {
            correctAnswer = JSON.parse(correctAnswerRaw);
          }
        } catch {
          correctAnswer = String(correctAnswerRaw).trim();
        }

        totalMarks += marks;
        return { questionText, type, options, correctAnswer, marks };
      });

      if (!questions.length)
        throw new Error("No valid questions found in XLSX file.");

      // Create Test document
      const test = new Test({
        event: eventId,
        title,
        totalMarks,
        duration: 60, // default (could be adjusted later)
        description: `Test generated from file: ${fileUrl.split("/").pop()}`,
        objective: "Auto-generated Test to assess event topics.",
        questions, // ✅ correct mapping
        createdBy: user.id,
      });

      await test.save();
      return test.populate("createdBy event");
    } catch (err) {
      console.error("❌ XLSX Processing Error:", err);
      throw new Error(
        "Failed to process XLSX Test file. Please verify format.",
      );
    }
  },

  /**
   * 3️⃣ Submit Test response
   */
  submitTestResponse: async (_: any, { input }: any, { user }: any) => {
    requireAuth(user);

    const { TestId, responses } = input;
    const test = await Test.findById(TestId);
    if (!test) throw new Error("Test not found.");

    // Prevent duplicate submissions
    const existingResponse = test.responses?.find(
      (r) => r.respondent.toString() === user.id.toString(),
    );
    if (existingResponse)
      throw new Error("You have already submitted this Test.");

    // TODO: Add scoring logic
    test.responses?.push({
      respondent: user.id,
      responses,
      submittedAt: new Date(),
    });

    await test.save();
    return test.populate("createdBy event responses.respondent");
  },

  /**
   * 4️⃣ Delete Test
   */
  deleteTest: async (_: any, { id }: { id: string }, { user }: any) => {
    requireAuth(user);

    const test = await Test.findById(id);
    if (!test) throw new Error("test not found.");

    // Only creator (or future admin) can delete
    if (test.createdBy.toString() !== user.id.toString()) {
      throw new Error("Unauthorized to delete this test.");
    }

    await test.deleteOne();
    return true;
  },
};

// ===============================
// 📦 EXPORT
// ===============================
export default { Query, Mutation };
