import { Router, Request, Response } from "express";
import PDFDocument from "pdfkit";
import * as cron from "node-cron";
import * as path from "path";
import * as fs from "fs";
import * as util from "util";
import { Invoice } from "../models/Invoice";
import { Payment } from "../models/Payment";
import { Event } from "../models/Event";
import { User } from "../models/User";
import { Organization } from "../models/Organization";
import { sendEmail } from "../utils/emailHandler";

import { emailFooter } from "../utils/emailFooter";
const router = Router();

/* ===========================
 * CONSTANTS & CONFIG
 * =========================== */
const BRAND = {
  name: "EventWave",
  primaryColor: "#007bff",
  secondaryColor: "#6c757d",
  accentColor: "#28a745",
  warningColor: "#ffc107",
  dangerColor: "#dc3545",
  lightColor: "#f8f9fa",
  darkColor: "#343a40",
  logoFilename: "countysquare-4-3-21.png",
  website: "https://eventwave.dev",
  devURL: "http://192.168.43.218:5173",
  supportEmail: "info@eventwave.dev",
  phone: "+254 (700) 378-241",
  address: "Ngeno Drive, Suite 120C Langata, Nairobi 00100",
  awsGradient: "linear-gradient(135deg, #007bff 0%, #0056b3 100%)",
  awsCardShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
};

// Pre-calculated constants
const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const TMP_DIR = path.join(__dirname, "tmp");
const existsAsync = util.promisify(fs.exists);
const mkdirAsync = util.promisify(fs.mkdir);

/* ===========================
 * PAYMENT LINK UTILITIES
 * =========================== */
interface PaymentLinkData {
  invoiceVouchers: string[];
  invoiceNumbers: string[];
  invoiceIds: string[];
  totalAmount: number;
  orgId: string;
  orgName: string;
  orgEmail?: string;
  timestamp: number;
  currency?: string;
  summary?: {
    invoiceCount: number;
    subtotal: number;
    tax: number;
    total: number;
  };
}

const encodePaymentData = (data: PaymentLinkData): string => {
  const jsonString = JSON.stringify(data);
  return Buffer.from(jsonString)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const decodePaymentData = (encoded: string): PaymentLinkData => {
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  if (padding) {
    base64 += "=".repeat(4 - padding);
  }
  return JSON.parse(Buffer.from(base64, "base64").toString());
};

const generatePaymentLink = (
  invoices: any[],
  organization: any,
  totalAmount: number,
): string => {
  const paymentData: PaymentLinkData = {
    invoiceVouchers: invoices
      .map((inv) => inv.accessVoucher || "")
      .filter(Boolean),
    invoiceNumbers: invoices
      .map((inv) => inv.invoiceNumber || "")
      .filter(Boolean),
    invoiceIds: invoices
      .map((inv) => inv._id?.toString() || "")
      .filter(Boolean),
    totalAmount,
    orgId: organization._id?.toString() || organization.id || "",
    orgName: organization.name || "",
    orgEmail: organization.email || organization.contactEmail || "",
    timestamp: Date.now(),
    currency: invoices[0]?.currency || "USD",
    summary: {
      invoiceCount: invoices.length,
      subtotal: invoices.reduce(
        (sum, inv) => sum + (inv.subtotal || inv.amount * 0.84),
        0,
      ),
      tax: invoices.reduce(
        (sum, inv) => sum + (inv.taxAmount || inv.amount * 0.16),
        0,
      ),
      total: totalAmount,
    },
  };

  const encodedData = encodePaymentData(paymentData);
  const baseUrl =
    process.env.NODE_ENV === "development" ? BRAND.devURL : BRAND.website;

  return `${baseUrl}/billing/pay?data=${encodeURIComponent(encodedData)}`;
};

const generateDirectPaymentLink = (data: PaymentLinkData): string => {
  const encodedData = encodePaymentData(data);
  const baseUrl =
    process.env.NODE_ENV === "development" ? BRAND.devURL : BRAND.website;

  return `${baseUrl}/billing/pay?data=${encodeURIComponent(encodedData)}`;
};

/* ===========================
 * CACHED FUNCTIONS
 * =========================== */
const memoize = <T extends (...args: any[]) => any>(fn: T): T => {
  const cache = new Map();
  return ((...args: any[]) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
};

const formatDateShort = memoize((date: Date): string => {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
});

const formatDateTime = memoize((date: Date): string => {
  return date.toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
});

const calculateDaysOverdue = memoize((invoiceDate: Date): number => {
  return Math.floor((Date.now() - invoiceDate.getTime()) / ONE_DAY_MS);
});

const getStatusColor = (daysOverdue: number): string => {
  if (daysOverdue > 60) return BRAND.dangerColor;
  if (daysOverdue > 45) return "#fd7e14";
  if (daysOverdue > 30) return BRAND.warningColor;
  return BRAND.secondaryColor;
};

const getStatusLabel = (daysOverdue: number): string => {
  if (daysOverdue > 60) return "CRITICAL";
  if (daysOverdue > 45) return "HIGH PRIORITY";
  if (daysOverdue > 30) return "OVERDUE";
  return "PENDING";
};

const slugifyTitle = memoize((title: string): string => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
});

const formatCurrency = memoize(
  (amount: number, currency: string = "USD"): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  },
);

