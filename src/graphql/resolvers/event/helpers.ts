// -------------------------------------
// src/graphql/resolvers/event/helpers.ts
// -------------------------------------

import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { promises as fsPromises } from "fs";
import { emailFooter } from "../../../utils/emailFooter";
import { emailHeader } from "../../../utils/emailHeader";

const DAILY_RATE = 5.65;

// -------------------------------------
// Paths (SAFE across dev + prod)
// -------------------------------------
const ROOT_DIR = process.cwd();
const TMP_DIR = path.join(ROOT_DIR, "tmp");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");

// -------------------------------------
// Types
// -------------------------------------
interface EventDetailsForPdf {
  title: string;
  location: { name: string; address: string };
  eventSecret: string;
  eventKey: string;
}

interface InvoiceData {
  invoiceNumber: string;
  status: string;
  currency: string;
  amount: number;
  dailyRate: number;
  days: number;
  discountAmount: number;
  originalAmount: number;
  finalAmount?: number;
}

// -------------------------------------
// Utilities
// -------------------------------------
const ensureDir = async (dir: string) => {
  await fsPromises.mkdir(dir, { recursive: true });
};

const fileExists = async (p: string) => {
  try {
    await fsPromises.access(p);
    return true;
  } catch {
    return false;
  }
};

