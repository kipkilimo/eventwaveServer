import express, { Request, Response } from "express";
import { Event } from "../models/Event";
import { User } from "../models/User";
import { Organization } from "../models/Organization";
import { Invoice } from "../models/Invoice";
import PDFDocument from "pdfkit";
import { sendEmail } from "../utils/emailHandler";
import * as path from "path";
import * as fs from "fs";
import * as util from "util";
import QRCode from "qrcode";
import { emailFooter } from "../utils/emailFooter";

// --- 1. UTILITY SETUP ---
const router = express.Router();
const existsAsync = util.promisify(fs.exists);
const mkdirAsync = util.promisify(fs.mkdir);

// --- 2. BRANDING CONSTANTS ---
const BRAND = {
  name: "EventWave",
  primaryColor: "#007bff",
  secondaryColor: "#6c757d",
  accentColor: "#28a745",
  lightColor: "#f8f9fa",
  darkColor: "#343a40",
  logoFilename: "countysquare-4-3-21.png",
  website: "https://eventwave.dev",
  supportEmail: "info@eventwave.dev",
  phone: "+254 (700) 378-241",
  address: "Ngeno Drive, Suite 120C Langata, Nairobi 00100",
};

// --- 3. CORE UTILITY FUNCTIONS ---
const generateUniqueVoucher = async (): Promise<string> => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const existingInvoice = await Invoice.findOne({ accessVoucher: result });
  if (existingInvoice) {
    return generateUniqueVoucher();
  }
  return result;
};

const generateInvoiceNumber = (accessVoucher: string): string => {
  const date = new Date();
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  return `INV-${timestamp}-${accessVoucher}`;
};

const validateEventInput = (input: any): string[] => {
  const errors: string[] = [];

  if (!input.title?.trim()) errors.push("Event title is required");
  if (!input.dateTime?.start) errors.push("Event start time is required");
  if (!input.location?.name) errors.push("Event location name is required");

  const startDate = new Date(input.dateTime.start);
  const endDate = input.dateTime.end ? new Date(input.dateTime.end) : null;

  if (isNaN(startDate.getTime())) errors.push("Invalid start date format");
  if (endDate && isNaN(endDate.getTime()))
    errors.push("Invalid end date format");
  if (endDate && endDate <= startDate)
    errors.push("End date must be after start date");

  return errors;
};

const formatDateTime = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  return date.toLocaleString("en-US", options);
};

// --- 4. QR CODE SCAN ROUTE (NEW) ---
router.post("/redeem-from-qr", async (req: Request, res: Response) => {
  try {
    const { organizationId, facilitatorEmail } = req.body;

    // -----------------------------
    // 1. VALIDATION
    // -----------------------------
    if (!organizationId || !facilitatorEmail) {
      return res.status(400).json({
        message: "Organization ID and facilitator email are required",
      });
    }

    const email = facilitatorEmail.trim().toLowerCase();

    const [organization, facilitator] = await Promise.all([
      Organization.findById(organizationId),
      User.findOne({ email }).select("-password"),
    ]);

    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (!facilitator) {
      return res.status(404).json({ message: "Facilitator not found" });
    }

    // -----------------------------
    // 2. ENFORCE UNPAID INVOICE LIMIT (🔥 CORE CHANGE)
    // -----------------------------
    const unpaidCount = await Invoice.countDocuments({
      organization: organizationId,
      voucherRedeem: false,
    });

    if (unpaidCount >= 200) {
      return res.status(429).json({
        message:
          "Invoice limit reached (200 unpaid). Please complete payments or contact support.",
      });
    }

    // -----------------------------
    // 3. ALWAYS CREATE NEW VOUCHER
    // -----------------------------
    const accessVoucher = await generateUniqueVoucher();

    const invoice = await Invoice.create({
      organization: organizationId,
      invoiceNumber: generateInvoiceNumber(accessVoucher),
      accessVoucher,
      voucherRedeem: false,
      currency: "USD",
      amount: 0,
      status: "UNPAID",

      facilitator: facilitator._id,
      source: "QR_SCAN",
    });

    // -----------------------------
    // 4. LINK TO ORGANIZATION (important for your schema)
    // -----------------------------
    await Organization.findByIdAndUpdate(organizationId, {
      $push: {
        invoices: invoice._id,
        billingHistory: {
          action: "INVOICE_CREATED",
          description: "Invoice generated via QR scan",
          amount: 0,
          date: new Date(),
          invoiceId: invoice._id,
          metadata: { source: "QR_SCAN" },
        },
      },
    });

    // -----------------------------
    // 5. RESPONSE
    // -----------------------------
    return res.json({
      message: "QR verified. Voucher created successfully.",

      organization: {
        id: organization._id,
        name: organization.name,
        email: organization.email,
      },

      facilitator: {
        id: facilitator._id,
        name: facilitator.name,
        email: facilitator.email,
      },

      invoice: {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        accessVoucher: invoice.accessVoucher,
        currency: invoice.currency,
        status: invoice.status,
      },
    });
  } catch (error: any) {
    console.error("QR redeem error:", error);

    return res.status(500).json({
      message: "Failed to process QR code",
      ...(process.env.NODE_ENV === "development" && {
        error: error.message,
      }),
    });
  }
});