/* ===========================
 * TYPE DEFINITIONS
 * =========================== */
interface EventDetailsForPdf {
  title: string;
  location: { name: string; address: string };
  eventSecret: string;
  dateTime: { start: Date; end: Date };
}

interface InvoiceForAggregation {
  _id: string;
  organization: { _id: string; name: string; email?: string };
  invoiceNumber: string;
  accessVoucher: string;
  amount: number;
  status: string;
  issuedAt: Date;
  description?: string;
  currency?: string;
  event?: any;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate?: number;
  taxAmount?: number;
  discount?: number;
  category?: string;
}

interface InvoiceWithItems extends InvoiceForAggregation {
  items?: InvoiceItem[];
  taxRate?: number;
  discount?: number;
  subtotal?: number;
  taxAmount?: number;
  total: number;
}

/* ===========================
 * INVOICE ITEMS FETCH & TABULATION
 * =========================== */
async function fetchAndTabulateInvoiceItems(
  invoiceId: string,
): Promise<InvoiceWithItems | null> {
  try {
    const invoice = await Invoice.findById(invoiceId)
      .populate("organization", "name email taxId vatNumber")
      .populate("event", "title eventSecret dateTime.start dateTime.end")
      .lean();

    if (!invoice) return null;

    const items: InvoiceItem[] = [];
    let subtotal = 0;
    let taxRate = 0.16;
    let discountAmount = 0;
    let originalAmount = 0;

    if (
      invoice.event &&
      typeof invoice.event === "object" &&
      "dateTime" in invoice.event
    ) {
      const event = invoice.event as any;
      const startDate = new Date(event.dateTime.start);
      const endDate = new Date(event.dateTime.end);
      const durationMs = endDate.getTime() - startDate.getTime();
      const days = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));
      const rate = 1.9;

      originalAmount = days * rate;
      subtotal = originalAmount;

      items.push({
        description: `Platform Access - ${event.title || "Event"}`,
        quantity: days,
        unitPrice: rate,
        amount: originalAmount,
        category: "PLATFORM_FEE",
      });

      discountAmount = originalAmount * 0.2;
      subtotal -= discountAmount;

      if (discountAmount > 0) {
        items.push({
          description: "Promotion Discount (20%)",
          quantity: 1,
          unitPrice: -discountAmount,
          amount: -discountAmount,
          category: "DISCOUNT",
        });
      }
    } else {
      subtotal = invoice.amount || 0;
      items.push({
        description: "Professional Event Interactivity Tools",
        quantity: 1,
        unitPrice: subtotal,
        amount: subtotal,
        category: "SERVICE",
      });
    }

    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    return {
      ...invoice,
      organization: {
        _id: (invoice.organization as any)._id?.toString() || "",
        name: (invoice.organization as any).name || "",
        email: (invoice.organization as any).email,
      },
      items,
      subtotal,
      taxRate,
      discount: discountAmount,
      taxAmount,
      total,
    } as InvoiceWithItems;
  } catch (error) {
    console.error(`Error fetching invoice ${invoiceId}:`, error);
    return null;
  }
}

async function fetchBatchInvoiceItems(
  invoiceIds: string[],
): Promise<InvoiceWithItems[]> {
  const invoices: InvoiceWithItems[] = [];
  const BATCH_SIZE = 10;

  for (let i = 0; i < invoiceIds.length; i += BATCH_SIZE) {
    const batch = invoiceIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((id) => fetchAndTabulateInvoiceItems(id)),
    );

    batchResults.forEach((result) => {
      if (result) invoices.push(result);
    });
  }

  return invoices;
}

/* ===========================
 * OPTIMIZED BATCH INVOICE PDF WITH DYNAMIC PAYMENT LINK
 * =========================== */

