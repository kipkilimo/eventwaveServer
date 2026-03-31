// src/utils/auth.ts
import jwt from "jsonwebtoken";
import { User, IUser } from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export const generateToken = (user: IUser): string => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
};

// Fix verifyToken to strip "Bearer " if present
export const verifyToken = (token: string): any => {
  try {
    const actualToken = token.startsWith("Bearer ") ? token.slice(7) : token;
    return jwt.verify(actualToken, JWT_SECRET);
  } catch (err) {
    throw new Error("invalid token");
  }
};

// Authenticate and return full user from DB
export const authenticateUser = async (
  token: string,
): Promise<IUser | null> => {
  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId);
    return user;
  } catch (err) {
    return null;
  }
};

// Require auth helper
export const requireAuth = (user: any) => {
  if (!user) throw new Error("Authentication required");
  return user;
};

// Role-based permissions
export const canCreateResource = (user: any, resourceType: string): boolean => {
  switch (resourceType) {
    case "Chat":
    case "Feedback":
      return ["PARTICIPANT", "FACILITATOR", "SUPER"].includes(user.role);
    case "Poll":
    case "Test":
    case "QnA":
    case "LiveFeed":
    case "Notice":
    case "Program":
      return ["FACILITATOR", "SUPER"].includes(user.role);
    default:
      return false;
  }
};