// --- 5. REDEEM VOUCHER ROUTE (PRESERVED) ---
router.post("/redeem-voucher", async (req: Request, res: Response) => {
  try {
    const { facilitatorEmail, accessVoucher } = req.body;

    if (!facilitatorEmail?.trim() || !accessVoucher?.trim()) {
      return res
        .status(400)
        .json({ message: "Facilitator email and voucher code required." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(facilitatorEmail)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    const voucherCode = accessVoucher.trim().toUpperCase();
    const invoice = await Invoice.findOne({
      accessVoucher: voucherCode,
    }).populate("organization");

    if (!invoice) {
      return res.status(404).json({ message: "Invalid voucher code." });
    }

    if (invoice.voucherRedeem) {
      return res.status(400).json({ message: "Voucher already redeemed." });
    }

    if (!invoice.organization || !invoice.organization._id) {
      return res
        .status(500)
        .json({ message: "Invoice organization linkage invalid." });
    }

    const org = await Organization.findOne({
      _id: invoice.organization,
    }).select("id name email");
    if (!org) {
      return res
        .status(500)
        .json({ message: "Organization record not found." });
    }

    const facilitator = await User.findOne({
      email: facilitatorEmail.trim().toLowerCase(),
    }).select("-password");
    if (!facilitator) {
      return res.status(404).json({ message: "Facilitator not found." });
    }

    return res.json({
      message: "Voucher validated successfully. Proceed to event creation.",
      invoice: {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        accessVoucher: invoice.accessVoucher,
        currency: invoice.currency,
      },
      organization: org,
      facilitator: {
        id: facilitator._id,
        name: facilitator.name,
        email: facilitator.email,
      },
    });
  } catch (error: any) {
    console.error("Voucher redemption error:", error);
    return res.status(500).json({
      message: "Service temporarily unavailable. Please try again.",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    });
  }
});

// --- 6. CREATE EVENT WITH VOUCHER (OPTIMIZED & ALIGNED) ---
router.post("/create-with-voucher", async (req: Request, res: Response) => {
  let pdfPath: string | null = null;

  try {
    const { invoiceId, eventData, facilitatorId } = req.body;

    if (!invoiceId || !eventData || !facilitatorId) {
      return res.status(400).json({
        message:
          "Missing required fields (invoiceId, eventData, facilitatorId).",
      });
    }

    const inputErrors = validateEventInput(eventData);
    if (inputErrors.length > 0) {
      return res
        .status(400)
        .json({ message: "Invalid event data fields.", errors: inputErrors });
    }

    // Fetch invoice and organization
    const invoice = await Invoice.findById(invoiceId).populate("organization");
    if (!invoice)
      return res.status(404).json({ message: "Invoice not found." });
    if (invoice.voucherRedeem)
      return res.status(400).json({ message: "Voucher already used." });

    if (!invoice.organization || !invoice.organization._id) {
      return res
        .status(500)
        .json({ message: "Invoice organization linkage invalid." });
    }

    const org = await Organization.findById(invoice.organization._id);
    if (!org)
      return res.status(500).json({ message: "Organization not found." });

    const facilitator = await User.findById(facilitatorId);
    if (!facilitator)
      return res.status(404).json({ message: "Facilitator user not found." });

    // Calculate pricing & duration
    const startDate = new Date(eventData.dateTime.start);
    const endDate = new Date(eventData.dateTime.end);
    const durationMs = endDate.getTime() - startDate.getTime();
    const days = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));
    const rate = Number(process.env.PRO_DAILY_RATE) || 4;
    const originalAmount = days * rate;
    const discountAmount = originalAmount * 0.2;
    const finalAmount = originalAmount - discountAmount;

    // Create event (ALIGNED WITH GRAPHQL SDL)
    const event = await Event.create({
      title: eventData.title.trim(),
      description: eventData.description?.trim() || "",
      eventSecret: invoice.accessVoucher,

      organizer: facilitatorId,
      organization: org._id,

      eventType: (eventData.eventType?.toUpperCase() as string) || "WORKSHOP",
      status: "PUBLISHED",

      dateTime: {
        start: startDate,
        end: endDate,
      },

      location: {
        name: eventData.location.name,
        address: eventData.location.address || org.name,
        virtualLink: eventData.location.virtualLink || null,
        isVirtual: eventData.location.isVirtual ?? false,
      },

      capacity: {
        maxParticipants: eventData.capacity?.maxParticipants || 25,
        currentParticipants: 0,
        waitlist: [],
        isFull: false,
      },

      interactivity: {
        allowChat: eventData.interactivity?.allowChat ?? true,
        allowPrivateMessages:
          eventData.interactivity?.allowPrivateMessages ?? true,
        sessionChatChannels:
          eventData.interactivity?.sessionChatChannels ?? false,
        chatModeration: eventData.interactivity?.chatModeration ?? false,
        allowPolls: eventData.interactivity?.allowPolls ?? true,
        allowQnA: eventData.interactivity?.allowQnA ?? true,
        allowFeedback: eventData.interactivity?.allowFeedback ?? true,
        allowMediaSharing: eventData.interactivity?.allowMediaSharing ?? true,
        maxMediaSize: eventData.interactivity?.maxMediaSize ?? 50_000_000,
        allowScreenSharing:
          eventData.interactivity?.allowScreenSharing ?? false,
        allowBreakoutRooms: eventData.interactivity?.allowBreakoutRooms ?? true,
        allowWhiteboard: eventData.interactivity?.allowWhiteboard ?? true,
        allowCollaborativeNotes:
          eventData.interactivity?.allowCollaborativeNotes ?? false,
        liveReactions: eventData.interactivity?.liveReactions ?? true,
        raiseHandFeature: eventData.interactivity?.raiseHandFeature ?? true,
        liveTranslation: eventData.interactivity?.liveTranslation ?? false,
      },

      branding: eventData.branding || {},

      participants: [],
      facilitators: [facilitatorId],
      admins: [],

      isFreeEvent: false,
      isShortEvent: days === 1,

      eventDuration: {
        milliseconds: durationMs,
        hours: durationMs / (1000 * 60 * 60),
        minutes: durationMs / (1000 * 60),
        days,
      },

      billing: {
        invoiceNumber: generateInvoiceNumber(invoice.accessVoucher),
        dailyRate: rate,
        days,
        originalAmount,
        discountAmount,
        finalAmount,
        currency: invoice.currency || "USD",
        status: "PENDING",
      },

      tags: eventData.tags || [],
      categories: eventData.categories || [],

      metadata: {
        timezone: eventData.metadata?.timezone || "UTC",
        language: eventData.metadata?.language || "en",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: facilitatorId,
      },
    });

    // Update invoice
    invoice.event = event._id;
    invoice.amount = finalAmount;
    invoice.invoiceNumber = generateInvoiceNumber(invoice.accessVoucher);
    invoice.voucherRedeem = true;
    invoice.status = "UNPAID";
    await invoice.save();

    // Update organization
    await Organization.findByIdAndUpdate(org._id, {
      $push: { events: event._id },
      $addToSet: { facilitators: facilitatorId },
    });

    // Update facilitator
    if (!facilitator.events) facilitator.events = [];
    facilitator.events.push(event._id);
    if (facilitator.role === "PARTICIPANT") {
      facilitator.role = "FACILITATOR";
    }
    await facilitator.save();

    // Generate PDF
    // --- TYPE-SAFE PDF DETAILS INTERFACE ---
    interface EventDetailsForPdf {
      title: string;
      location: {
        name: string;
        address: string;
      };
      eventSecret: string;
      dateTime: {
        start: Date;
        end: Date;
      };
    }

    // --- FIXED: Use correct location.name instead of venue ---
    const pdfDetails: EventDetailsForPdf = {
      title: event.title,
      location: {
        name: event.location.name, //
        address: event.location.address,
      },
      eventSecret: event.eventSecret || "",
      dateTime: {
        start: startDate,
        end: endDate,
      },
    };

    // Type-safe function call with validation
    pdfPath = await generateProfessionalQrPdf(pdfDetails);

    // Helper function for slug
    const slugifyTitle = (title: string): string => {
      return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    };

    // Send emails
    const emailBody = createEventSummaryEmail(
      event,
      org,
      invoice,
      originalAmount,
      discountAmount,
      finalAmount,
    );

    const attachments = [
      {
        filename: `${event.eventSecret}-${slugifyTitle(event.title)}.pdf`,
        path: pdfPath,
      },
    ];

    const facilitatorEmail = facilitator.email || eventData.facilitatorEmail;

    await Promise.allSettled([
      sendEmail(
        String(org.email),
        `🎯 Event Confirmation: ${event.title} - ${BRAND.name}`,
        emailBody,
        attachments,
      ),
      sendEmail(
        facilitatorEmail,
        `✅ Your Event is Live: ${event.title} - ${BRAND.name}`,
        emailBody,
        attachments,
      ),
    ]);

    return res.json({
      message: "Event created successfully!",
      event, // Returns full event object matching GraphQL SDL
    });
  } catch (error: any) {
    console.error("Event creation error:", error);

    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch (cleanupError) {
        console.error("Failed to clean up PDF:", cleanupError);
      }
    }

    return res.status(500).json({
      message: "Failed to create event. Please try again or contact support.",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    });
  }
});

