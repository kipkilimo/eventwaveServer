import dotenv from "dotenv";
dotenv.config();

export const config = {
  JWT_SECRET: process.env.JWT_SECRET || "kamoin_post_mph",
  MONGO_URI: process.env.MONGO_URI || "",
  PORT: process.env.PORT || 4003,
};