export async function generateBatchInvoicePDF(
  invoices: any[],
  organization: any,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 45,
      info: { Title: `Statement - ${organization.name}` },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const MARGIN = 45;
    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

    const wNo = USABLE_WIDTH * 0.3;
    const wDesc = USABLE_WIDTH * 0.35;
    const wDate = USABLE_WIDTH * 0.22;
    const wAmt = USABLE_WIDTH * 0.13;

    const col = {
      no: MARGIN,
      desc: MARGIN + wNo,
      date: MARGIN + wNo + wDesc,
      amt: MARGIN + wNo + wDesc + wDate,
    };

    /* ---------------- Logo ---------------- */
    const logoPath = path.resolve(__dirname, BRAND.logoFilename);
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, MARGIN, 38, { width: 105 });
    }

    /* ---------------- Header ---------------- */
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#020c1b")
      .text("INVOICE STATEMENT", MARGIN, 45, { align: "right" });

    const invoiceDate = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#475569")
      .text(`Billed To: ${organization.name}`, MARGIN, 72, { align: "right" })
      .text(`Invoice Date: ${invoiceDate}`, { align: "right" });

    doc
      .fontSize(9)
      .fillColor(BRAND.secondaryColor)
      .text(`Website: ${BRAND.website}`, MARGIN, 105)
      .text(`Email: ${BRAND.supportEmail}`, MARGIN, 118)
      .text(`Phone: ${BRAND.phone}`, MARGIN, 131)
      .text(`Address: ${BRAND.address}`, MARGIN, 144);

    /* ---------------- Summary Card ---------------- */
    const summaryY = 175;
    const totalAmount = invoices.reduce((s, i) => s + i.total, 0);

    doc
      .roundedRect(MARGIN, summaryY, USABLE_WIDTH, 52, 6)
      .fill(BRAND.lightColor);

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#64748b")
      .text("TOTAL OUTSTANDING", MARGIN + 20, summaryY + 14)
      .text("INVOICES", col.amt - 20, summaryY + 14, {
        width: wAmt + 20,
        align: "right",
      });

    doc
      .fontSize(18)
      .fillColor(BRAND.primaryColor)
      .text(`$${totalAmount.toFixed(2)}`, MARGIN + 20, summaryY + 27)
      .fillColor("#020c1b")
      .text(invoices.length.toString(), col.amt - 20, summaryY + 27, {
        width: wAmt + 20,
        align: "right",
      });

    /* ---------------- Table ---------------- */
    let currentY = summaryY + 78;

    doc
      .moveTo(MARGIN, currentY - 8)
      .lineTo(PAGE_WIDTH - MARGIN, currentY - 8)
      .strokeColor("#e2e8f0")
      .lineWidth(0.5)
      .stroke();

    doc.fontSize(8).fillColor("#94a3b8").font("Helvetica-Bold");
    doc.text("INVOICE NO.", col.no, currentY, { width: wNo });
    doc.text("DESCRIPTION", col.desc, currentY, { width: wDesc });
    doc.text("DATE", col.date, currentY, { width: wDate });
    doc.text("AMOUNT", col.amt, currentY, { width: wAmt, align: "right" });

    currentY += 22;

    invoices.forEach((inv) => {
      doc.fontSize(9).fillColor("#1e293b").font("Helvetica-Bold");
      doc.text(inv.invoiceNumber || "N/A", col.no, currentY, { width: wNo });

      doc.font("Helvetica").fillColor("#475569");
      doc.text(
        inv.event?.title || inv.description || "Platform Access",
        col.desc,
        currentY,
        { width: wDesc },
      );

      // Determine locale dynamically
      const userLocale =
        typeof navigator !== "undefined"
          ? navigator.language // browser
          : Intl.DateTimeFormat().resolvedOptions().locale; // Node.js

      doc.text(
        new Date(inv.issuedAt).toLocaleDateString(userLocale, {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        col.date,
        currentY,
        { width: wDate },
      );

      //
      doc.font("Helvetica-Bold").fillColor("#0f172a");
      doc.text(`$${inv.total.toFixed(2)}`, col.amt, currentY, {
        width: wAmt,
        align: "right",
      });

      currentY += 20;
    });

    /* ---------------- Bottom Divider ---------------- */
    currentY += 6;

    doc
      .moveTo(MARGIN, currentY)
      .lineTo(PAGE_WIDTH - MARGIN, currentY)
      .strokeColor("#e5e7eb")
      .lineWidth(0.5)
      .stroke();

    currentY += 10;

    /* ---------------- Amount Summary ---------------- */
    const subtotal = totalAmount;
    const taxAmount = 0;
    const grandTotal = subtotal + taxAmount;

    doc.fontSize(9).fillColor("#475569").font("Helvetica");
    currentY += 13;

    doc
      .font("Helvetica-Bold")
      .fillColor("#020c1b")
      .text("Total Due", col.date, currentY, {
        width: wDate,
        align: "right",
      });

    doc.text(`$${grandTotal.toFixed(2)}`, col.amt, currentY, {
      width: wAmt,
      align: "right",
    });

    currentY += 13;

    doc.text("Tax", col.date, currentY, { width: wDate, align: "right" });
    doc.text(`Included`, col.amt, currentY, {
      width: wAmt,
      align: "right",
    });

    currentY += 22;

    /* ---------------- Payment Instructions ---------------- */
    const paymentLink = generatePaymentLink(
      invoices,
      organization,
      totalAmount,
    );

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a");
    doc.text("Payment Instructions", MARGIN, currentY);

    currentY += 14;

    doc.font("Helvetica").fontSize(9).fillColor("#475569");
    doc.text(
      "Pay securely via our payment portal. Your outstanding balance is pre-filled automatically.",
      MARGIN,
      currentY,
      { width: USABLE_WIDTH },
    );

    /* ---------------- Pay Button ---------------- */
    currentY += 26;

    const buttonWidth = 180;
    const buttonHeight = 34;
    const buttonX = (PAGE_WIDTH - buttonWidth) / 2;

    doc
      .roundedRect(buttonX, currentY, buttonWidth, buttonHeight, 17)
      .fillAndStroke("#2563eb", "#2563eb");

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#ffffff")
      .text("Pay Now Securely", buttonX, currentY + 10, {
        width: buttonWidth,
        align: "center",
      });

    doc.link(buttonX, currentY, buttonWidth, buttonHeight, paymentLink);

    /* ---------------- Legal Footer ---------------- */
    currentY += buttonHeight + 14;

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748b")
      .text(
        `This invoice was generated electronically and is valid without a signature.
Payments are processed securely via our encrypted gateway.
© 2024 - ${new Date().getFullYear()} Eventwave Interactivity. All rights reserved.`,
        MARGIN,
        currentY,
        { width: USABLE_WIDTH, align: "center" },
      );

    doc.end();
  });
}

