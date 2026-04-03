// src/graphql/resolvers/event/mutations.ts
import { Types } from "mongoose";
import { Event } from "../../../models/Event";
import { User } from "../../../models/User";
import { Organization } from "../../../models/Organization";
import { requireAuth } from "../../../utils/auth";
import { sendEmail } from "../../../utils/emailHandler";

import { ObjectId } from "mongodb";
import { Db } from "mongodb";
// import { PubSub } from "graphql-subscriptions";

import {
  generateUniqueEventSecret,
  generateUniqueEventKey,
  calculateEventDuration,
  calculateEventPrice,
  createEventKey,
  isShortEvent,
  checkEventOverlap,
} from "./utils";
import { generateQrPdf, createEventSummaryEmail } from "./helpers";

type EventPlan = "FREE" | "BUSINESS";
function resolveEventPlan(event: any): EventPlan {
  return event?.isFreeEvent ? "FREE" : "BUSINESS";
}
function getPlanConfig(plan: EventPlan) {
  switch (plan) {
    case "BUSINESS":
      return {
        label: "✦ BUSINESS EVENT ✦",
        billing: "Billing applies based on your plan",
        note: "This event is covered under your active business plan.",
        statusSuffix: "— active billing",
      };

    case "FREE":
    default:
      return {
        label: "✦ FREE EVENT ✦",
        billing: "Free tier limits apply",
        note: "This event is running under the free plan. Upgrade to unlock more features.",
        statusSuffix: "— limited features",
      };
  }
}
// ==============================================================
// FREE EVENT MUTATION
// ==============================================================