// --- 7. PDF GENERATOR (PRESERVED WITH FIXES) ---
interface EventDetailsForPdf {
  title: string;
  location: {
    name: string;
    address: string;
  };
  eventSecret: string;
  dateTime: {
    start: Date;
    end: Date;
  };
}

async function generateProfessionalQrPdf(
  eventData: EventDetailsForPdf,
  logoFilename: string = BRAND.logoFilename,
): Promise<string> {
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? `${process.env.CLIENT_URL}/login`
      : `${process.env.CLIENT_DEV_URL}/login`;

  const qrUrl = `${baseUrl}?eventSecret=${eventData.eventSecret}`;
  const tmpDir = path.join(__dirname, "tmp");
  const pdfPath = path.join(
    tmpDir,
    `${eventData.eventSecret}-event-access.pdf`,
  );
  const logoPath = path.join(__dirname, logoFilename);

  // Ensure clean temp dir
  if (await existsAsync(tmpDir)) {
    const files = await fs.promises.readdir(tmpDir);
    for (const f of files) {
      await fs.promises.rm(path.join(tmpDir, f), {
        force: true,
        recursive: true,
      });
    }
  } else {
    await mkdirAsync(tmpDir, { recursive: true });
  }

  try {
    // Generate QR
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 800,
      color: {
        dark: BRAND.darkColor,
        light: "#FFFFFF",
      },
    });

    const qrBuffer = Buffer.from(
      qrDataUrl.replace(/^data:image\/png;base64,/, ""),
      "base64",
    );

    // PDF setup
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      info: {
        Title: `Event Access - ${eventData.title}`,
        Author: BRAND.name,
        Subject: "Event QR Code Access",
        Keywords: "event,access,qr,checkin",
        Creator: BRAND.name,
        Producer: BRAND.name,
      },
    });

    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    const streamClosed = new Promise<void>((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    // Header logo
    if (await existsAsync(logoPath)) {
      doc.image(logoPath, doc.page.margins.left, doc.page.margins.top, {
        width: 120,
      });
    }

    // Title
    const shortTitle =
      eventData.title.length > 26
        ? `${eventData.title.slice(0, 26)}..`
        : eventData.title;

    doc.moveDown(1.5);
    doc
      .fillColor(BRAND.primaryColor)
      .font("Helvetica-Bold")
      .fontSize(28)
      .text(shortTitle.toUpperCase(), {
        align: "center",
        underline: true,
      });

    doc
      .fillColor(BRAND.secondaryColor)
      .font("Helvetica")
      .fontSize(14)
      .text("EVENT ACCESS TOKEN", { align: "center" })
      .moveDown(1);

    // Event details
    doc
      .fillColor(BRAND.darkColor)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("EVENT DETAILS", { underline: true })
      .moveDown(0.5);

    doc
      .font("Helvetica")
      .fontSize(12)
      .text(`Start: ${formatDateTime(new Date(eventData.dateTime.start))}`)
      .text(`End:   ${formatDateTime(new Date(eventData.dateTime.end))}`)
      .moveDown(0.5)
      .text(eventData.location.name)
      .text(eventData.location.address)
      .moveDown(1);

    // QR positioning
    const qrSize = 280;
    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const qrX = doc.page.margins.left + (pageWidth - qrSize) / 2;
    const qrY = doc.y + 20;

    // QR background card
    doc.save();
    doc
      .roundedRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 8)
      .fillColor("#f8f9fa")
      .fill();
    doc.restore();

    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    // Logo overlay
    if (await existsAsync(logoPath)) {
      const logoSize = qrSize * 0.22;
      const borderWidth = 2;
      const ringGap = 3;

      const centerX = qrX + qrSize / 2;
      const centerY = qrY + qrSize / 2;

      // White separation ring
      doc.save();
      doc
        .circle(centerX, centerY, logoSize / 2 + borderWidth + ringGap)
        .fillColor("#FFFFFF")
        .fill();
      doc.restore();

      // Black border
      doc.save();
      doc
        .circle(centerX, centerY, logoSize / 2 + borderWidth)
        .fillColor("#000000")
        .fill();
      doc.restore();

      // Logo clipped inside
      doc.save();
      doc.circle(centerX, centerY, logoSize / 2).clip();
      doc.image(logoPath, centerX - logoSize / 2, centerY - logoSize / 2, {
        width: logoSize,
        height: logoSize,
      });
      doc.restore();
    }

    // Call to action
    const qrDirectUrl = `${baseUrl}?eventSecret=${eventData.eventSecret}`;
    doc.y = qrY + qrSize + 25;

    doc
      .fillColor(BRAND.primaryColor)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("SCAN TO JOIN EVENT", { align: "center" });

    doc
      .fillColor(BRAND.secondaryColor)
      .font("Helvetica")
      .fontSize(12)
      .text(`Event Key: ${eventData.eventSecret} | URL: ${qrDirectUrl}`, {
        align: "center",
      })
      .moveDown(1);

    // Instructions
    const LOGIN_URL = "https://eventwave.dev/login";

    doc
      .fillColor(BRAND.darkColor)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("HOW TO USE THIS PASS:", { underline: true })
      .moveDown(0.3);

    doc.font("Helvetica").fontSize(10);

    [
      "Scan the QR code",
      `Follow the output link or login at: ${LOGIN_URL}`,
    ].forEach((step, i) => {
      doc
        .fillColor(BRAND.darkColor)
        .text(`${i + 1}. `, { continued: true })
        .fillColor(BRAND.secondaryColor)
        .text(step, { indent: 15 });
    });

    // Footer
    const footerY = doc.page.height - 60;

    doc
      .moveTo(doc.page.margins.left, footerY - 10)
      .lineTo(doc.page.width - doc.page.margins.right, footerY - 10)
      .strokeColor("#dee2e6")
      .lineWidth(1)
      .stroke();

    doc.y = footerY;
    doc
      .fillColor(BRAND.secondaryColor)
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text(`${BRAND.name} • Get the most out of your events`, {
        align: "center",
      });

    doc.end();
    await streamClosed;

    return pdfPath;
  } catch (error) {
    console.error("Error during PDF generation:", error);
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    throw new Error("Failed to generate the event access PDF.");
  }
}