/* ===========================
 * OPTIMIZED AGGREGATION FUNCTION
 * =========================== */
async function aggregateUnpaidInvoices(): Promise<void> {
  console.time("invoice-aggregation");

  try {
    const cutoff = new Date();
    if (process.env.NODE_ENV === "development") {
      cutoff.setDate(cutoff.getDate() - 3);
    } else {
      cutoff.setDate(cutoff.getDate() - 30);
    }

    const invoices = await Invoice.find({
      status: "UNPAID",
      issuedAt: { $lte: cutoff },
    })
      .populate(
        "organization",
        "name email contactEmail admins createdBy additionalContacts taxId vatNumber",
      )
      .lean<InvoiceForAggregation[]>();

    if (!invoices.length) {
      console.log("ℹ️ No unpaid invoices found");
      return;
    }

    // Group by organization
    const orgMap = new Map<
      string,
      {
        organization: any;
        invoices: InvoiceForAggregation[];
      }
    >();

    for (const invoice of invoices) {
      const orgId = invoice.organization._id.toString();
      if (!orgMap.has(orgId)) {
        orgMap.set(orgId, {
          organization: invoice.organization,
          invoices: [],
        });
      }
      orgMap.get(orgId)!.invoices.push(invoice);
    }

    console.log(`📊 Processing ${orgMap.size} organizations`);

    // Process organizations with concurrency limit
    const BATCH_SIZE = 5;
    const orgEntries = Array.from(orgMap.entries());

    for (let i = 0; i < orgEntries.length; i += BATCH_SIZE) {
      const batch = orgEntries.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(([_, orgData]) => processOrganizationInvoices(orgData)),
      );
    }
  } catch (error) {
    console.error("Aggregation error:", error);
  } finally {
    console.timeEnd("invoice-aggregation");
  }
}

/* ===========================
 * PROCESS ORGANIZATION INVOICES
 * =========================== */
