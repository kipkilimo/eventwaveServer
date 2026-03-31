// routes/auth.ts (optimized & compact version)
import express, { Request, Response } from "express";
import { User } from "../models/User";
import { Organization } from "../models/Organization";
import { Invoice } from "../models/Invoice";
import { sendEmail } from "../utils/emailHandler";

import { emailFooter } from "../utils/emailFooter";
import PDFDocument from "pdfkit";

const router = express.Router();

interface VoucherRequest {
  orgEmail: string;
  facilEmail: string;
}

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}
function generateVoucherWithAppendedCode(): {
  invoiceNumber: string;
  accessVoucher: string;
} {
  // Generate access voucher first (6 characters)
  const chars =
    "234562345623456NPRTVWRTVWY23456YABCDEFGHJKLMNP789ABCDEFGHJKLM789789789789";
  let accessVoucher = "";
  for (let i = 0; i < 6; i++) {
    accessVoucher += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Generate invoice number with access voucher appended
  const date = new Date();
  const timestamp = `${date.getFullYear()}${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;
  const invoiceNumber = `VOUCH-${timestamp}-${accessVoucher}`;

  return {
    invoiceNumber,
    accessVoucher,
  };
}
/**
 * Compact but effective PDF generation remved
 */
/**
 * Generate optimized invoice number
 */

function createVoucherEmail(
  organization: any,
  facilitator: any,
  invoice: any
): string {
  // Terms content
  const terms = [
    {
      title: "1. PAYMENT TERMS",
      content:
        "Payment is due on demand. Accepted payment methods include bank transfer and major credit cards. Late payments may incur fees as permitted by law.",
    },
    {
      title: "2. CURRENCY & TAXES",
      content: `All amounts are in ${invoice.currency}. Taxes are not included unless specified. The client is responsible for any applicable taxes, including but not limited to VAT, sales tax, or withholding tax.`,
    },
    {
      title: "3. SERVICE DELIVERY",
      content:
        "Platform access is granted immediately upon voucher redemption. Services are provided 'as-is' and availability is subject to platform maintenance schedules.",
    },
    {
      title: "4. REFUNDS & DISPUTES",
      content:
        "No refunds are provided after voucher redemption. Invoice disputes must be submitted within 7 days of receipt. All sales are final once services are accessed.",
    },
    {
      title: "5. INTELLECTUAL PROPERTY",
      content:
        "All intellectual property rights remain with Event Wave. Access to the platform is granted under limited license for the duration specified.",
    },
    {
      title: "6. LIABILITY",
      content:
        "Event Wave's liability is limited to the amount paid for services. We are not liable for indirect, incidental, or consequential damages.",
    },
    {
      title: "7. CONFIDENTIALITY",
      content:
        "All business and financial information contained in this invoice is confidential and may not be disclosed without written consent.",
    },
    {
      title: "8. GOVERNING LAW",
      content:
        "This agreement is governed by the laws of the jurisdiction where Event Wave is incorporated. Any disputes shall be resolved through arbitration.",
    },
    {
      title: "9. ACCEPTANCE",
      content:
        "By using the access voucher or making payment, the client agrees to these terms and conditions in full.",
    },
  ];
  // Configuration options to achieve the desired DATETIME_MED_WITH_WEEKDAY format.
  // The browser automatically handles the 'only 12-hour if the locale is' requirement
  // by using the locale's preferred hour cycle (12-hour with AM/PM for en-US, 24-hour for many others).
  const dateFormatOptions = {
    weekday: "short", // e.g., 'Fri'
    year: "numeric", // e.g., '1983'
    month: "short", // e.g., 'Oct'
    day: "numeric", // e.g., '14'
    hour: "numeric", // e.g., '9'
    minute: "2-digit", // e.g., '30'
    // To explicitly force 12-hour format for the example output:
    hour12: true,
  };

  // You can set the locale (e.g., 'en-US') or leave it undefined to use the user's default locale.
  const locale = "en-US";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
    
    /* Reset */
    body, table, td, div, p {
      margin: 0;
      padding: 0;
      border: 0;
      font-size: 100%;
      font: inherit;
      vertical-align: baseline;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 0;
      color: #334155;
      width: 100% !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    
    .email-wrapper {
      width: 100%;
      max-width: 100%;
      background-color: #f8fafc;
    }
    
    .email-container {
      width: 100%;
      max-width: 600px;
      border-radius:5px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    
    .header {
      background: linear-gradient(135deg, #1867C0 0%, #3450a1 100%);
      color: white;
      padding: 40px 32px;
      text-align: center;
      width: 100%;
      box-sizing: border-box;
    }
    
    .logo-container {
      margin-bottom: 24px;
    }
    
    .logo {
      max-width: 200px;
      height: auto;
    }
    
    .content {
      padding: 40px 32px;
      width: 100%;
      box-sizing: border-box;
    }
    
    .voucher-box {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
      padding: 32px 24px;
      text-align: center;
      margin: 32px 0;
      width: 100%;
      box-sizing: border-box;
    }
    
    .voucher-code {
      font-size: 28px;
      font-weight: 700;
      color: #1867C0;
      letter-spacing: 2px;
      margin: 12px 0;
      font-family: 'Courier New', monospace;
    }
    
    .amount {
      font-size: 16px;
      color: #64748b;
      font-weight: 500;
    }
    
    .info-grid {
      width: 100%;
      margin: 32px 0;
      border-collapse: collapse;
    }
    
    .info-item {
      background: #f8fafc;
      padding: 16px;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    
    .label {
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    
    .value {
      font-size: 15px;
      color: #1e293b;
      font-weight: 600;
    }
    
    .note-box {
      background: #f1f5f9;
      padding: 20px;
      border-radius: 6px;
      border-left: 4px solid #1867C0;
      margin: 32px 0;
      width: 100%;
      box-sizing: border-box;
    }
    
    .terms-section {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      margin: 32px -32px -40px -32px;
      padding: 24px 32px;
      font-size: 11px;
      line-height: 1.4;
      color: #64748b;
    }
    
    .terms-title {
      font-size: 10px;
      color: #475569;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
      text-align: center;
    }
    
    .terms-content {
      max-height: 200px;
      overflow-y: auto;
      padding-right: 8px;
    }
    
    .terms-content::-webkit-scrollbar {
      width: 4px;
    }
    
    .terms-content::-webkit-scrollbar-track {
      background: #f1f5f9;
    }
    
    .terms-content::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 2px;
    }
    
    .term-item {
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    
    .term-item:last-child {
      margin-bottom: 0;
    }
    
    .term-title {
      font-weight: 600;
      color: #475569;
      margin-bottom: 2px;
      font-size: 11px;
    }
    
    .term-text {
      font-size: 10px;
      color: #64748b;
    }
    
    .footer {
      background: #f1f5f9;
      padding: 40px 32px;
      text-align: center;
      font-size: 13px;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      width: 100%;
      box-sizing: border-box;
    }
    
    .footer-links {
      margin: 20px 0;
    }
    
    .footer-link {
      color: #1867C0;
      text-decoration: none;
      margin: 0 12px;
      font-weight: 500;
    }
    
    .footer-separator {
      color: #cbd5e1;
      margin: 0 8px;
    }
    
    .copyright {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 20px;
    }
    
    /* Responsive */
    @media only screen and (max-width: 620px) {
      .header, .content, .footer {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      
      .terms-section {
        margin-left: -20px !important;
        margin-right: -20px !important;
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      
      .voucher-code {
        font-size: 24px !important;
        letter-spacing: 1px !important;
      }
      
      .info-grid {
        display: block !important;
      }
      
      .info-item {
        display: block !important;
        width: 100% !important;
        margin-bottom: 12px !important;
      }
    }
    
    @media only screen and (max-width: 480px) {
      .voucher-code {
        font-size: 20px !important;
      }
      
      .terms-content {
        max-height: 150px;
      }
      
      .footer-link {
        display: block !important;
        margin: 8px 0 !important;
      }
      
      .footer-separator {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <!-- Header -->
      <div class="header" width="100%">
        <div class="logo-container">
          <img src="cid:countysquareLogo" alt="Event Wave" class="logo" width="200">
        </div>
        <h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Access Voucher Issued</h1>
        <p style="margin: 8px 0 0 0; opacity: 0.95; font-size: 15px; font-weight: 400;">Invoice ${
          invoice.invoiceNumber
        }</p>
      </div>
      
      <!-- Content -->
      <div class="content" width="100%">
        <p style="margin-bottom: 24px; font-size: 16px; line-height: 1.6;">Hello <strong style="color: #1867C0;">${
          organization.name
        }</strong>,</p>
        
        <p style="margin-bottom: 24px; font-size: 16px; line-height: 1.6;">Your access voucher has been generated and is ready for use. Below are the details:</p>
        
        <!-- Voucher Box -->
        <div class="voucher-box" width="100%">
          <div style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-bottom: 8px;">Access Voucher Code</div>
          <div class="voucher-code">${invoice.accessVoucher}</div>
          <div class="amount">${
            invoice.currency
          } ${Number(process.env.PRO_DAILY_RATE)} per day • Final amount: TBD</div>
        </div>
        
        <!-- Info Grid -->
        <table class="info-grid" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" style="padding-right: 8px; vertical-align: top;">
              <div class="info-item">
                <div class="label">Issued To</div>
                <div class="value">${organization.name}</div>
              </div>
            </td>
            <td width="50%" style="padding-left: 8px; vertical-align: top;">
              <div class="info-item">
                <div class="label">Facilitator</div>
                <div class="value">${
                  facilitator.name || facilitator.email
                }</div>
              </div>
            </td>
          </tr>
          <tr>
            <td width="50%" style="padding-right: 8px; vertical-align: top; padding-top: 12px;">
              <div class="info-item">
                <div class="label">Issue Date</div>
                <div class="value">${invoice.issuedAt.toLocaleDateString(
                  locale,
                  dateFormatOptions
                )}</div>
              </div>
            </td>
            <td width="50%" style="padding-left: 8px; vertical-align: top; padding-top: 12px;">
              <div class="info-item">
                <div class="label">Status</div>
                <div class="value" style="color: ${
                  invoice.status === "VOID" ? "#64748b" : "#10b981"
                };">
                  ${invoice.status}
                </div>
              </div>
            </td>
          </tr>
        </table>
        
        <!-- Note Box -->
        <div class="note-box" width="100%">
          <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #334155;">
            <strong style="color: #1867C0;">Note:</strong> This voucher provides temporary platform access. The code is unique and single-use. Full terms and conditions are included below.
          </p>
        </div>
        
        <!-- Terms & Conditions Section -->
        <div class="terms-section" width="100%">
          <div class="terms-title">Terms & Conditions</div>
          <div class="terms-content">
            ${terms
              .map(
                (term) => `
              <div class="term-item">
                <div class="term-title">${term.title}</div>
                <div class="term-text">${term.content}</div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
        
        <!-- Closing -->
        <p style="margin: 32px 0 16px 0; font-size: 16px; line-height: 1.6;">If you have any questions, please contact our support team.</p>
        
        <p style="margin: 32px 0 0 0; font-size: 16px; line-height: 1.6;">
          Best regards,<br>
          <strong style="color: #1867C0;">The Event Wave Team</strong>
        </p>
      </div>
      
      <!-- Footer --> 
           ${emailFooter} 
    </div>
  </div>
</body>
</html>
`.trim();
}

/**
 * @route POST /auth/create-voucher
 * @desc Create and email voucher - Optimized version
 */
router.post("/create-voucher", async (req: Request, res: Response) => {
  try {
    const { orgEmail, facilEmail }: VoucherRequest = req.body;

    // Quick validation
    if (!orgEmail?.trim() || !facilEmail?.trim()) {
      return res
        .status(400)
        .json({ message: "Organization and facilitator emails required." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(orgEmail) || !emailRegex.test(facilEmail)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    // Parallel database lookups
    const [organization, facilitator] = await Promise.all([
      Organization.findOne({
        email: orgEmail.trim().toLowerCase(),
        isBlocked: false,
      }),
      User.findOne({ email: facilEmail.trim().toLowerCase() }).select(
        "-password"
      ),
    ]);

    if (!organization || !facilitator) {
      return res.status(404).json({
        message: `${!organization ? "Organization" : "Facilitator"} not found.`,
      });
    }
    const voucher = generateVoucherWithAppendedCode();
    console.log(voucher.invoiceNumber); // e.g., "VOUCH-20231215-N7K3P9"
    console.log(voucher.accessVoucher); // e.g., "N7K3P9"
    // Create invoice with minimal data
    const invoice = new Invoice({
      organization: organization.id,
      invoiceNumber: voucher.invoiceNumber,
      currency: "USD",
      amount: 0,
      status: "VOID",
      issuedAt: new Date(),
      accessVoucher: voucher.accessVoucher, // Store the generated voucher code
      // Add any other voucher-specific fields
    });

    await invoice.save();

    // Update organization (non-blocking)
    Organization.findByIdAndUpdate(organization._id, {
      $push: { invoices: invoice._id },
    }).catch(console.error);

    // Generate PDF and send emails in parallel
    // const [pdfBuffer] = await Promise.all([
    //   generateInvoicePdf({ invoice, organization, facilitator }),
    // ]);

    const subject = `Voucher ${invoice.invoiceNumber} - Event Wave`;
    const htmlContent = createVoucherEmail(organization, facilitator, invoice);
    const attachments: EmailAttachment[] = [
      // {
      //   filename: `voucher-${invoice.invoiceNumber}.pdf`,
      //   content: pdfBuffer,
      //   contentType: "application/pdf",
      // },
    ];

    // Send emails (fire and forget for better response time)
    Promise.allSettled([
      sendEmail(organization.email, subject, htmlContent, attachments),
      sendEmail(facilitator.email, subject, htmlContent, attachments),
    ]).then(([orgResult, facilResult]) => {
      const orgSent = orgResult.status === "fulfilled" && orgResult.value;
      const facilSent = facilResult.status === "fulfilled" && facilResult.value;

      // Update invoice status in background
      if (orgSent || facilSent) {
        Invoice.findByIdAndUpdate(invoice.id, {
          lastSentAt: new Date(),
          lastSentTo: [organization.email, facilitator.email],
          emailStatus: { organization: orgSent, facilitator: facilSent },
        }).catch(console.error);
      }
    });

    // Immediate response - don't wait for emails
    return res.json({
      message: "Voucher created successfully. Emails are being sent.",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      accessVoucher: invoice.accessVoucher,
    });
  } catch (error: any) {
    console.error("Voucher creation error:", error);

    const statusCode =
      error.name === "ValidationError" ? 400 : error.code === 11000 ? 409 : 500;

    return res.status(statusCode).json({
      message:
        statusCode === 500
          ? "Service temporarily unavailable. Please try again."
          : error.message,
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    });
  }
});

/**
 * @route POST /organization/generate-voucher
 * @desc Create vouchers for multiple email recipients and send emails
 */
router.post("/generate-voucher", async (req: Request, res: Response) => {
  const {
    orgId,
    adminId,
    emails,
  }: { orgId: string; adminId: string; emails: string[] } = req.body;
  console.log({ orgId, adminId, emails });
  // --- 1. Input Validation ---
  if (
    !orgId?.trim() ||
    !emails ||
    !Array.isArray(emails) ||
    emails.length === 0
  ) {
    return res.status(400).json({
      message: "Organization ID and at least one recipient email are required.",
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Use map/trim/toLowerCase first for normalization before validation/filtering
  const normalizedEmails = emails
    .map((email) => email?.trim()?.toLowerCase())
    .filter(Boolean);

  const invalidEmails = normalizedEmails.filter(
    (email) => !emailRegex.test(email)
  );
  if (invalidEmails.length > 0) {
    return res.status(400).json({
      message: `Invalid email format: ${invalidEmails.join(", ")}`,
    });
  }

  // Deduplicate emails to prevent multiple vouchers for the same email
  const uniqueNormalizedEmails = [...new Set(normalizedEmails)];

  try {
    // --- 2. Data Retrieval ---
    // Optimized parallel lookups
    const [organization, facilitator] = await Promise.all([
      // Organization lookup
      Organization.findOne({
        _id: orgId,
        isBlocked: false,
      })
        .select("name email invoices") // Only needed fields
        .lean(),

      // User lookup - fixed syntax
      User.findOne({ _id: adminId })
        .select("-password") // Proper field exclusion
        .lean(),
    ]);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found or blocked.",
      });
    }

    // --- 3. Voucher Creation and Email Preparation ---
    const voucherPromises = uniqueNormalizedEmails.map(
      async (recipientEmail) => {
        try {
          // Generate unique voucher code
          const voucher = generateVoucherWithAppendedCode();
          console.log(voucher.invoiceNumber); // e.g., "VOUCH-20231215-N7K3P9"
          console.log(voucher.accessVoucher); // e.g., "N7K3P9"
          // Create invoice/voucher record
          const invoice = new Invoice({
            organization: organization._id,
            invoiceNumber: voucher.invoiceNumber,
            currency: "USD",
            amount: 0,
            status: "VOID",
            issuedAt: new Date(),
            accessVoucher: voucher.accessVoucher, // Store the generated voucher code
            // Add any other voucher-specific fields
          });

          await invoice.save();
          console.log({
            invoice,
            organization,
            facilitator,
          });
          // Update organization (non-blocking)
          Organization.findByIdAndUpdate(organization._id, {
            $push: { invoices: invoice._id },
          }).catch((e) =>
            console.error(
              `Error updating organization ${organization._id} with invoice ${invoice._id}:`,
              e
            )
          );

          // Generate PDF with voucher details

          // Prepare email content
          const subject = `Voucher ${invoice.invoiceNumber} - Event Wave`;
          const htmlContent = createVoucherEmail(
            organization,
            facilitator,
            invoice
          );

          const attachments = [
            // {
            //   filename: `voucher-${invoice.invoiceNumber}.pdf`,
            //   content: pdfBuffer,
            //   contentType: "application/pdf",
            // },
          ];

          // Return structured data for email processing and final response
          return {
            recipientEmail: recipientEmail,
            invoiceId: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            accessVoucher: invoice.accessVoucher,
            success: true,
            emailData: {
              recipientEmail: recipientEmail,
              organizationEmail: organization.email,
              subject,
              htmlContent,
              attachments,
              invoiceId: invoice._id,
            },
          };
        } catch (error) {
          console.error(`Error creating voucher for ${recipientEmail}:`, error);
          const errorMessage =
            error instanceof Error
              ? error.message
              : "An unknown error occurred.";
          return {
            recipientEmail: recipientEmail,
            success: false,
            error: errorMessage,
          };
        }
      }
    );

    // Run all voucher creation steps in parallel, wait for results
    const creationResults = await Promise.allSettled(voucherPromises);

    const results = creationResults.map((r) =>
      r.status === "fulfilled" ? r.value : r.reason
    );

    // Separate successes from failures for email dispatch
    const successfulResults = results.filter((r) => r.success && r.emailData);
    const failedResults = results.filter((r) => !r.success);

    // --- 4. Background Email Sending (Fire and Forget) ---
    const emailPromises = successfulResults.flatMap((result) => {
      const {
        recipientEmail,
        organizationEmail,
        subject,
        htmlContent,
        attachments,
        invoiceId,
      } = result.emailData;

      // Send email to recipient
      const recipientEmailPromise = sendEmail(
        recipientEmail,
        subject,
        htmlContent,
        attachments
      )
        .then(() => ({
          recipient: "voucher_recipient",
          email: recipientEmail,
          success: true,
          invoiceId,
        }))
        .catch((e) => {
          console.error(
            `Email error to recipient ${recipientEmail} for invoice ${invoiceId}:`,
            e
          );
          return {
            recipient: "voucher_recipient",
            email: recipientEmail,
            success: false,
            invoiceId,
          };
        });

      // Optional: Also send to organization for their records
      const orgEmailPromise = sendEmail(
        organizationEmail,
        `Copy: ${subject}`,
        htmlContent,
        attachments
      )
        .then(() => ({
          recipient: "organization",
          email: organizationEmail,
          success: true,
          invoiceId,
        }))
        .catch((e) => {
          console.error(
            `Email error to organization ${organizationEmail} for invoice ${invoiceId}:`,
            e
          );
          return {
            recipient: "organization",
            email: organizationEmail,
            success: false,
            invoiceId,
          };
        });

      return [recipientEmailPromise, orgEmailPromise];
    });

    // Run all email sends in the background using Promise.allSettled
    if (emailPromises.length > 0) {
      Promise.allSettled(emailPromises)
        .then((emailResults) => {
          // Group results by invoiceId to update Invoice model
          const updatePromises = new Map();

          emailResults.forEach((r) => {
            if (r.status === "fulfilled") {
              const { recipient, email, success, invoiceId } = r.value;

              if (!updatePromises.has(invoiceId)) {
                updatePromises.set(invoiceId, {
                  lastSentAt: new Date(),
                  lastSentTo: new Set(),
                  emailStatus: {},
                });
              }

              const updateData = updatePromises.get(invoiceId);
              updateData.lastSentTo.add(email);
              updateData.emailStatus[recipient] = success;
            }
          });

          // Execute background updates
          const finalUpdatePromises = [...updatePromises.entries()].map(
            ([invoiceId, data]) => {
              return Invoice.findByIdAndUpdate(invoiceId, {
                lastSentAt: data.lastSentAt,
                lastSentTo: [...data.lastSentTo],
                emailStatus: data.emailStatus,
              }).catch((e) =>
                console.error(
                  `Error updating invoice status for ${invoiceId}:`,
                  e
                )
              );
            }
          );

          return Promise.allSettled(finalUpdatePromises);
        })
        .then(() => {
          console.log(
            `Background email sending and status update completed for ${successfulResults.length} vouchers.`
          );
        })
        .catch((error) => {
          console.error(
            "Critical error in email sending background process:",
            error
          );
        });
    }

    // --- 5. Immediate Response ---
    // Remove emailData from successful results before sending the response
    const sanitizedResults = results.map((r) => {
      const cleaned = { ...r };
      delete cleaned.emailData;
      return cleaned;
    });

    return res.json({
      message: `Vouchers created for ${successfulResults.length} out of ${uniqueNormalizedEmails.length} recipients. Emails are being sent.`,
      successCount: successfulResults.length,
      failureCount: failedResults.length,
      results: sanitizedResults,
      summary: {
        organization: {
          id: organization._id,
          name: organization.name,
          email: organization.email,
        },
        totalProcessed: uniqueNormalizedEmails.length,
        totalCreated: successfulResults.length,
      },
    });
  } catch (error: unknown) {
    console.error("Voucher generation error:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown server error occurred.";
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.name === "ValidationError") {
        statusCode = 400;
      }
      if ((error as any).code === 11000) {
        statusCode = 409;
      }
    }

    return res.status(statusCode).json({
      message:
        statusCode === 500
          ? "Service temporarily unavailable. Please try again."
          : errorMessage,
      ...(process.env.NODE_ENV === "development" && {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      }),
    });
  }
});
/**
 * @route PUT /api/organizations/publish
 * @desc Publish an organization by setting isBlocked to false
 * @access Private (Admin only - middleware required)
 */
router.put("/publish", async (req: Request, res: Response) => {
  console.log("update hit");
  // 1. Get orgId from the query parameters
  // The client sends: /api/organizations/publish?orgId=someid
  const { orgId } = req.query;

  // 2. Get updateData from the request body
  // The client sends: { isBlocked: false }
  const updateData = req.body;

  // Basic validation
  if (!orgId || typeof orgId !== "string") {
    return res.status(400).json({
      msg: "Organization ID (orgId) is missing or invalid in the query parameters.",
    });
  }

  // Ensure only allowed fields are updated (security best practice)
  if (
    Object.keys(updateData).length === 0 ||
    updateData.isBlocked === undefined
  ) {
    return res
      .status(400)
      .json({ msg: "Missing or invalid update data in request body." });
  }

  try {
    // 3. Find the organization and update it in the database
    // Assuming you are using Mongoose/MongoDB:
    const updatedOrganization = await Organization.findByIdAndUpdate(
      orgId,
      { $set: { isBlocked: updateData.isBlocked } }, // Apply the specific update
      { new: true } // Return the updated document
    );

    if (!updatedOrganization) {
      return res.status(404).json({ msg: "Organization not found." });
    }

    // 4. Success response
    return res.status(200).json({
      msg: "Organization published successfully.",
      organization: updatedOrganization,
    });
  } catch (error) {
    console.error("Error publishing organization:", error);
    // 5. Handle potential server errors (e.g., database connection issues)
    return res.status(500).json({ msg: "Server Error" });
  }
});
export default router;
