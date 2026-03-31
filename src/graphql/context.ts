import { Request, Response } from "express";
import { verifyToken } from "../utils/auth";

export interface GraphQLContext {
  req: Request;
  res: Response;
  user: any | null; // optionally define a proper user type
}

export const createContext = async (
  { req, res }: { req: Request; res: Response }
): Promise<GraphQLContext> => {
  const token = req.headers.authorization || "";
  const user = token ? await verifyToken(token) : null;
  return { req, res, user };
};