async function processOrganizationInvoices(orgData: {
  organization: any;
  invoices: InvoiceForAggregation[];
}): Promise<void> {
  try {
    const { organization, invoices } = orgData;

    // Fetch detailed invoice items
    const detailedInvoices = await fetchBatchInvoiceItems(
      invoices.map((inv) => inv._id.toString()),
    );

    if (detailedInvoices.length === 0) {
      console.log(`⚠️ No detailed invoice data for ${organization.name}`);
      return;
    }

    // Calculate summary
    const summary = {
      totalInvoices: detailedInvoices.length,
      totalAmount: detailedInvoices.reduce((sum, inv) => sum + inv.total, 0),
      subtotal: detailedInvoices.reduce(
        (sum, inv) => sum + (inv.subtotal || inv.amount),
        0,
      ),
      tax: detailedInvoices.reduce((sum, inv) => sum + (inv.taxAmount || 0), 0),
      oldestInvoiceDate: detailedInvoices.reduce((oldest, inv) =>
        inv.issuedAt < oldest.issuedAt ? inv : oldest,
      ).issuedAt,
    };

    // Generate payment data with all invoice details
    const paymentData: PaymentLinkData = {
      invoiceVouchers: detailedInvoices
        .map((inv) => inv.accessVoucher || "")
        .filter(Boolean),
      invoiceNumbers: detailedInvoices
        .map((inv) => inv.invoiceNumber || "")
        .filter(Boolean),
      invoiceIds: detailedInvoices
        .map((inv) => inv._id?.toString() || "")
        .filter(Boolean),
      totalAmount: summary.totalAmount,
      orgId: organization._id?.toString() || "",
      orgName: organization.name || "",
      orgEmail: organization.email || organization.contactEmail || "",
      timestamp: Date.now(),
      currency: detailedInvoices[0]?.currency || "USD",
      summary: {
        invoiceCount: summary.totalInvoices,
        subtotal: summary.subtotal,
        tax: summary.tax,
        total: summary.totalAmount,
      },
    };

    const encodedPaymentData = encodePaymentData(paymentData);

    // Get recipients
    const recipients = await getInvoiceRecipients(organization);

    if (recipients.length === 0) {
      console.log(`⚠️ No recipients found for ${organization.name}`);
      return;
    }

    // Generate PDF and send email
    const [pdfBuffer] = await Promise.all([
      generateBatchInvoicePDF(detailedInvoices, organization),
      sendAggregatedInvoiceEmail(
        recipients,
        detailedInvoices,
        organization,
        encodedPaymentData,
        summary,
      ),
    ]);

    // Save PDF temporarily
    const tmpDir = path.join(TMP_DIR, "batch-invoices");
    if (!fs.existsSync(tmpDir)) {
      await mkdirAsync(tmpDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const pdfFilename = `${organization.name.replace(
      /[^a-z0-9]/gi,
      "_",
    )}_batch_${timestamp}.pdf`;
    const pdfPath = path.join(tmpDir, pdfFilename);
    await fs.promises.writeFile(pdfPath, pdfBuffer);

    // Clean up old PDFs
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    try {
      const files = await fs.promises.readdir(tmpDir);
      for (const file of files) {
        const filePath = path.join(tmpDir, file);
        const stats = await fs.promises.stat(filePath);
        if (stats.mtimeMs < sevenDaysAgo && file.endsWith(".pdf")) {
          await fs.promises.unlink(filePath).catch(() => {});
        }
      }
    } catch (cleanupError) {
      // Silent cleanup error
    }

    console.log(
      `✅ Processed ${organization.name}: ${invoices.length} invoices`,
    );
  } catch (error) {
    console.error(`❌ Failed for ${orgData.organization.name}:`, error);
  }
}

/* ===========================
 * DIGITAL OCEAN-STYLE EMAIL WITH DYNAMIC PAYMENT LINK
 * =========================== */
const createBatchInvoiceEmail = (
  organization: any,
  invoices: InvoiceWithItems[],
  encodedPaymentData: string,
  summary: {
    totalInvoices: number;
    totalAmount: number;
    subtotal: number;
    tax: number;
    oldestInvoiceDate: Date;
  },
) => {
  const daysOverdue = calculateDaysOverdue(summary.oldestInvoiceDate);
  const statusLabel = getStatusLabel(daysOverdue);

  // Generate dynamic payment link from encoded data
  const paymentData = decodePaymentData(encodedPaymentData);
  const paymentUrl = generateDirectPaymentLink(paymentData);

  // Generate detailed invoice list for email
  const invoiceList = invoices
    .map(
      (inv) => `
      <tr>
        <td class="mono" style="padding: 12px 0; border-bottom: 1px solid #f3f5f9;">
          ${inv.invoiceNumber || "N/A"}
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f5f9; color: #5b6c84;">
          ${inv.event?.title || inv.description || "Platform Access"}
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f5f9; color: #5b6c84;">
          ${formatDateShort(inv.issuedAt)}
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f5f9; text-align: right; font-weight: 600;">
          ${formatCurrency(inv.total)}
        </td>
      </tr>
    `,
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { 
      font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
      background-color: #f8fafc; 
      margin: 0; 
      padding: 20px; 
      color: #334155; 
      line-height: 1.6;
    }
    .container { 
      max-width: 700px; 
      margin: 0 auto; 
      background: #ffffff; 
      border-radius: 12px; 
      border: 1px solid #e2e8f0; 
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }
    .header { 
      padding: 30px 40px; 
      background: linear-gradient(135deg, ${
        BRAND.primaryColor
      } 0%, #0056b3 100%);
      color: white;
    }
    .logo { 
      font-size: 26px; 
      font-weight: 800; 
      letter-spacing: -0.5px;
    }
    .status-badge { 
      float: right; 
      padding: 6px 16px; 
      border-radius: 20px; 
      font-size: 12px; 
      font-weight: 700; 
      background: rgba(255, 255, 255, 0.2); 
      color: white; 
      text-transform: uppercase;
      backdrop-filter: blur(10px);
    }
    
    .content { 
      padding: 40px; 
    }
    .greeting { 
      font-size: 16px; 
      color: #475569; 
      margin-bottom: 30px;
    }
    
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .summary-card {
      background: #f8fafc;
      border-radius: 8px;
      padding: 24px;
      border-left: 4px solid ${BRAND.primaryColor};
    }
    .summary-card .label {
      font-size: 13px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .summary-card .value {
      font-size: 28px;
      font-weight: 800;
      color: ${BRAND.primaryColor};
    }
    .summary-card .subtext {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 4px;
    }
    
    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
    }
    .invoice-table th {
      text-align: left;
      font-size: 12px;
      color: #64748b;
      padding: 12px 0;
      border-bottom: 2px solid #e2e8f0;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .invoice-table td {
      padding: 14px 0;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
    }
    .invoice-number {
      font-family: 'SF Mono', 'Roboto Mono', monospace;
      font-weight: 600;
      color: #0f172a;
    }
    
    .total-section {
      background: #f8fafc;
      border-radius: 8px;
      padding: 24px;
      margin: 30px 0;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .total-row.total-final {
      border-top: 2px solid #e2e8f0;
      padding-top: 16px;
      margin-top: 16px;
      font-size: 18px;
      font-weight: 800;
      color: ${BRAND.primaryColor};
    }
    
    .cta-section {
      text-align: center;
      padding: 40px;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-top: 1px solid #e2e8f0;
    }
    .payment-button {
      display: inline-block;
      background: ${BRAND.primaryColor};
      color: white !important;
      text-decoration: none;
      padding: 16px 40px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 16px;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 123, 255, 0.25);
    }
    .payment-button:hover {
      background: #0056b3;
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 123, 255, 0.3);
    }
    .payment-link {
      display: block;
      margin-top: 20px;
      font-size: 13px;
      color: #64748b;
      word-break: break-all;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }
    
    .footer {
      padding: 30px 40px;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.8;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .contact-info {
      margin-top: 20px;
      font-size: 11px;
    }
    
    @media (max-width: 600px) {
      .content, .header, .cta-section, .footer {
        padding: 20px;
      }
      .summary-cards {
        grid-template-columns: 1fr;
      }
      .invoice-table {
        font-size: 13px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${BRAND.name}</div>
      <div class="status-badge">${statusLabel}</div>
    </div>
    
    <div class="content">
      <div class="greeting">
        <p>Hello ${organization.name},</p>
        <p>This is a consolidated invoice statement for the event vouchers you have redeemed. </p>
        <p>Below is a summary of all outstanding invoices.</p>
      </div>
      
      <div class="summary-cards">
        <div class="summary-card">
          <div class="label">Total Amount Due</div>
          <div class="value">${formatCurrency(summary.totalAmount)}</div>
          <div class="subtext">Including all taxes</div>
        </div>
        <div class="summary-card">
          <div class="label">Total Invoices</div>
          <div class="value">${summary.totalInvoices}</div>
          <div class="subtext">Outstanding items</div>
        </div>
        <div class="summary-card">
          <div class="label">Oldest Invoice</div>
          <div class="value">${formatDateShort(summary.oldestInvoiceDate)}</div>
          <div class="subtext">${daysOverdue} days outstanding</div>
        </div>
      </div>
      
      <h3 style="color: #0f172a; margin-bottom: 20px;">Invoice Details</h3>
      <table class="invoice-table">
        <thead>
          <tr>
            <th>Invoice Number</th>
            <th>Description</th>
            <th>Issued Date</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoiceList}
        </tbody>
      </table>
      
      <div class="total-section">
        <div class="total-row">
          <span>Subtotal</span>
          <span>${formatCurrency(summary.subtotal)}</span>
        </div>
        <div class="total-row">
          <span>Tax (16%)</span>
          <span>${formatCurrency(summary.tax)}</span>
        </div>
        <div class="total-row total-final">
          <span>TOTAL AMOUNT DUE</span>
          <span>${formatCurrency(summary.totalAmount)}</span>
        </div>
      </div>
    </div>
    
    <div class="cta-section">
      <h3 style="color: #0f172a; margin-bottom: 20px;">Ready to Pay?</h3>
      <p style="color: #475569; margin-bottom: 30px; max-width: 500px; margin-left: auto; margin-right: auto;">
        Pay all ${
          summary.totalInvoices
        } invoices with a single secure payment. Your payment link includes all invoice details for automatic reconciliation.
      </p>
      <a href="${paymentUrl}" class="payment-button">
        Pay Securely Now
      </a> 
      <p style="font-size: 12px; color: #94a3b8; margin-top: 20px;">
        This link expires in 30 days. Need help? Reply to this email.
      </p>
    </div>

    <!-- FOOTER --> 
     ${emailFooter}  
  </div>
</body>
</html>
  `.trim();
};

/* ===========================
 * EMAIL SENDING FUNCTION
 * =========================== */
async function sendAggregatedInvoiceEmail(
  recipients: string[],
  invoices: InvoiceWithItems[],
  organization: any,
  encodedPaymentData: string,
  summary: {
    totalInvoices: number;
    totalAmount: number;
    subtotal: number;
    tax: number;
    oldestInvoiceDate: Date;
  },
): Promise<void> {
  try {
    const emailBody = createBatchInvoiceEmail(
      organization,
      invoices,
      encodedPaymentData,
      summary,
    );

    const daysOverdue = calculateDaysOverdue(summary.oldestInvoiceDate);
    const statusLabel = getStatusLabel(daysOverdue);

    const emailSubject = `[${statusLabel}] Action Required: ${
      BRAND.name
    } Statement – ${formatCurrency(summary.totalAmount)} Outstanding (${
      summary.totalInvoices
    } Invoices) | ${organization.name}`;

    // Generate PDF for attachment
    const timestamp = new Date().toISOString().split("T")[0];
    const pdfFilename = `${organization.name.replace(
      /[^a-z0-9]/gi,
      "_",
    )}_invoice_batch_${timestamp}.pdf`;

    const pdfBuffer = await generateBatchInvoicePDF(invoices, organization);

    // Save PDF temporarily for attachment
    const tmpPdfPath = path.join(TMP_DIR, pdfFilename);
    await fs.promises.writeFile(tmpPdfPath, pdfBuffer);

    const attachments = [
      {
        filename: pdfFilename,
        path: tmpPdfPath,
        contentType: "application/pdf",
      },
    ];

    await sendEmail(recipients, emailSubject, emailBody, attachments);

    // Clean up temporary PDF
    try {
      await fs.promises.unlink(tmpPdfPath);
    } catch (cleanupError) {
      // Silent cleanup
    }

    console.log(
      `📧 Sent batch invoice email to ${recipients.length} recipients`,
    );
  } catch (error) {
    console.error("Failed to send batch invoice email:", error);
    throw error;
  }
}

/* ===========================
 * RECIPIENT FETCH FUNCTION
 * =========================== */
async function getInvoiceRecipients(organization: any): Promise<string[]> {
  const recipients = new Set<string>();

  // Add primary organization email
  if (organization.email) {
    recipients.add(organization.email);
  }

  // Add contact email if different
  if (
    organization.contactEmail &&
    organization.contactEmail !== organization.email
  ) {
    recipients.add(organization.contactEmail);
  }

  // Add creator email
  if (organization.createdBy?.email) {
    recipients.add(organization.createdBy.email);
  }

  // Add admin emails
  if (organization.admins && Array.isArray(organization.admins)) {
    organization.admins.forEach((admin: any) => {
      if (admin.email) recipients.add(admin.email);
    });
  }

  // Add additional contacts
  if (
    organization.additionalContacts &&
    Array.isArray(organization.additionalContacts)
  ) {
    organization.additionalContacts.forEach((contact: any) => {
      if (contact.email) recipients.add(contact.email);
    });
  }

  return Array.from(recipients).filter(
    (email) => email && typeof email === "string" && email.includes("@"),
  );
}

/* ===========================
 * SCHEDULER
 * =========================== */
export function startScheduler(): void {
  console.log("⏰ Starting optimized invoice scheduler...");

  // Development mode: Run every 5 minutes
  if (process.env.NODE_ENV === "development") {
    cron.schedule("*/60 * * * *", () => {
      console.log("🔧 Development aggregation running...");
      aggregateUnpaidInvoices().catch(console.error);
    });
    console.log("✅ Development scheduler: Every 5 minutes");
  } else {
    // Production: Run every Monday and Tuesday at 6:45 AM

    cron.schedule("45 6 8-14 * 1,2", () => {
      aggregateUnpaidInvoices().catch(console.error);
    });
  }
}

/* ===========================
 * ROUTES
 * =========================== */
// Process Batch Payment with enhanced validation
router.post("/process-batch", async (req: Request, res: Response) => {
  try {
    const { encodedData, amount, paymentMethod = "BATCH" } = req.body;

    if (!encodedData || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: encodedData and amount are required",
      });
    }

    // Decode payment data
    let paymentData: PaymentLinkData;
    try {
      paymentData = decodePaymentData(encodedData);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment data format",
      });
    }

    // Validate payment data
    if (
      !paymentData.invoiceVouchers ||
      !paymentData.orgId ||
      !paymentData.orgName
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment data: missing required fields",
      });
    }

    // Find invoices by voucher codes
    const invoices = await Invoice.find({
      accessVoucher: { $in: paymentData.invoiceVouchers },
      status: "UNPAID",
    });

    if (invoices.length !== paymentData.invoiceVouchers.length) {
      const foundVouchers = invoices.map((inv) => inv.accessVoucher);
      const missingVouchers = paymentData.invoiceVouchers.filter(
        (v) => !foundVouchers.includes(v),
      );

      return res.status(400).json({
        success: false,
        error: "Some invoices not found or already paid",
        missingVouchers,
        foundCount: invoices.length,
        expectedCount: paymentData.invoiceVouchers.length,
      });
    }

    // Verify total amount
    const calculatedTotal = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    const parsedAmount = parseFloat(amount);

    if (Math.abs(calculatedTotal - parsedAmount) > 0.01) {
      return res.status(400).json({
        success: false,
        error: "Amount mismatch",
        calculated: calculatedTotal,
        provided: parsedAmount,
        difference: Math.abs(calculatedTotal - parsedAmount),
      });
    }

    // Update all invoices to PAID
    const updateResult = await Invoice.updateMany(
      { accessVoucher: { $in: paymentData.invoiceVouchers } },
      {
        status: "PAID",
        paidAt: new Date(),
        paymentMethod: paymentMethod,
        metadata: {
          batchPaymentId: `batch_${Date.now()}`,
          batchProcessedAt: new Date(),
          originalEncodedData: encodedData,
          organization: {
            id: paymentData.orgId,
            name: paymentData.orgName,
            email: paymentData.orgEmail,
          },
        },
      },
    );

    // Create comprehensive payment record
    const payment = await Payment.create({
      organization: paymentData.orgId,
      invoiceVouchers: paymentData.invoiceVouchers,
      invoiceNumbers: paymentData.invoiceNumbers,
      invoiceIds: paymentData.invoiceIds,
      amount: parsedAmount,
      currency: paymentData.currency || "USD",
      transactionId: `txn_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 11)}`,
      paymentMethod: paymentMethod,
      status: "COMPLETED",
      payerInfo: {
        organizationName: paymentData.orgName,
        organizationEmail: paymentData.orgEmail,
      },
      metadata: {
        batchType: "AGGREGATED_INVOICES",
        invoiceCount: paymentData.invoiceVouchers.length,
        invoiceVouchers: paymentData.invoiceVouchers,
        originalEncodedData: encodedData,
        processedAt: new Date(),
        summary: {
          subtotal: paymentData.summary?.subtotal || parsedAmount / 1.16,
          vat: paymentData.summary?.tax || parsedAmount * 0.16,
          total: parsedAmount,
        },
        organization: {
          id: paymentData.orgId,
          name: paymentData.orgName,
          email: paymentData.orgEmail,
        },
      },
    });

    // Send payment confirmation email
    try {
      const recipients = await getInvoiceRecipients({
        _id: paymentData.orgId,
        name: paymentData.orgName,
        email: paymentData.orgEmail,
      });

      if (recipients.length > 0) {
        const confirmationSubject = `Payment Confirmation - ${paymentData.invoiceVouchers.length} Invoices Paid`;
        const confirmationBody = `
          <h2>Payment Confirmation</h2>
          <p>Dear ${paymentData.orgName},</p>
          <p>We have successfully processed your payment for ${
            paymentData.invoiceVouchers.length
          } invoices.</p>
          <p><strong>Transaction ID:</strong> PAID}</p>
          <p><strong>Amount Paid:</strong> ${formatCurrency(
            parsedAmount,
            paymentData.currency,
          )}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Invoices Paid:</strong></p>
          <ul>
            ${paymentData.invoiceVouchers
              .map((voucher) => `<li>${voucher}</li>`)
              .join("")}
          </ul>
          <p>Thank you for your payment!</p>
          <p>Best regards,<br>${BRAND.name} Team</p>
        `;

        await sendEmail(recipients, confirmationSubject, confirmationBody);
      }
    } catch (emailError) {
      console.error("Failed to send payment confirmation email:", emailError);
      // Don't fail the payment process if email fails
    }

    res.json({
      success: true,
      message: `Successfully processed ${paymentData.invoiceVouchers.length} invoices`,
      paymentId: payment._id,
      summary: {
        invoiceCount: paymentData.invoiceVouchers.length,
        totalAmount: parsedAmount,
        subtotal: paymentData.summary?.subtotal || parsedAmount / 1.16,
        vat: paymentData.summary?.tax || parsedAmount * 0.16,
        currency: paymentData.currency || "USD",
      },
      organization: {
        id: paymentData.orgId,
        name: paymentData.orgName,
        email: paymentData.orgEmail,
      },
      invoices: paymentData.invoiceVouchers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Batch payment error:", error);
    res.status(500).json({
      success: false,
      error: "Payment processing failed",
      details: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
});

// Enhanced batch invoice download with validation
router.get(
  "/download-batch/:encodedData",
  async (req: Request, res: Response) => {
    try {
      const { encodedData } = req.params;

      if (!encodedData) {
        return res.status(400).json({ error: "Missing invoice data" });
      }

      // Decode the data
      let paymentData: PaymentLinkData;
      try {
        paymentData = decodePaymentData(encodedData);
      } catch (error) {
        return res.status(400).json({ error: "Invalid invoice data format" });
      }

      if (
        !paymentData.invoiceVouchers ||
        !paymentData.orgId ||
        !paymentData.orgName
      ) {
        return res
          .status(400)
          .json({ error: "Invalid invoice data structure" });
      }

      // Fetch organization with additional validation
      const organization = await Organization.findById(paymentData.orgId)
        .populate("createdBy", "id email name")
        .lean();

      if (!organization) {
        return res.status(404).json({
          error: "Organization not found",
          orgId: paymentData.orgId,
          orgName: paymentData.orgName,
        });
      }

      // Verify organization name matches
      if (organization.name !== paymentData.orgName) {
        console.warn(
          `Organization name mismatch: ${organization.name} vs ${paymentData.orgName}`,
        );
      }

      // Find invoices by vouchers with validation
      const invoices = await Invoice.find({
        accessVoucher: { $in: paymentData.invoiceVouchers },
        organization: paymentData.orgId,
      })
        .populate("organization", "name email")
        .populate("event", "title dateTime.start dateTime.end")
        .lean();

      if (invoices.length === 0) {
        return res.status(404).json({
          error: "No invoices found for the provided vouchers",
          vouchers: paymentData.invoiceVouchers,
          orgId: paymentData.orgId,
        });
      }

      // Convert to InvoiceWithItems format
      const detailedInvoices: InvoiceWithItems[] = invoices.map((inv) => ({
        ...inv,
        organization: inv.organization as any,
        total: inv.amount || 0,
        items: [],
        subtotal: inv.amount ? inv.amount / 1.16 : 0,
        taxAmount: inv.amount ? inv.amount * 0.16 : 0,
      }));

      // Generate PDF
      const pdfBuffer = await generateBatchInvoicePDF(detailedInvoices, {
        ...organization,
        name: paymentData.orgName, // Use the name from payment data
        email: paymentData.orgEmail || organization.email,
      });

      // Set response headers for PDF download
      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `${paymentData.orgName.replace(
        /[^a-z0-9]/gi,
        "_",
      )}_batch_invoice_${timestamp}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("Content-Length", pdfBuffer.length);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader(
        "X-Organization-Name",
        encodeURIComponent(paymentData.orgName),
      );
      res.setHeader("X-Invoice-Count", paymentData.invoiceVouchers.length);
      res.setHeader("X-Total-Amount", paymentData.totalAmount);

      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF download error:", error);
      res.status(500).json({
        error: "Failed to generate PDF",
        details: process.env.NODE_ENV === "development" ? error : undefined,
      });
    }
  },
);

