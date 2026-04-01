// src/graphql/resolvers/event/mutations.ts
import { Types } from "mongoose";
import { Event } from "../../../models/Event";
import { User } from "../../../models/User";
import { Organization } from "../../../models/Organization";
import { requireAuth } from "../../../utils/auth";
import { sendEmail } from "../../../utils/emailHandler";
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
import { emailFooter } from "../../../utils/emailFooter";

import { emailHeader } from "../../../utils/emailHeader";

// Color theme from your design system
const theme = {
  dark: false,
  colors: {
    primary: "#2A73C5",
    "primary-darken-1": "#2363A9",
    "primary-lighten-1": "#4A8ED4",
    secondary: "#5E60CE",
    accent: "#3D8BFF",
    success: "#2EBD85",
    warning: "#F4B740",
    error: "#E05658",
    info: "#3AB0FF",
    background: "#F5F7FA",
    surface: "#FFFFFF",
  },
};

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
      [{ filename: `${event.eventSecret}-qr-access.pdf`, path: pdfPath }],
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
    function formatEventRange(range: string): string {
      const [startStr, endStr] = range.split(" - ").map((s) => s.trim());

      const start = new Date(startStr);
      const end = new Date(endStr);

      const sameDay =
        start.getFullYear() === end.getFullYear() &&
        start.getMonth() === end.getMonth() &&
        start.getDate() === end.getDate();

      const formatDateWithDay = (d: Date) =>
        `${d.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}`;

      const formatDate = (d: Date) =>
        `${d.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}`;

      const formatTime = (d: Date) =>
        d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

      if (sameDay) {
        return `${formatDateWithDay(start)} ${formatTime(start)} to ${formatTime(end)}`;
      }

      return `${formatDate(start)} ${formatTime(start)} to ${formatDate(end)} ${formatTime(end)}`;
    }
    const planConfig = getPlanConfig(resolveEventPlan(event));
    const styledFooter = emailFooter.replace(
      'style="font-family: Arial, sans-serif; background-color: #f4f5f7; padding: 20px; text-align: center; color: #6c757d; font-size: 12px;"',
      `style="background-color:${theme.colors.background}; padding:16px; text-align:center; color:#7f8c8d; font-size:12px; border-top:1px solid #e9ecef;"`,
    );
    // Extract color constants
    const backgroundColor = theme.colors.background;
    const surfaceColor = theme.colors.surface;
    const primaryColor = theme.colors.primary;
    const secondaryColor = theme.colors.secondary;
    const successColor = theme.colors.success;
    const warningColor = theme.colors.warning;
    const errorColor = theme.colors.error;
    const textColor = "#1A2C3E";
    const textMuted = "#6C757D";

    // Authentication email template
    const emailBody = `
<div style="margin:0; padding:0; background-color: ${backgroundColor};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${backgroundColor}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
    <tr>
      <td align="center" style="padding: 16px;">
        
        <!-- Main Container: identical max-width, background, border-radius, overflow to auth container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: ${surfaceColor}; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          
          <!-- Header (dynamic from emailHeader) - same as auth template -->
          <tr>
            <td>
              ${emailHeader}
            </td>
          </tr>

          <!-- Event Hero / Gradient Banner (custom for notification but using theme colors) -->
          <tr>
            <td style="background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor}); padding: 20px 24px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 700; letter-spacing: -0.2px;">
                ${event.title}
              </h1>
              <div style="margin-top: 10px; display: inline-block; padding: 4px 14px; border-radius: 30px; background: rgba(255,255,255,0.2); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                ${planConfig.label}
              </div>
            </td>
          </tr>

          <!-- Main Content Area: uses same padding as auth email (24px 16px) -->
          <tr>
            <td style="padding: 24px 16px;">
              
              <!-- Event Secret Section (styled like auth security block but light version) -->
              <div style="margin-bottom: 20px;">
                <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 500; color: ${textMuted}; letter-spacing: 0.3px;">Event Secret</p>
                <div style="background-color: ${backgroundColor}; padding: 8px 12px; border-radius: 8px; border: 1px solid #e9ecef; display: inline-block;">
                  <span style="font-family: monospace; font-size: 13px; color: ${primaryColor}; font-weight: 500;">${event.eventSecret}</span>
                </div>
              </div>
              
              <!-- Date & Time -->
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 500; color: ${textMuted};">Date & Time</p>
              <p style="margin: 0 0 18px 0; font-size: 14px; color: ${textColor}; line-height: 1.4;">
                ${formatEventRange(event.dateTime.start.toISOString() + " - " + event.dateTime.end.toISOString())}
              </p>
              
              <!-- Location -->
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 500; color: ${textMuted};">Location</p>
              <p style="margin: 0 0 18px 0; font-size: 14px; color: ${textColor};">
                ${locationData.name}<br/>
                <span style="font-size: 12px; color: ${textMuted};">${locationData.address}</span>
              </p>
              
              <!-- Organization -->
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 500; color: ${textMuted};">Organization</p>
              <p style="margin: 0 0 18px 0; font-size: 14px; color: ${textColor};">
                ${organization.name}
              </p>
              
              <!-- Status (with badge style that matches auth subtle styles) -->
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 500; color: ${textMuted};">Status</p>
              <p style="margin: 0 0 18px 0; font-size: 14px; color: ${textColor};">
                <span style="background: #e6f4ea; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; color: #1e7b48;">Active</span>
                ${planConfig.statusSuffix}
              </p>
              
              <!-- Billing -->
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 500; color: ${textMuted};">Billing</p>
              <p style="margin: 0 0 18px 0; font-size: 14px; color: ${textColor};">
                ${planConfig.billing}
              </p>
              
              <!-- NOTE: styled exactly like the security notice box in auth template (background, border-left, padding, rounded) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 18px;">
                <tr>
                  <td style="background-color: ${backgroundColor}; padding: 14px; border-radius: 8px; border-left: 4px solid ${primaryColor};">
                    <p style="margin: 0; font-size: 13px; color: ${textColor}; line-height: 1.4;">
                      <strong>📌 Note:</strong> ${planConfig.note}
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- QR Highlight: matches similar info block style with background and border, like fallback URL style -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 8px;">
                <tr>
                  <td style="background-color: ${backgroundColor}; padding: 14px; border-radius: 8px; border: 1px solid #e9ecef;">
                    <p style="margin: 0; font-size: 13px; color: ${textColor};">
                      <strong>📱 QR Code Attached</strong><br/>
                      Use the QR code for seamless event check-in.
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Optional divider to match auth email divider style (height, background, margin) -->
              <div style="height: 1px; background-color: #e9ecef; margin: 24px 0 16px 0;"></div>
              
              <!-- Additional info: same muted text as footer note in auth -->
              <p style="margin: 0; font-size: 12px; color: ${textMuted}; text-align: center;">
                This is a notification regarding your event "${event.title}". If you have any questions, contact support.
              </p>
            
            </td>
          </tr>
          
          <!-- Footer: using same approach as auth template (dynamic emailFooter but styled with theme) -->
          <tr>
            <td>
              ${styledFooter}
            </td>
          </tr>
        
        </table> <!-- end container -->
      
      </td>
    </tr>
  </table>
</div>
`;

    await sendEmail(
      thisUser.email,
      `🎉 Enterprise Event Created - ${event.title}`,
      emailBody,
      [
        {
          filename: `${event.title}-${event.eventSecret}-qr-access.pdf`,
          path: pdfPath,
        },
      ],
    );

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

export const cancelEvent = async (_: any, { id }: any, { user }: any) => {
  requireAuth(user);
  if (!Types.ObjectId.isValid(id)) throw new Error("Invalid event ID");

  const event = await Event.findById(id);
  if (!event) throw new Error("Event not found");

  if (event.organizer.toString() !== user.id) {
    throw new Error("Unauthorized – Only the organizer can cancel this event");
  }

  event.status = "CANCELLED";
  event.updatedAt = new Date();
  await event.save();

  return event;
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