export const createFreeEvent = async (
  _: any,
  { input }: any,
  { user }: any,
) => {
  requireAuth(user);
  let pdfPath: string | null = null;

  try {
    const thisUser = await User.findById(input.organizer);
    if (!thisUser) throw new Error("User not found");

    if (!input.title?.trim()) throw new Error("Event title is required");
    if (!input.start) throw new Error("Event start time is required");

    const startDate = new Date(input.start);
    const endDate = input.end
      ? new Date(input.end)
      : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

    if (endDate <= startDate)
      throw new Error("End date must be after start date");

    const durationMs = calculateEventDuration(startDate, endDate);

    if (!isShortEvent(durationMs)) {
      throw new Error(
        `Event duration (${Math.ceil(durationMs / (1000 * 60))} minutes) exceeds free event limit (180 minutes).`,
      );
    }

    const overlappingEvents = await checkEventOverlap(
      input.organizer,
      startDate,
      endDate,
    );

    if (overlappingEvents.length > 0) {
      throw new Error(
        `Cannot create event. Overlaps with ${overlappingEvents.length} existing event(s).`,
      );
    }

    const eventSecret = await generateUniqueEventSecret();
    const eventKey = createEventKey();
    const maxCapacity =
      typeof input.capacity === "number" ? input.capacity : 50;

    if (!input.location) throw new Error("Location is required");

    const locationData = {
      name: input.location.name || "Virtual Event",
      address: input.location.address || "Online",
      virtualLink: input.location.virtualLink || null,
      isVirtual: input.location.isVirtual ?? false,
    };

    const event = new Event({
      title: input.title.trim(),
      description: input.description?.trim() || "",
      eventSecret,
      eventKey,
      organizer: input.organizer,
      eventType: input.eventType?.toUpperCase() || "WORKSHOP",
      status: "PUBLISHED",
      dateTime: { start: startDate, end: endDate },
      location: locationData,
      capacity: maxCapacity,
      interactivity: input.interactivity || {},
      branding: input.branding || {},
      metadata: {
        timezone: input.metadata?.timezone || "UTC",
        language: input.metadata?.language || "en",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      isFreeEvent: true,
      isShortEvent: true,
      participants: [],
      tags: input.tags || [],
      categories: input.categories || [],
    });

    await event.save();

    const pdfDetails = {
      title: event.title,
      location: {
        name: event.location.name,
        address: event.location.address,
      },
      eventSecret: event.eventSecret,
      eventKey: event.eventSecret,
    };

    pdfPath = await generateQrPdf(pdfDetails);

    const emailBody = createEventSummaryEmail(event, null, null, true);

    await sendEmail(
      thisUser.email,
      `✨ FREE Event Created - ${event.title} ✨`,
      emailBody,
      [
        {
          filename: `${event.title}-${event.eventSecret}-qr-access.pdf`,
          path: pdfPath,
        },
      ],
    );

    return await event.populate("organizer");
  } catch (error) {
    console.error("Free event creation failed:", error);
    throw new Error(
      `Failed to create free event: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    if (pdfPath) {
      try {
        const fs = await import("fs/promises");
        await fs.unlink(pdfPath);
      } catch {}
    }
  }
};

// ==============================================================
// STANDARD EVENT MUTATION
// ==============================================================

export const createStandardEvent = async (
  _: any,
  { input }: any,
  { user }: any,
) => {
  requireAuth(user);
  let pdfPath: string | null = null;

  try {
    const thisUser = await User.findById(input.organizer);
    if (!thisUser) throw new Error("User not found");

    if (!input.title?.trim()) throw new Error("Event title is required");
    if (!input.start) throw new Error("Event start time is required");
    if (!input.organizationId) throw new Error("Organization ID is required");

    const startDate = new Date(input.start);
    const endDate = input.end
      ? new Date(input.end)
      : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

    if (endDate <= startDate)
      throw new Error("End date must be after start date");

    const durationMs = calculateEventDuration(startDate, endDate);

    const overlappingEvents = await checkEventOverlap(
      input.organizer,
      startDate,
      endDate,
    );

    if (overlappingEvents.length > 0) {
      throw new Error(
        `Cannot create event. Overlaps with ${overlappingEvents.length} existing event(s).`,
      );
    }

    const organization = await Organization.findById(input.organizationId);
    if (!organization) throw new Error("Organization not found");

    if (organization.status !== "ACTIVE") {
      throw new Error(
        `Organization is not active. Current status: ${organization.status}`,
      );
    }

    if (organization.isBlocked)
      throw new Error("Organization is blocked. Cannot create events.");
    if (organization.isSuspended)
      throw new Error(
        "Organization is suspended. Please update billing information.",
      );
    if (organization.billingStatus === "PAST_DUE")
      throw new Error(
        "Organization has past due invoices. Please update payment method.",
      );
    if (organization.billingStatus === "SUSPENDED")
      throw new Error(
        "Organization billing is suspended. Please contact support.",
      );
    if (organization.currentEventCount >= organization.maxEvents)
      throw new Error(
        `Organization has reached maximum event limit of ${organization.maxEvents}.`,
      );
    if (organization.eventsThisMonth >= organization.maxEvents)
      throw new Error(
        `Organization has reached monthly event limit of ${organization.maxEvents}.`,
      );

    const eventSecret = await generateUniqueEventSecret();
    const eventKey = createEventKey();
    const { days, originalAmount, discountAmount, finalAmount } =
      calculateEventPrice(durationMs);
    const invoiceNumber = `INV-${Date.now()}-${eventKey}`;

    const maxCapacity =
      typeof input.capacity === "number" ? input.capacity : 100;

    if (
      organization.maxParticipantsPerEvent &&
      maxCapacity > organization.maxParticipantsPerEvent
    ) {
      throw new Error(
        `Event capacity (${maxCapacity}) exceeds organization maximum of ${organization.maxParticipantsPerEvent}.`,
      );
    }

    const locationData = input.location
      ? {
          name: input.location.name,
          address: input.location.address,
          virtualLink: input.location.virtualLink || null,
          isVirtual: input.location.isVirtual ?? false,
        }
      : {
          name: organization.name,
          address: organization.address || "TBD",
          virtualLink: null,
          isVirtual: false,
        };

    const event = new Event({
      title: input.title.trim(),
      description: input.description?.trim() || "",
      eventSecret,
      eventKey,
      organizer: input.organizer,
      organization: input.organizationId,
      eventType: input.eventType?.toUpperCase() || "WORKSHOP",
      status: "PUBLISHED",
      dateTime: { start: startDate, end: endDate },
      location: locationData,
      capacity: maxCapacity,
      interactivity: input.interactivity || {},
      branding: input.branding || {},
      isFreeEvent: false,
      isShortEvent: isShortEvent(durationMs),
      billing: {
        invoiceNumber,
        dailyRate: 5.65,
        days,
        originalAmount,
        discountAmount,
        finalAmount,
        currency: "USD",
        status: "PENDING",
      },
      metadata: {
        timezone: input.metadata?.timezone || "UTC",
        language: input.metadata?.language || "en",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      participants: [],
      tags: input.tags || [],
      categories: input.categories || [],
    });

    await event.save();

    organization.currentEventCount += 1;
    organization.eventsThisMonth += 1;
    if (organization.quotas)
      organization.quotas.eventsUsed = organization.currentEventCount;
    organization.billingHistory.push({
      action: "INVOICE_CREATED",
      description: `Event created: ${event.title}`,
      amount: finalAmount,
      date: new Date(),
      invoiceId: event._id,
      metadata: { eventSecret, eventKey, invoiceNumber },
    });
    if (!organization.events) organization.events = [];
    organization.events.push(event._id);
    await organization.save();

    const pdfDetails = {
      title: event.title,
      location: {
        name: event.location.name,
        address: event.location.address,
      },
      eventSecret: event.eventSecret,
      eventKey: event.eventSecret,
    };

    pdfPath = await generateQrPdf(pdfDetails);

    const emailBody = createEventSummaryEmail(
      event,
      organization,
      {
        invoiceNumber,
        finalAmount,
        originalAmount,
        discountAmount,
        days,
        status: "",
        currency: "",
        amount: 0,
        dailyRate: 0,
      },
      false,
    );

    await sendEmail(
      thisUser.email,
      `📋 Standard Event Created - ${event.title} (Invoice: ${invoiceNumber})`,
      emailBody,
      [{ filename: `${event.eventKey}-qr-access.pdf`, path: pdfPath }],
    );

    return await event.populate("organizer organization");
  } catch (error) {
    console.error("Standard event creation failed:", error);
    throw new Error(
      `Failed to create standard event: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    if (pdfPath) {
      try {
        const fs = await import("fs/promises");
        await fs.unlink(pdfPath);
      } catch {}
    }
  }
};

// ==============================================================
// ENTERPRISE EVENT MUTATION
// ==============================================================

export const createEnterpriseEvent = async (
  _: any,
  { input }: any,
  { user }: any,
) => {
  requireAuth(user);
  let pdfPath: string | null = null;

  try {
    const thisUser = await User.findById(input.organizer);
    if (!thisUser) throw new Error("User not found");

    if (!input.title?.trim()) throw new Error("Event title is required");
    if (!input.start) throw new Error("Event start time is required");
    if (!input.organizationId) throw new Error("Organization ID is required");

    const startDate = new Date(input.start);
    const endDate = input.end
      ? new Date(input.end)
      : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

    if (endDate <= startDate)
      throw new Error("End date must be after start date");

    const durationMs = calculateEventDuration(startDate, endDate);

    const overlappingEvents = await checkEventOverlap(
      input.organizer,
      startDate,
      endDate,
    );

    if (overlappingEvents.length > 0) {
      throw new Error(
        `Cannot create event. Overlaps with ${overlappingEvents.length} existing event(s).`,
      );
    }

    const organization = await Organization.findById(input.organizationId);
    if (!organization) throw new Error("Organization not found");

    if (organization.subscriptionTier !== "ENTERPRISE") {
      throw new Error(
        `Enterprise events can only be created by organizations on ENTERPRISE tier. Current tier: ${organization.subscriptionTier}`,
      );
    }

    if (organization.status !== "ACTIVE") {
      throw new Error(
        `Organization is not active. Current status: ${organization.status}`,
      );
    }

    if (organization.isBlocked)
      throw new Error("Organization is blocked. Cannot create events.");
    if (organization.isSuspended)
      throw new Error(
        "Organization is suspended. Please update billing information.",
      );
    if (organization.billingStatus === "PAST_DUE")
      throw new Error(
        "Organization has past due invoices. Please update payment method.",
      );
    if (organization.currentEventCount >= organization.maxEvents)
      throw new Error(
        `Organization has reached maximum event limit of ${organization.maxEvents}.`,
      );
    if (organization.eventsThisMonth >= organization.maxEvents)
      throw new Error(
        `Organization has reached monthly event limit of ${organization.maxEvents}.`,
      );

    const eventSecret = await generateUniqueEventSecret();
    const eventKey = createEventKey();
    const maxCapacity =
      typeof input.capacity === "number" ? input.capacity : 100;

    if (
      organization.maxParticipantsPerEvent &&
      maxCapacity > organization.maxParticipantsPerEvent
    ) {
      throw new Error(
        `Event capacity (${maxCapacity}) exceeds organization maximum of ${organization.maxParticipantsPerEvent}.`,
      );
    }

    const locationData = input.location
      ? {
          name: input.location.name,
          address: input.location.address,
          virtualLink: input.location.virtualLink || null,
          isVirtual: input.location.isVirtual ?? false,
        }
      : {
          name: organization.name,
          address: organization.address || "TBD",
          virtualLink: null,
          isVirtual: false,
        };

    const event = new Event({
      title: input.title.trim(),
      description: input.description?.trim() || "",
      eventSecret,
      eventKey,
      organizer: input.organizer,
      organization: input.organizationId,
      eventType: input.eventType?.toUpperCase() || "WORKSHOP",
      status: "PUBLISHED",
      dateTime: { start: startDate, end: endDate },
      location: locationData,
      capacity: maxCapacity,
      interactivity: input.interactivity || {},
      branding: input.branding || {},
      isFreeEvent: false,
      isShortEvent: isShortEvent(durationMs),
      billing: { status: "PRE_AGREED", currency: "USD" },
      metadata: {
        timezone: input.metadata?.timezone || "UTC",
        language: input.metadata?.language || "en",
        createdAt: new Date(),
        updatedAt: new Date(),
        isEnterprise: true,
      },
      participants: [],
      tags: input.tags || [],
      categories: input.categories || [],
    });

    await event.save();

    organization.currentEventCount += 1;
    organization.eventsThisMonth += 1;
    if (organization.quotas)
      organization.quotas.eventsUsed = organization.currentEventCount;
    organization.billingHistory.push({
      action: "INVOICE_CREATED",
      description: `Enterprise event created: ${event.title} (Pre-agreed billing)`,
      amount: 0,
      date: new Date(),
      invoiceId: event._id,
      metadata: { eventSecret, eventKey, tier: "ENTERPRISE" },
    });
    if (!organization.events) organization.events = [];
    organization.events.push(event._id);
    await organization.save();

    const pdfDetails = {
      title: event.title,
      location: {
        name: event.location.name,
        address: event.location.address,
      },
      eventSecret: event.eventSecret,
      eventKey: event.eventKey,
    };

    pdfPath = await generateQrPdf(pdfDetails);

    return await event.populate("organizer organization");
  } catch (error) {
    console.error("Enterprise event creation failed:", error);
    throw new Error(
      `Failed to create enterprise event: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    if (pdfPath) {
      try {
        const fs = await import("fs/promises");
        await fs.unlink(pdfPath);
      } catch {}
    }
  }
};

// ==============================================================
// UPDATE EVENT
// ==============================================================

export const updateEvent = async (
  _: any,
  { id, input }: any,
  { user }: any,
) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(id)) throw new Error("Invalid event ID");

  const evt = await Event.findById(id);
  if (!evt) throw new Error("Event not found");

  const isOrganizer = evt.organizer.toString() === user.id;
  const evtAny = evt as any;
  const isModerator =
    evtAny.admins && Array.isArray(evtAny.admins)
      ? evtAny.admins.some((mod: Types.ObjectId) => mod.toString() === user.id)
      : false;

  if (!isOrganizer && !isModerator)
    throw new Error(
      "Unauthorized – Only organizers or admins can update events",
    );

  if (!isOrganizer && input.organizer)
    throw new Error("Only organizers can change event ownership");

  if (
    input.isFreeEvent !== undefined &&
    evtAny.isFreeEvent !== input.isFreeEvent
  ) {
    throw new Error(
      "Cannot change event type between free and standard. Please create a new event instead.",
    );
  }

  Object.assign(evt, { ...input, updatedAt: new Date() });
  await evt.save();

  return evt.populate(
    "organizer organization participants facilitators admins",
  );
};

// ==============================================================
// DELETE EVENT
// ==============================================================

export const deleteEvent = async (_: any, { id }: any, { user }: any) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(id)) throw new Error("Invalid event ID");

  const evt = await Event.findById(id);
  if (!evt) throw new Error("Event not found");

  if (evt.organizer.toString() !== user.id)
    throw new Error("Unauthorized – Only the organizer can delete this event");

  await evt.deleteOne();
  return true;
};

// ==============================================================
// JOIN EVENT
// ==============================================================

export const joinEvent = async (_: any, { eventId }: any, { user }: any) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(eventId)) throw new Error("Invalid event ID");

  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");

  const isParticipant = event.participants.some(
    (participantId: any) => participantId.toString() === user.userId.toString(),
  );

  if (isParticipant) {
    throw new Error("User is already a participant in this event");
  }

  const maxCapacity = event.capacity ?? 100;
  if (event.participants.length >= maxCapacity) {
    throw new Error("Event has reached maximum capacity");
  }

  event.participants.push(user.userId);
  await event.save();

  return event.populate("participants");
};

// ==============================================================
// LEAVE EVENT
// ==============================================================

export const leaveEvent = async (_: any, { eventId }: any, { user }: any) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(eventId)) throw new Error("Invalid event ID");

  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");

  const isParticipant = event.participants.some(
    (participantId: any) => participantId.toString() === user.userId.toString(),
  );

  if (!isParticipant) {
    throw new Error("User is not a participant in this event");
  }

  event.participants = event.participants.filter(
    (participantId: any) => participantId.toString() !== user.userId.toString(),
  );

  await event.save();

  return event.populate("participants");
};

// ==============================================================
// REGISTER FOR EVENT
// ==============================================================

export const registerForEvent = async (
  _: any,
  { eventId }: any,
  { user }: any,
) => {
  return joinEvent(_, { eventId }, { user });
};

// ==============================================================
// UNREGISTER FROM EVENT
// ==============================================================

export const unregisterFromEvent = async (
  _: any,
  { eventId }: any,
  { user }: any,
) => {
  return leaveEvent(_, { eventId }, { user });
};

// ==============================================================
// PUBLISH EVENT
// ==============================================================

export const publishEvent = async (_: any, { id }: any, { user }: any) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(id)) throw new Error("Invalid event ID");

  const event = await Event.findById(id);
  if (!event) throw new Error("Event not found");

  if (event.organizer.toString() !== user.id) {
    throw new Error("Unauthorized – Only the organizer can publish this event");
  }

  if (event.status === "CANCELLED") {
    throw new Error("Cannot publish a cancelled event");
  }

  event.status = "PUBLISHED";
  event.updatedAt = new Date();
  await event.save();

  return event;
};

// ==============================================================
// CANCEL EVENT
// ==============================================================

// Types
interface Event {
  _id: ObjectId;
  title: string;
  status: string;
  organizer: ObjectId;
  participants?: ObjectId[];
  facilitators?: ObjectId[];
  admins?: ObjectId[];
  dateTime: { start: string };
  billing?: {
    status: string;
    refundProcessed?: boolean;
    finalAmount?: number;
    originalAmount?: number;
    currency?: string;
  };
  sessionStartedAt?: Date;
  sessionEndedAt?: Date;
  sessionPausedAt?: Date;
  interactivity?: {
    allowChat?: boolean;
    allowPolls?: boolean;
    allowQnA?: boolean;
    allowFeedback?: boolean;
    liveReactions?: boolean;
    raiseHandFeature?: boolean;
  };
  metadata?: {
    updatedAt?: Date;
    cancelledAt?: Date;
    cancelledBy?: string;
    cancellationReason?: string | null;
    participantsNotified?: boolean;
    calendarIntegrations?: {
      googleCalendarId?: string;
      outlookEventId?: string;
    };
  };
}

interface UpdateSet {
  status: string;
  updatedAt: Date;
  "metadata.updatedAt": Date;
  "metadata.cancelledAt": Date;
  "metadata.cancelledBy": string;
  "metadata.cancellationReason": null;
  "metadata.participantsNotified": boolean;
  sessionEndedAt?: Date;
  sessionPausedAt?: Date | null;
  "billing.status"?: string;
  "interactivity.allowChat"?: boolean;
  "interactivity.allowPolls"?: boolean;
  "interactivity.allowQnA"?: boolean;
  "interactivity.allowFeedback"?: boolean;
  "interactivity.liveReactions"?: boolean;
  "interactivity.raiseHandFeature"?: boolean;
  [key: string]: any; // For dynamic nested fields
}

// Types
interface Event {
  _id: ObjectId;
  title: string;
  status: string;
  organizer: ObjectId;
  participants?: ObjectId[];
  facilitators?: ObjectId[];
  admins?: ObjectId[];
  dateTime: { start: string };
  billing?: {
    status: string;
    refundProcessed?: boolean;
    finalAmount?: number;
    originalAmount?: number;
    currency?: string;
  };
  sessionStartedAt?: Date;
  sessionEndedAt?: Date;
  sessionPausedAt?: Date;
  interactivity?: {
    allowChat?: boolean;
    allowPolls?: boolean;
    allowQnA?: boolean;
    allowFeedback?: boolean;
    liveReactions?: boolean;
    raiseHandFeature?: boolean;
  };
  metadata?: {
    updatedAt?: Date;
    cancelledAt?: Date;
    cancelledBy?: string;
    cancellationReason?: string | null;
    participantsNotified?: boolean;
    calendarIntegrations?: {
      googleCalendarId?: string;
      outlookEventId?: string;
    };
  };
}

interface Context {
  db: Db;
  auth: { userId: string; roles?: string[] };
  pubsub?: {
    publish: (triggerName: string, payload: any) => void;
  };
  logger: {
    info: (msg: string) => void;
    error: (msg: string, error?: unknown) => void;
  };
}

interface UpdateSet {
  status: string;
  updatedAt: Date;
  "metadata.updatedAt": Date;
  "metadata.cancelledAt": Date;
  "metadata.cancelledBy": string;
  "metadata.cancellationReason": null;
  "metadata.participantsNotified": boolean;
  sessionEndedAt?: Date;
  sessionPausedAt?: Date | null;
  "billing.status"?: string;
  "interactivity.allowChat"?: boolean;
  "interactivity.allowPolls"?: boolean;
  "interactivity.allowQnA"?: boolean;
  "interactivity.allowFeedback"?: boolean;
  "interactivity.liveReactions"?: boolean;
  "interactivity.raiseHandFeature"?: boolean;
}

export const cancelEvent = async (
  _: unknown,
  { id }: { id: string },
  { db, auth, pubsub, logger }: Context,
): Promise<boolean> => {
  // Helper: Send cancellation notifications
  async function sendCancellationNotifications(
    event: Event,
    cancelledByUserId: string,
  ): Promise<void> {
    const userIdsToNotify = new Set<string>();

    // Add participants
    event.participants?.forEach((p) => userIdsToNotify.add(p.toString()));
    event.facilitators?.forEach((f) => userIdsToNotify.add(f.toString()));
    event.admins?.forEach((a) => userIdsToNotify.add(a.toString()));

    if (event.organizer) {
      userIdsToNotify.add(event.organizer.toString());
    }

    userIdsToNotify.delete(cancelledByUserId);

    if (userIdsToNotify.size === 0) return;

    const users = await db
      .collection("users")
      .find({
        _id: { $in: Array.from(userIdsToNotify).map((id) => new ObjectId(id)) },
      })
      .toArray();

    const notification = {
      title: `Event Cancelled: ${event.title}`,
      body: `The event "${event.title}" scheduled for ${event.dateTime.start} has been cancelled.`,
      type: "EVENT_CANCELLED" as const,
      eventId: event._id.toString(),
      metadata: {
        eventTitle: event.title,
        originalStartDate: event.dateTime.start,
        cancelledAt: new Date(),
      },
      createdAt: new Date(),
    };

    const notifications = users.map((user) => ({
      ...notification,
      userId: user._id,
      isRead: false,
    }));

    if (notifications.length > 0) {
      await db.collection("notifications").insertMany(notifications);
    }

    await db
      .collection("events")
      .updateOne(
        { _id: event._id },
        { $set: { "metadata.participantsNotified": true } },
      );
  }

  // Helper: Handle refunds if needed
  async function handleRefundsIfNeeded(event: Event): Promise<void> {
    if (!event.billing || event.billing.status !== "PAID") return;
    if (event.billing.refundProcessed) return;

    const finalAmount =
      event.billing.finalAmount || event.billing.originalAmount;
    if (!finalAmount || finalAmount <= 0) return;

    try {
      const refundRecords =
        event.participants?.map((participant) => ({
          eventId: event._id,
          userId: participant,
          amount: finalAmount / (event.participants?.length || 1),
          currency: event.billing?.currency || "USD",
          status: "PROCESSING" as const,
          initiatedAt: new Date(),
          initiatedBy: event.metadata?.cancelledBy,
        })) || [];

      if (refundRecords.length > 0) {
        await db.collection("refunds").insertMany(refundRecords);
      }

      await db.collection("events").updateOne(
        { _id: event._id },
        {
          $set: {
            "billing.status": "REFUNDED",
            "billing.refundProcessed": true,
            "billing.refundedAt": new Date(),
          },
        },
      );

      logger.info(`Refunds initiated for event ${event._id}`);
    } catch (error) {
      logger.error(`Failed to process refunds for event ${event._id}:`, error);
    }
  }

  // Helper: Update calendar integrations
  async function updateCalendarIntegrations(event: Event): Promise<void> {
    if (!event.metadata?.calendarIntegrations) return;

    const { calendarIntegrations } = event.metadata;

    if (calendarIntegrations.googleCalendarId) {
      try {
        logger.info(
          `Removed event from Google Calendar: ${calendarIntegrations.googleCalendarId}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to update Google Calendar: ${errorMessage}`);
      }
    }

    if (calendarIntegrations.outlookEventId) {
      try {
        logger.info(
          `Removed event from Outlook: ${calendarIntegrations.outlookEventId}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to update Outlook Calendar: ${errorMessage}`);
      }
    }
  }

  // Helper: Log audit trail
  async function logAuditTrail(
    event: Event,
    cancelledByUserId: string,
  ): Promise<void> {
    const auditLog = {
      action: "CANCEL_EVENT" as const,
      entityType: "Event" as const,
      entityId: event._id,
      userId: new ObjectId(cancelledByUserId),
      changes: {
        previousStatus: event.status,
        newStatus: "CANCELLED",
        previousBillingStatus: event.billing?.status,
        newBillingStatus:
          event.billing?.status === "PAID" ? "REFUNDED" : "CANCELLED",
      },
      metadata: {
        eventTitle: event.title,
        eventDate: event.dateTime,
        participantCount: event.participants?.length || 0,
      },
      timestamp: new Date(),
      ipAddress: null,
      userAgent: null,
    };

    await db.collection("auditLogs").insertOne(auditLog);
    logger.info(`Audit log created for event cancellation: ${event._id}`);
  }

  // ========== MAIN RESOLVER LOGIC ==========

  // 1. Authentication
  if (!auth.userId) {
    throw new Error("Authentication required");
  }

  // 2. Fetch the event
  const event = await db.collection<Event>("events").findOne({
    _id: new ObjectId(id),
  });

  if (!event) {
    throw new Error(`Event with id ${id} not found`);
  }

  // 3. Validate cancellation eligibility
  if (event.status === "CANCELLED") {
    throw new Error("Event is already cancelled");
  }

  if (event.status === "COMPLETED") {
    throw new Error("Cannot cancel a completed event");
  }

  // 4. Check permissions
  const isOrganizer = event.organizer.toString() === auth.userId;
  const isAdmin = event.admins?.some(
    (admin) => admin.toString() === auth.userId,
  );
  const isFacilitator = event.facilitators?.some(
    (fac) => fac.toString() === auth.userId,
  );
  const isSuperAdmin = auth.roles?.includes("SUPER_ADMIN");

  if (!isOrganizer && !isAdmin && !isFacilitator && !isSuperAdmin) {
    throw new Error("You don't have permission to cancel this event");
  }

  // 5. Prepare update operations
  const updateOperations: { $set: UpdateSet } = {
    $set: {
      status: "CANCELLED",
      updatedAt: new Date(),
      "metadata.updatedAt": new Date(),
      "metadata.cancelledAt": new Date(),
      "metadata.cancelledBy": auth.userId,
      "metadata.cancellationReason": null,
      "metadata.participantsNotified": false,
    },
  };

  // 6. Handle active session if exists
  if (event.sessionStartedAt && !event.sessionEndedAt) {
    updateOperations.$set.sessionEndedAt = new Date();
    if (event.sessionPausedAt) {
      updateOperations.$set.sessionPausedAt = null;
    }
  }

  // 7. Update billing status if not already cancelled/refunded
  if (
    event.billing &&
    event.billing.status !== "CANCELLED" &&
    event.billing.status !== "REFUNDED"
  ) {
    updateOperations.$set["billing.status"] = "CANCELLED";
  }

  // 8. Disable interactivity for cancelled events
  if (event.interactivity) {
    updateOperations.$set["interactivity.allowChat"] = false;
    updateOperations.$set["interactivity.allowPolls"] = false;
    updateOperations.$set["interactivity.allowQnA"] = false;
    updateOperations.$set["interactivity.allowFeedback"] = false;
    updateOperations.$set["interactivity.liveReactions"] = false;
    updateOperations.$set["interactivity.raiseHandFeature"] = false;
  }

  // 9. Execute the update
  const result = await db
    .collection("events")
    .updateOne({ _id: new ObjectId(id) }, updateOperations);

  if (result.modifiedCount === 0) {
    logger.error(`Failed to cancel event ${id}`);
    throw new Error("Failed to cancel event");
  }

  // 10. Get updated event for side effects
  const updatedEvent = await db.collection<Event>("events").findOne({
    _id: new ObjectId(id),
  });

  if (!updatedEvent) {
    throw new Error("Event not found after update");
  }

  // 11. Side Effects (async - don't block response)
  Promise.allSettled([
    sendCancellationNotifications(updatedEvent, auth.userId),
    handleRefundsIfNeeded(updatedEvent),
    updateCalendarIntegrations(updatedEvent),
    logAuditTrail(updatedEvent, auth.userId),
    pubsub?.publish(`EVENT_CANCELLED_${id}`, {
      eventCancelled: updatedEvent,
    }),
  ]).catch((err) => {
    logger.error(`Side effects failed for event ${id}:`, err);
  });

  // 12. Return success
  return true;
};

// ==============================================================
// COMPLETE EVENT
// ==============================================================

export const completeEvent = async (_: any, { id }: any, { user }: any) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(id)) throw new Error("Invalid event ID");

  const event = await Event.findById(id);
  if (!event) throw new Error("Event not found");

  if (event.organizer.toString() !== user.id) {
    throw new Error(
      "Unauthorized – Only the organizer can complete this event",
    );
  }

  event.status = "COMPLETED";
  event.updatedAt = new Date();
  await event.save();

  return event;
};

// ==============================================================
// UPDATE EVENT ROLES
// ==============================================================

export const updateEventRoles = async (
  _: any,
  {
    input,
  }: {
    input: {
      eventId: string;
      role: string;
      add?: string[];
      remove?: string[];
    };
  },
  { user }: any,
) => {
  requireAuth(user);

  if (!Types.ObjectId.isValid(input.eventId))
    throw new Error("Invalid event ID");

  const evt = await Event.findById(input.eventId);
  if (!evt) throw new Error("Event not found");

  if (evt.organizer.toString() !== user.id) {
    throw new Error(
      "Unauthorized – Only the event organizer can modify roles.",
    );
  }

  const roleKey = input.role.toUpperCase();
  let targetArray: Types.ObjectId[] = [];
  let populateField: string = "";
  const evtAny = evt as any;

  switch (roleKey) {
    case "ADMIN":
      targetArray = evtAny.admins || [];
      populateField = "admins";
      break;
    case "FACILITATOR":
      targetArray = evtAny.facilitators || [];
      populateField = "facilitators";
      break;
    case "PARTICIPANT":
      targetArray = evtAny.participants || [];
      populateField = "participants";
      break;
    default:
      throw new Error(`Unsupported role: ${input.role}`);
  }

  let changesMade = false;

  if (input.remove && input.remove.length > 0) {
    const validRemoveIds = input.remove.filter((id: string) =>
      Types.ObjectId.isValid(id),
    );
    const isCriticalRole = roleKey === "ADMIN";
    const filteredRemoveIds = isCriticalRole
      ? validRemoveIds.filter((id: string) => evt.organizer.toString() !== id)
      : validRemoveIds;

    const initialLength = targetArray.length;
    const updatedArray = targetArray.filter(
      (id: Types.ObjectId) =>
        !filteredRemoveIds.some(
          (removeId: string) => id.toString() === removeId,
        ),
    );

    if (updatedArray.length !== initialLength) {
      evt.set(populateField, updatedArray);
      changesMade = true;
    }
  }

  if (input.add && input.add.length > 0) {
    const validAddIds = input.add.filter((id: string) =>
      Types.ObjectId.isValid(id),
    );
    const filteredAddIds = validAddIds.filter(
      (id: string) => evt.organizer.toString() !== id,
    );

    const currentArray = evt.get(populateField) as Types.ObjectId[];
    for (const newId of filteredAddIds) {
      if (
        !currentArray.some(
          (existingId: Types.ObjectId) => existingId.toString() === newId,
        )
      ) {
        currentArray.push(new Types.ObjectId(newId));
        changesMade = true;
      }
    }
    if (changesMade) {
      evt.set(populateField, currentArray);
    }
  }

  if (changesMade) await evt.save();
  return evt.populate("organizer admins facilitators participants");
};

// ==============================================================
// SESSION MANAGEMENT MUTATIONS
// ==============================================================

export const startSession = async (_: any, { eventId }: any, { user }: any) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(eventId)) throw new Error("Invalid event ID");

  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");

  const isFacilitator = event.facilitators?.some(
    (f: any) => f.toString() === user.id,
  );
  const isOrganizer = event.organizer?.toString() === user.id;

  if (!isOrganizer && !isFacilitator) {
    throw new Error(
      "Unauthorized – Only organizers and facilitators can start sessions",
    );
  }

  if (event.status !== "PUBLISHED" && event.status !== "PAUSED") {
    throw new Error(`Cannot start session from status: ${event.status}`);
  }

  event.status = "ACTIVE";
  event.sessionStartedAt = new Date();
  event.updatedAt = new Date();
  await event.save();

  return event.populate(
    "organizer organization participants facilitators admins",
  );
};

export const pauseSession = async (_: any, { eventId }: any, { user }: any) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(eventId)) throw new Error("Invalid event ID");

  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");

  const isFacilitator = event.facilitators?.some(
    (f: any) => f.toString() === user.id,
  );
  const isOrganizer = event.organizer?.toString() === user.id;

  if (!isOrganizer && !isFacilitator) {
    throw new Error(
      "Unauthorized – Only organizers and facilitators can pause sessions",
    );
  }

  if (event.status !== "ACTIVE") {
    throw new Error(`Cannot pause session from status: ${event.status}`);
  }

  event.status = "PAUSED";
  event.sessionPausedAt = new Date();
  event.updatedAt = new Date();
  await event.save();

  return event.populate(
    "organizer organization participants facilitators admins",
  );
};

export const endSession = async (_: any, { eventId }: any, { user }: any) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(eventId)) throw new Error("Invalid event ID");

  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");

  const isFacilitator = event.facilitators?.some(
    (f: any) => f.toString() === user.id,
  );
  const isOrganizer = event.organizer?.toString() === user.id;

  if (!isOrganizer && !isFacilitator) {
    throw new Error(
      "Unauthorized – Only organizers and facilitators can end sessions",
    );
  }

  if (event.status !== "ACTIVE" && event.status !== "PAUSED") {
    throw new Error(`Cannot end session from status: ${event.status}`);
  }

  event.status = "COMPLETED";
  event.sessionEndedAt = new Date();
  event.updatedAt = new Date();
  await event.save();

  return event.populate(
    "organizer organization participants facilitators admins",
  );
};

// ==============================================================
// BILLING MUTATIONS
// ==============================================================

export const generateEventInvoice = async (
  _: any,
  { eventId }: any,
  { user }: any,
) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(eventId)) throw new Error("Invalid event ID");

  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");

  if (event.organizer.toString() !== user.id) {
    throw new Error("Unauthorized – Only the organizer can generate invoices");
  }

  if (event.isFreeEvent) {
    throw new Error("Free events do not have invoices");
  }

  if (!event.billing) {
    throw new Error("Event has no billing information");
  }

  return event.billing;
};

export const markInvoiceAsPaid = async (
  _: any,
  { eventId, paymentMethod }: any,
  { user }: any,
) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(eventId)) throw new Error("Invalid event ID");

  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");

  if (event.organizer.toString() !== user.id) {
    throw new Error(
      "Unauthorized – Only the organizer can mark invoices as paid",
    );
  }

  if (!event.billing) {
    throw new Error("Event has no billing information");
  }

  event.billing.status = "PAID";
  event.billing.paidAt = new Date();
  event.billing.paymentMethod = paymentMethod;
  await event.save();

  return event;
};

// ==============================================================
// MUTATION EXPORT
// ==============================================================

export const Mutation = {
  createFreeEvent,
  createStandardEvent,
  createEnterpriseEvent,
  updateEvent,
  deleteEvent,
  joinEvent,
  leaveEvent,
  registerForEvent,
  unregisterFromEvent,
  publishEvent,
  cancelEvent,
  completeEvent,
  updateEventRoles,
  startSession,
  pauseSession,
  endSession,
  generateEventInvoice,
  markInvoiceAsPaid,
};