// New endpoint to preview payment link data
router.get(
  "/preview-payment-data/:encodedData",
  async (req: Request, res: Response) => {
    try {
      const { encodedData } = req.params;

      if (!encodedData) {
        return res.status(400).json({ error: "No encoded data provided" });
      }

      const paymentData = decodePaymentData(encodedData);

      // Add additional data from database if needed
      const organization = await Organization.findById(paymentData.orgId)
        .select("name email contactEmail")
        .lean();

      const invoices = await Invoice.find({
        accessVoucher: { $in: paymentData.invoiceVouchers },
      })
        .select("invoiceNumber accessVoucher amount status issuedAt")
        .lean();

      res.json({
        success: true,
        paymentData: {
          ...paymentData,
          organization: organization || null,
          invoices: invoices.map((inv) => ({
            invoiceNumber: inv.invoiceNumber,
            accessVoucher: inv.accessVoucher,
            amount: inv.amount,
            status: inv.status,
            issuedAt: inv.issuedAt,
          })),
          paymentLink: generateDirectPaymentLink(paymentData),
          expiresAt: new Date(paymentData.timestamp + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });
    } catch (error) {
      console.error("Preview error:", error);
      res.status(400).json({
        success: false,
        error: "Invalid encoded data",
      });
    }
  },
);

export default router;
