// src/graphql/resolvers/event/utils.ts
import crypto from "crypto";
import { Event } from "../../../models/Event";
const usedKeys = new Set<string>();

export function createEventKey(): string {
  let key: string;

  do {
    key = Math.floor(100000 + Math.random() * 900000).toString();
  } while (usedKeys.has(key));

  usedKeys.add(key);

  return key;
}
export const normalizeEvent = (event: any) => {
  if (!event) return event;
  return {
    ...event,
    id: event._id ? event._id.toString() : null,
    organizer: event.organizer
      ? {
          ...event.organizer,
          id: event.organizer._id?.toString() || null,
        }
      : null,
    facilitators: Array.isArray(event.facilitators)
      ? event.facilitators.map((f: any) => ({
          ...f,
          id: f._id?.toString() || null,
        }))
      : [],
  };
};

// Generate secure event secret (for backend/API use)
export const generateSecureEventSecret = (): string => {
  const safeChars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const randomValues = new Uint8Array(7);

  if (typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < 7; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(randomValues)
    .map((v) => safeChars[v % safeChars.length])
    .join("");
};

export const generateUniqueEventSecret = async (
  maxAttempts = 5,
): Promise<string> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = generateSecureEventSecret();

    try {
      const event = await Event.findOne({ eventSecret: key });
      if (!event) return key;
    } catch (err: any) {
      if (err.code === 11000) continue;
      throw err;
    }
  }

  throw new Error(
    "Unable to generate unique event secret after multiple attempts",
  );
};

// Generate user-friendly event key (for participants to enter)
const generateSecureEventKey = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randomValues = new Uint8Array(6);

  if (typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < 6; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }

  const randomPart = Array.from(randomValues)
    .map((v) => chars[v % chars.length])
    .join("");

  return `EVT-${randomPart}`;
};

export const generateUniqueEventKey = async (
  maxAttempts = 5,
): Promise<string> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = generateSecureEventKey();

    try {
      const event = await Event.findOne({ eventKey: key });
      if (!event) return key;
    } catch (err: any) {
      if (err.code === 11000) continue;
      throw err;
    }
  }

  throw new Error(
    "Unable to generate unique event key after multiple attempts",
  );
};

export const calculateEventDuration = (start: Date, end: Date): number => {
  return end.getTime() - start.getTime();
};

export const isShortEvent = (durationMs: number): boolean => {
  return durationMs <= 180 * 60 * 1000; // 180 minutes
};

// export const calculateEventPrice = (
//   durationMs: number,
//   dailyRate: number = 5.65,
//   discountPercentage: number = 0.2,
// ): {
//   days: number;
//   originalAmount: number;
//   discountAmount: number;
//   finalAmount: number;
// } => {
//   const days = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
//   const originalAmount = days * dailyRate;
//   const discountAmount = originalAmount * discountPercentage;
//   const finalAmount = originalAmount - discountAmount;

//   return { days, originalAmount, discountAmount, finalAmount };
// };

export const checkEventOverlap = async (
  organizerId: string,
  startDate: Date,
  endDate: Date,
) => {
  return await Event.find({
    organizer: organizerId,
    status: { $in: ["DRAFT", "PUBLISHED", "ACTIVE"] },
    $or: [
      {
        "dateTime.start": { $lte: startDate },
        "dateTime.end": { $gte: startDate },
      },
      {
        "dateTime.start": { $lte: endDate },
        "dateTime.end": { $gte: endDate },
      },
      {
        "dateTime.start": { $gte: startDate },
        "dateTime.end": { $lte: endDate },
      },
    ],
  });
};
// src/graphql/resolvers/event/utils.ts

export const calculateEventPrice = (
  durationMs: number,
  dailyRate: number = 5.65,
  discountPercentage: number = 0.2,
): {
  days: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
} => {
  // Calculate number of days (rounded up)
  const days = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

  // Calculate original amount based on daily rate
  const originalAmount = days * dailyRate;

  // Calculate discount amount
  const discountAmount = originalAmount * discountPercentage;

  // Calculate final amount after discount
  const finalAmount = originalAmount - discountAmount;

  return {
    days,
    originalAmount,
    discountAmount,
    finalAmount,
  };
};
