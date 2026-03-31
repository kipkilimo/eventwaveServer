import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDatabase = async (): Promise<void> => {
  try {
    const mongoURI =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/eventwave";

    if (!mongoURI) {
      throw new Error("MongoDB URI is not defined");
    }

    console.log("🔄 Connecting to MongoDB...");

    // ⚠️ Just log SRV, DO NOT modify it
    if (mongoURI.startsWith("mongodb+srv://")) {
      console.log("📡 Using MongoDB Atlas (SRV connection)");
    }

    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4, // 🔥 critical for DNS issues
      maxPoolSize: 10,
      minPoolSize: 2,
    });

    console.log("✅ MongoDB connected successfully");
    console.log(`   Host: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);

    // 🔁 Connection events
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB reconnected");
    });

    // 🛑 Graceful shutdown
    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      console.log("🛑 MongoDB connection closed");
      process.exit(0);
    });
  } catch (error: any) {
    console.error("❌ MongoDB connection error:", error.message || error);

    // 🔁 Retry ONLY for network issues
    if (
      error.message?.includes("ECONNREFUSED") ||
      error.message?.includes("ENOTFOUND") ||
      error.message?.includes("timed out")
    ) {
      console.log("🔄 Retrying in 5 seconds...");
      setTimeout(connectDatabase, 5000);
    } else {
      console.error("💥 Fatal database error. Exiting...");
      process.exit(1);
    }
  }
};

export default connectDatabase;
