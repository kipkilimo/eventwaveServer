// utils/emailHandler.ts
import nodemailer from "nodemailer";

export interface EmailAttachment {
  filename: string;
  path?: string; // File system path
  content?: Buffer | string; // In-memory content (Buffer for binary, string for base64)
  contentType?: string;
  encoding?: string;
}

/**
 * Sends an email using Brevo SMTP (Nodemailer)
 * @param to Recipient email(s)
 * @param subject Email subject
 * @param htmlContent HTML content of the email
 * @param attachments Optional attachments (supports both path and content)
 */
export const sendEmail = async (
  to: string | string[],
  subject: string,
  htmlContent: string,
  attachments: EmailAttachment[] = [],
): Promise<boolean> => {
  try {
    // Create SMTP transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false, // true for 465, false for 587 (STARTTLS)
      auth: {
        user: process.env.SMTP_USER, // Brevo relay user
        pass: process.env.SMTP_PASS, // Brevo SMTP key
      },
      logger: false, // for detailed connection logs
      debug: true,
    });

    // Email headers
    const mailOptions: any = {
      from: `"${process.env.APP_NAME || "Event Wave"}" <${process.env.MAIL_FROM}>`,
      replyTo: process.env.MAIL_FROM,
      to,
      subject,
      html: htmlContent,
    };

    // Process attachments to handle both path and content
    if (attachments.length > 0) {
      mailOptions.attachments = attachments
        .map((attachment) => {
          // If path is provided, use it (existing behavior)
          if (attachment.path) {
            return {
              filename: attachment.filename,
              path: attachment.path,
              contentType: attachment.contentType,
            };
          }
          // If content is provided (Buffer or string), use it
          else if (attachment.content) {
            return {
              filename: attachment.filename,
              content: attachment.content,
              contentType: attachment.contentType || "application/octet-stream",
              encoding: attachment.encoding,
            };
          }
          // Invalid attachment - missing both path and content
          console.warn(
            "Invalid attachment missing both path and content:",
            attachment.filename,
          );
          return null;
        })
        .filter(Boolean); // Remove null entries
    }

    // Send message
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email accepted by Brevo: ${info.messageId}`);
    return true;
  } catch (error: any) {
    console.error("❌ Email sending failed:", error.message || error);
    return false;
  }
};