// -------------------------------------
// Human-friendly date range
// -------------------------------------
export function formatEventRange(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();

  const formatDate = (d: Date, withDay = false) =>
    d.toLocaleDateString("en-US", {
      weekday: withDay ? "long" : undefined,
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  return sameDay
    ? `${formatDate(start, true)} ${formatTime(start)} to ${formatTime(end)}`
    : `${formatDate(start)} ${formatTime(start)} to ${formatDate(end)} ${formatTime(end)}`;
}

// -------------------------------------
// QR PDF generator (enhanced styling)
// -------------------------------------
// -------------------------------------
// QR PDF generator (WhatsApp-style)
// -------------------------------------
export async function generateQrPdf(
  eventData: EventDetailsForPdf,
  logoFilename = "countysquare-4-3-21.png",
): Promise<string> {
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? "https://eventwave.dev/login"
      : "http://localhost:5173/login";

  const qrUrl = `${baseUrl}?eventSecret=${eventData.eventSecret}`;
  const pdfPath = path.join(TMP_DIR, `${eventData.eventSecret}-qr.pdf`);
  const logoPath = path.join(ASSETS_DIR, logoFilename);

  await ensureDir(TMP_DIR);

  try {
    // -------------------------
    // Generate QR
    // -------------------------
    const qrBuffer = await QRCode.toBuffer(qrUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 750,
    });

    // -------------------------
    // Setup PDF
    // -------------------------
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const done = new Promise<void>((res, rej) => {
      stream.on("finish", res);
      stream.on("error", rej);
    });

    // -------------------------
    // Header
    // -------------------------
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .text(eventData.title, { align: "center" });

    doc.moveDown(0.5);

    doc
      .font("Helvetica")
      .fontSize(14)
      .text(eventData.location.name, { align: "center" })
      .text(eventData.location.address, { align: "center" });

    doc.moveDown(1);

    doc.fontSize(10).text(qrUrl, { align: "center" });

    doc.moveDown(1.5);

    // -------------------------
    // QR placement (25% larger)
    // -------------------------
    const qrSize = 325;
    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const qrX = doc.page.margins.left + (pageWidth - qrSize) / 2;
    const qrY = doc.y;

    doc.image(qrBuffer, qrX, qrY, { width: qrSize });

    // -------------------------
    // WhatsApp-style Logo overlay
    // (Logo centered with rings)
    // -------------------------
    if (await fileExists(logoPath)) {
      const centerX = qrX + qrSize / 2;
      const centerY = qrY + qrSize / 2;

      // Logo size (20% of QR)
      const logoSize = qrSize * 0.2;
      const logoX = centerX - logoSize / 2;
      const logoY = centerY - logoSize / 2;
      const baseRadius = logoSize / 2;
      // Ring thicknesses (WhatsApp style)
      const outerThickness = logoSize * 0.06; // Reduced by 50% (was 0.12)
      const whiteThickness = logoSize * 0.045; // Thin white ring
      const innerThickness = logoSize * 0.045; // Thin inner ring

      // White background for clean ring separation
      doc
        .save()
        .circle(centerX, centerY, baseRadius + outerThickness + 2)
        .fill("#FFFFFF")
        .restore();

      // Outer ring (thick black)
      doc
        .save()
        .circle(centerX, centerY, baseRadius + outerThickness / 2)
        .lineWidth(outerThickness)
        .stroke("#000000")
        .restore();

      // Middle ring (thin white)
      doc
        .save()
        .circle(
          centerX,
          centerY,
          baseRadius - outerThickness / 2 + whiteThickness / 2,
        )
        .lineWidth(whiteThickness)
        .stroke("#FFFFFF")
        .restore();

      // Inner ring (thin black)
      doc
        .save()
        .circle(
          centerX,
          centerY,
          baseRadius - outerThickness / 2 - whiteThickness + innerThickness / 2,
        )
        .lineWidth(innerThickness)
        .stroke("#000000")
        .restore();

      // Logo (clipped circle)
      doc.save();
      doc.circle(centerX, centerY, baseRadius - 2).clip();
      doc.image(logoPath, logoX, logoY, {
        width: logoSize,
        height: logoSize,
      });
      doc.restore();
    } else {
      console.warn("Logo not found:", logoPath);
    }

    const ASSETS_DIR = path.join(ROOT_DIR, "assets");
    // -------------------------
    // Footer (Centered)
    // -------------------------
    doc.y = qrY + qrSize + 35;

    // Main text - SCAN HERE TO CHECK IN

    const fontPath1 = path.join(ASSETS_DIR, "NotoSans-Regular.ttf");

    doc.registerFont("NotoSans", fontPath1);

    // Main text - SCAN HERE TO CHECK IN
    doc.font("NotoSans").fontSize(18).text("SCAN ⬆ TO CHECK IN", {
      align: "center",
      lineGap: 5,
    });

    doc.moveDown(0.5);

    const fontPath = path.join(ASSETS_DIR, "JetBrainsMono-Bold.ttf");

    doc.registerFont("Mono-Bold", fontPath);

    doc
      .font("Mono-Bold")
      .fontSize(16)
      .text(`Event ID: ${eventData.eventSecret}`, {
        align: "center",
      });

    doc.end();
    await done;

    return pdfPath;
  } catch (err) {
    console.error("QR PDF generation failed:", err);

    if (await fileExists(pdfPath)) {
      await fsPromises.unlink(pdfPath);
    }

    throw new Error("Failed to generate QR PDF");
  }
}
// -------------------------------------
// Event Summary Email
// -------------------------------------
// Event Summary Email Template using Auth Email Formatting
export const createEventSummaryEmail = (
  event: any,
  organization: any,
  invoice: InvoiceData | null,
  isFreeEvent: boolean = false,
) => {
  // Helper function to format date range (updated to handle Date objects directly)
  const formatEventRange = (startDate: Date, endDate: Date): string => {
    const start = new Date(startDate);
    const end = new Date(endDate);

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
  };

  // Calculate duration
  const start = new Date(event.dateTime.start);
  const end = new Date(event.dateTime.end);
  const durationHours = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60),
  );
  const durationDays = Math.ceil(durationHours / 24);

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return `${currency} ${parseFloat(amount.toString()).toFixed(2)}`;
  };

  const locationName = `${event.location?.name || "TBD"}`;
  const locationAddress = `${event.location?.address || "Address not provided"}`;
  const humanDateRange = formatEventRange(start, end);

  // Theme colors from your design system
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

  const backgroundColor = theme.colors.background;
  const surfaceColor = theme.colors.surface;
  const primaryColor = theme.colors.primary;
  const secondaryColor = theme.colors.secondary;
  const successColor = theme.colors.success;
  const textColor = "#1A2C3E";
  const textMuted = "#6C757D";

  // Plan configuration based on event type
  const planConfig = isFreeEvent
    ? {
        label: "FREE SHORT EVENT",
        billing: "No payment required - Complimentary",
        note: "Events ≤ 3 hours are free of charge. Upgrade to standard plan for longer events.",
        statusSuffix: " (≤ 3 hours)",
      }
    : {
        label: "STANDARD EVENT",
        billing: `Daily Rate: ${formatCurrency(DAILY_RATE, invoice?.currency)}/day × ${invoice?.days || durationDays} days`,
        note: `20% enterprise discount applied. Final amount: ${formatCurrency(invoice?.finalAmount || invoice?.amount || 0, invoice?.currency)}`,
        statusSuffix: "",
      };

  // Styled footer
  const styledFooter = emailFooter.replace(
    'style="font-family: Arial, sans-serif; background-color: #f4f5f7; padding: 20px; text-align: center; color: #6c757d; font-size: 12px;"',
    `style="background-color:${backgroundColor}; padding:16px; text-align:center; color:#7f8c8d; font-size:12px; border-top:1px solid #e9ecef;"`,
  );

  // Authentication email template formatting
  const emailBody = `
<div style="margin:0; padding:0; background-color: ${backgroundColor};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${backgroundColor}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
    <tr>
      <td align="center" style="padding: 16px;">
        
        <!-- Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: ${surfaceColor}; border-radius: 12px; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td>
              ${emailHeader}
            </td>
          </tr>

          <!-- Event Hero / Gradient Banner -->
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

          <!-- Main Content Area -->
<tr>
  <td style="padding: 20px 14px;">

    <!-- Key-Value Table -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">

      <!-- Event ID -->
      <tr>
        <td style="padding: 6px 0; width: 40%; font-size: 12px; color: ${textMuted};">Event ID</td>
        <td style="padding: 6px 0; width: 60%;">
          <span style="background:${backgroundColor}; padding:4px 8px; border-radius:6px; border:1px solid #e9ecef; font-family:monospace; font-size:12px; color:${primaryColor};">
            ${event.eventSecret}
          </span>
        </td>
      </tr>

      <!-- Event Type -->
      <tr>
        <td style="padding: 6px 0; font-size: 12px; color: ${textMuted};">Event Type</td>
        <td style="padding: 6px 0; font-size: 13px; color: ${textColor};">
          ${event.eventType}
        </td>
      </tr>

      <!-- Date & Time -->
      <tr>
        <td style="padding: 6px 0; font-size: 12px; color: ${textMuted};">Date & Time</td>
        <td style="padding: 6px 0; font-size: 13px; color: ${textColor};">
          ${humanDateRange}
        </td>
      </tr>

      <!-- Duration -->
      <tr>
        <td style="padding: 6px 0; font-size: 12px; color: ${textMuted};">Duration</td>
        <td style="padding: 6px 0; font-size: 13px; color: ${textColor};">
          ${durationHours} hrs${durationHours >= 24 ? ` (${durationDays} days)` : ""}
        </td>
      </tr>

      <!-- Location -->
      <tr>
        <td style="padding: 6px 0; font-size: 12px; color: ${textMuted};">Location</td>
        <td style="padding: 6px 0; font-size: 13px; color: ${textColor};">
          ${locationName}<br/>
          <span style="font-size:11px; color:${textMuted};">${locationAddress}</span>
        </td>
      </tr>

      <!-- Organization -->
      <tr>
        <td style="padding: 6px 0; font-size: 12px; color: ${textMuted};">Organization</td>
        <td style="padding: 6px 0; font-size: 13px; color: ${textColor};">
          ${organization?.name || "Not specified"}
        </td>
      </tr>

      <!-- Status -->
      <tr>
        <td style="padding: 6px 0; font-size: 12px; color: ${textMuted};">Status</td>
        <td style="padding: 6px 0;">
          <span style="background:#e6f4ea; padding:3px 10px; border-radius:14px; font-size:11px; font-weight:500; color:#1e7b48;">
            Active
          </span>
          ${planConfig.statusSuffix}
        </td>
      </tr>

    </table>

    <!-- Billing / Free Block -->
    ${
      !isFreeEvent && invoice
        ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
      <tr>
        <td style="background:${backgroundColor}; padding:12px; border-radius:8px; border:1px solid #e9ecef;">
          
          <table width="100%" cellspacing="0" cellpadding="0" border="0">

            <tr>
              <td style="padding:4px 0; font-size:12px; color:${textMuted};">Invoice</td>
              <td style="padding:4px 0; font-size:13px; color:${textColor}; text-align:right;">
                ${invoice.invoiceNumber || "Pending"}
              </td>
            </tr>

            <tr>
              <td style="padding:4px 0; font-size:12px; color:${textMuted};">Days</td>
              <td style="padding:4px 0; font-size:13px; text-align:right;">
                ${invoice.days || durationDays}
              </td>
            </tr>

            <tr>
              <td style="padding:4px 0; font-size:12px; color:${textMuted};">Amount</td>
              <td style="padding:4px 0; font-size:13px; text-align:right;">
                ${formatCurrency(invoice.originalAmount || 0, invoice.currency)}
              </td>
            </tr>

            <tr>
              <td style="padding:4px 0; font-size:12px; color:${textMuted};">Discount</td>
              <td style="padding:4px 0; font-size:13px; color:${successColor}; text-align:right;">
                -${formatCurrency(invoice.discountAmount || 0, invoice.currency)}
              </td>
            </tr>

            <tr>
              <td style="padding:6px 0; font-weight:600; color:${primaryColor};">Total</td>
              <td style="padding:6px 0; font-size:16px; font-weight:700; color:${primaryColor}; text-align:right;">
                ${formatCurrency(invoice.finalAmount || invoice.amount || 0, invoice.currency)}
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
    `
        : `
    <!-- Note -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;">
      <tr>
        <td style="background:${backgroundColor}; padding:12px; border-left:4px solid ${primaryColor}; border-radius:6px;">
          <span style="font-size:12px;">
            <strong>📌 Note:</strong> ${planConfig.note}
          </span>
        </td>
      </tr>
    </table>
    `
    }



  </td>
</tr>
          
          <!-- Footer -->
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

  return emailBody.trim();
};
