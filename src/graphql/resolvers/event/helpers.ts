// src/graphql/resolvers/event/helpers.ts
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import * as path from "path";
import { promises as fsPromises } from "fs";
import { emailFooter } from "../../../utils/emailFooter";

const DAILY_RATE = 5.65;

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

export async function generateQrPdf(
  eventData: EventDetailsForPdf,
  logoFilename: string = "countysquare-4-3-21.png",
): Promise<string> {
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? "https://eventwave.dev/login"
      : "http://localhost:5173/login";

  const qrUrl = `${baseUrl}?eventSecret=${eventData.eventSecret}`;
  const tmpDir = path.join(__dirname, "../../../tmp");
  const pdfPath = path.join(tmpDir, `${eventData.eventKey}-qr-access.pdf`);
  const logoPath = path.join(__dirname, `../../../${logoFilename}`);

  try {
    await fsPromises.mkdir(tmpDir, { recursive: true });

    const files = await fsPromises.readdir(tmpDir);
    await Promise.all(
      files.map((file) =>
        fsPromises.rm(path.join(tmpDir, file), {
          force: true,
          recursive: true,
        }),
      ),
    );
  } catch (error) {
    console.error("Error preparing tmp directory:", error);
  }

  try {
    const qrCodeSize = 630;
    const increasedSize = Math.round(qrCodeSize * 1.12);
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: increasedSize,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    const qrBuffer = Buffer.from(
      qrDataUrl.replace(/^data:image\/png;base64,/, ""),
      "base64",
    );
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    const streamClosed = new Promise<void>((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .text(eventData.title, { align: "center" });
    doc.moveDown(0.5);
    doc
      .font("Helvetica")
      .fontSize(16)
      .text(eventData.location.name, { align: "center" });
    doc.fontSize(12).text(eventData.location.address, { align: "center" });
    doc.moveDown(1.5);
    doc
      .font("Helvetica-Oblique")
      .fontSize(10)
      .text(`Access Link: ${qrUrl}`, { align: "center" });
    doc.moveDown(0.5);

    const qrSize = 280;
    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const qrX = doc.page.margins.left + (pageWidth - qrSize) / 2;
    const qrY = doc.y + 10;

    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    try {
      await fsPromises.access(logoPath);
      doc.save();

      const centerX = qrX + qrSize / 2;
      const centerY = qrY + qrSize / 2;

      const logoSize = qrSize * 0.24;
      const ringThickness = logoSize * 0.08;
      const ringRadius = logoSize / 2;
      const logoImageSize = logoSize - ringThickness * 2;

      doc
        .circle(centerX, centerY, ringRadius + ringThickness)
        .fillOpacity(1)
        .fill("#FFFFFF");

      doc
        .circle(centerX, centerY, ringRadius)
        .lineWidth(ringThickness)
        .strokeColor("#000000")
        .stroke();

      doc.circle(centerX, centerY, logoImageSize / 2).clip();

      const logoX = centerX - logoImageSize / 2;
      const logoY = centerY - logoImageSize / 2;

      doc.image(logoPath, logoX, logoY, {
        width: logoImageSize,
        height: logoImageSize,
        fit: [logoImageSize, logoImageSize],
      });

      doc.restore();

      doc.save();
      doc
        .circle(centerX, centerY, ringRadius + ringThickness + 1)
        .fillOpacity(0.05)
        .fill("#000000");
      doc.restore();
    } catch (error) {
      console.log(`Logo not found at ${logoPath}, skipping...`);
    }

    doc.moveDown(1);
    doc.y = qrY + qrSize + 20;
    doc
      .font("Helvetica")
      .fontSize(18)
      .text("SCAN HERE TO CHECK IN", { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(14)
      .text(`Event Key: ${eventData.eventKey}`, { align: "center" });

    doc.end();
    await streamClosed;
    return pdfPath;
  } catch (error) {
    console.error("Error during QR PDF generation:", error);
    try {
      await fsPromises.unlink(pdfPath);
    } catch (unlinkError) {}
    throw new Error("Failed to generate the QR code PDF.");
  }
}

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

  const locationName = `${event.address}, ${event.location?.name || "TBD"}`;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e0e0e0; }
  .header { background-color: ${isFreeEvent ? "#1d8a4a" : "#007bff"}; color: white; padding: 20px; text-align: center; }
  .header h1 { font-size: 24px; margin: 0; font-weight: 600; }
  .header p { font-size: 14px; margin-top: 5px; opacity: 0.9; }
  .content { padding: 24px; }
  h2 { font-size: 20px; color: #333; margin: 0 0 20px 0; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; }
  .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .data-item { padding: 10px 15px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  .label { color: #777; font-size: 12px; margin-bottom: 2px; display: block; text-transform: uppercase; font-weight: 500; }
  .value { color: #333; font-size: 14px; font-weight: 600; }
  .free-badge { background-color: #28a745; color: white; padding: 5px 10px; border-radius: 4px; display: inline-block; font-size: 12px; font-weight: bold; }
  .footer { font-size: 12px; color: #888; text-align: center; padding: 20px; border-top: 1px solid #e0e0e0; background: #f9f9f9; }
  .invoice-details { background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px; }
</style>
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
          <td class="data-item"><span class="label">Duration</span><span class="value">${durationHours} hours (${durationDays} days)</span></td>
          <td class="data-item"><span class="label">Event Key</span><span class="value">${event.eventSecret}</span></td>
        </tr>
        <tr>
          <td class="data-item"><span class="label">Start Date</span><span class="value">${start.toLocaleString()}</span></td>
          <td class="data-item"><span class="label">End Date</span><span class="value">${end.toLocaleString()}</span></td>
          <td class="data-item"><span class="label">Location</span><span class="value">${locationName}</span></td>
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