// --- 8. EMAIL TEMPLATE (PRESERVED) ---
const createEventSummaryEmail = (
  event: any,
  organization: any,
  invoice: any,
  originalAmount: number,
  discountAmount: number,
  finalAmount: number,
) => {
  const start = new Date(event.dateTime.start);
  const end = new Date(event.dateTime.end);
  const durationDays = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );

  const shortTitle =
    event.title.length > 26 ? event.title.slice(0, 26) + "..." : event.title;

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${event.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      line-height: 1.4;
      color: #334155;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }

    .email-header {
      background: ${BRAND.primaryColor};
      padding: 20px;
      text-align: center;
      color: white;
    }
    .email-header h1 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .badge {
      background: #10b981;
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      display: inline-block;
    }

    .email-content { padding: 20px; }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: ${BRAND.primaryColor};
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }

    .event-table {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .table-cell {
      background: #f8fafc;
      border-radius: 4px;
      padding: 12px;
      border-left: 3px solid ${BRAND.primaryColor};
    }
    .cell-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .cell-value {
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
    }

    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 13px;
    }
    .invoice-table th {
      text-align: left;
      padding: 10px;
      background: #f1f5f9;
      color: #475569;
      font-weight: 600;
    }
    .invoice-table td {
      padding: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .invoice-table .total-row {
      background: #eff6ff;
      font-weight: 700;
      color: ${BRAND.primaryColor};
    }
    .invoice-table .discount-row {
      color: #10b981;
      font-weight: 600;
    }

    .invoice-info {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      background: #f8fafc;
      padding: 12px;
      border-radius: 4px;
      margin: 12px 0;
      font-size: 12px;
    }
    .info-item { text-align: center; }
    .info-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .info-value {
      font-weight: 600;
      color: #1e293b;
    }

    .cta-button {
      display: block;
      width: 100%;
      background: ${BRAND.primaryColor};
      color: white;
      padding: 12px;
      text-decoration: none;
      border-radius: 4px;
      font-weight: 600;
      text-align: center;
      margin: 16px 0;
    }

    .email-footer {
      background: #1e293b;
      color: #cbd5e1;
      padding: 20px;
      text-align: center;
      font-size: 11px;
    }

    @media (max-width: 480px) {
      .event-table { grid-template-columns: 1fr; }
      .invoice-info { grid-template-columns: 1fr; }
    }
  </style>
</head>

<body>
  <div class="email-container">
    <div class="email-header">
      <h1 title="${event.title}">${shortTitle}</h1>
      <div class="badge">REF: ${event.eventSecret}</div>
    </div>

    <div class="email-content">
      <div class="section-title">Event Details</div>
      <div class="event-table">
        <div class="table-cell">
          <div class="cell-label">Event Title</div>
          <div class="cell-value">${event.title}</div>
        </div>
        <div class="table-cell">
          <div class="cell-label">Organization</div>
          <div class="cell-value">${organization.name}</div>
        </div>
        <div class="table-cell">
          <div class="cell-label">Event Type</div>
          <div class="cell-value">${event.eventType}</div>
        </div>
        <div class="table-cell">
          <div class="cell-label">Location</div>
          <div class="cell-value">${event.location.name}</div>
        </div>
        <div class="table-cell">
          <div class="cell-label">Date & Time</div>
          <div class="cell-value">${formatDateTime(start)}</div>
        </div>
        <div class="table-cell">
          <div class="cell-label">Duration</div>
          <div class="cell-value">${durationDays} day${
            durationDays > 1 ? "s" : ""
          }</div>
        </div>
      </div>

      <div style="text-align:center;margin:20px 0;">
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; text-align: center;">
          <p style="margin: 0 0 10px 0; font-family: sans-serif; color: #64748b; font-size: 14px;">
            Copy the event key below:
          </p>
          <div style="
            display: inline-block;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: 2px;
            color: #1e293b;
            background-color: #dcfce7;
            padding: 8px 16px;
            border-radius: 8px;
            border: 2px dashed #22c55e;
            font-family: monospace;
            cursor: text;
            user-select: all;
          ">
            ${event.eventSecret}
          </div>
        </div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;">
          PASTE IN THE LOGIN PAGE
        </div>
      </div>

      <div class="section-title">Check-in Instructions</div>
      <ol style="font-size:13px;color:#334155;padding-left:18px;">
        <li>Scan the QR code</li>
        <li>
          Follow the output link or paste this URL to login:<br />
          <span style="font-size:11px;color:#475569;">
            ${BRAND.website}/login
          </span>
        </li>
      </ol>

      <div class="section-title" style="margin-top:16px;">Billing Summary</div>
      <table class="invoice-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Platform Access</td>
            <td>${durationDays} day${durationDays > 1 ? "s" : ""}</td>
            <td>${formatCurrency(Number(process.env.PRO_DAILY_RATE) || 4, invoice.currency)}</td>
            <td>${formatCurrency(originalAmount, invoice.currency)}</td>
          </tr>
          <tr class="discount-row">
            <td colspan="3">Promotion Discount (20%)</td>
            <td>-${formatCurrency(discountAmount, invoice.currency)}</td>
          </tr>
          <tr class="total-row">
            <td colspan="3">TOTAL DUE</td>
            <td>${formatCurrency(finalAmount, invoice.currency)}</td>
          </tr>
        </tbody>
      </table>

      <a
        href="${BRAND.website}/dashboard?event=${event.eventSecret}"
        class="cta-button"
      >
        📊 Access Event Dashboard
      </a>
    </div>

    ${emailFooter}
  </div>
</body>
</html>
`.trim();
};

export default router;
