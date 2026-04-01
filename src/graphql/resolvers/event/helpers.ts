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

    // -------------------------
    // Footer (Centered)
    // -------------------------
    doc.y = qrY + qrSize + 35;

    // Main text - SCAN HERE TO CHECK IN
    doc.font("Helvetica-Bold").fontSize(18).text("SCAN HERE TO CHECK IN", {
      align: "center",
      lineGap: 5,
    });

    doc.moveDown(0.5);

    // Event ID
    doc
      .font("Helvetica")
      .fontSize(12)
      .text(`Event ID: ${eventData.eventSecret}`, {
        align: "center",
        lineGap: 3,
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
export const createEventSummaryEmail = (
  event: any,
  organization: any,
  invoice: InvoiceData | null,
  isFreeEvent: boolean = false,
) => {
  const start = new Date(event.dateTime.start);
  const end = new Date(event.dateTime.end);
  const durationHours = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60),
  );
  const durationDays = Math.ceil(durationHours / 24);

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return `${currency} ${parseFloat(amount.toString()).toFixed(2)}`;
  };

  const locationName = `${event.location?.address}, ${event.location?.name || "TBD"}`;

  // ✅ Use human-friendly date range
  const humanDateRange = formatEventRange(start, end);

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${emailHeader}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${event.title}</h1>
      <p>${isFreeEvent ? "FREE Short Event (≤ 3 hours)" : "Standard Event Registration"}</p>
    </div>
    <div class="content">
      <h2>Event Details</h2>
      <table class="data-table">
        <tr>
          <td class="data-item"><span class="label">Event Type</span><span class="value">${event.eventType}</span></td>
          <td class="data-item">
  <span class="label">Duration</span>
  <span class="value">
    ${durationHours} hours${durationHours >= 24 ? ` (${durationDays} days)` : ""}
  </span>
</td>
          <td class="data-item"><span class="label">Event ID</span><span class="value">${event.eventSecret}</span></td>
        </tr>
        <tr>
          <td class="data-item" colspan="3"><span class="label">Event Date & Time</span><span class="value">${humanDateRange}</span></td>
        </tr>
        <tr>
          <td class="data-item" colspan="3"><span class="label">Location</span><span class="value">${locationName}</span></td>
        </tr>
      </table>
      
      ${
        isFreeEvent
          ? `<div style="text-align: center; padding: 20px;">
          <span class="free-badge">✨ FREE EVENT - No Payment Required ✨</span>
          <p style="margin-top: 15px;">Short events (≤ 3 hours) are complimentary!</p>
        </div>`
          : `
        <h2>Billing Information</h2>
        <div class="invoice-details">
          <table class="data-table">
            <tr>
              <td class="data-item"><span class="label">Organization</span><span class="value">${organization?.name || "Not specified"}</span></td>
              <td class="data-item"><span class="label">Invoice Number</span><span class="value">${invoice?.invoiceNumber || "Pending"}</span></td>
            </tr>
            <tr>
              <td class="data-item"><span class="label">Daily Rate</span><span class="value">${formatCurrency(DAILY_RATE, invoice?.currency)}/day</span></td>
              <td class="data-item"><span class="label">Number of Days</span><span class="value">${invoice?.days || durationDays}</span></td>
            </tr>
            <tr>
              <td class="data-item"><span class="label">Original Amount</span><span class="value">${formatCurrency(invoice?.originalAmount || 0, invoice?.currency)}</span></td>
              <td class="data-item"><span class="label">Discount (20%)</span><span class="value">-${formatCurrency(invoice?.discountAmount || 0, invoice?.currency)}</span></td>
            </tr>
            <tr style="background-color: #e6f3ff;">
              <td class="data-item" colspan="2"><span class="label" style="color: #007bff;">Final Amount Due</span>
              <span class="value" style="color: #007bff; font-size: 18px;">${formatCurrency(invoice?.finalAmount || invoice?.amount || 0, invoice?.currency)}</span></td>
            </tr>
          </table>
        </div>
        `
      }
    </div>
    ${emailFooter}
  </div>
</body>
</html>`.trim();
};
