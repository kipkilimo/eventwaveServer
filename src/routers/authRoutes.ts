import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { User } from "../models/User";
import { Organization } from "../models/Organization";
import { generateToken } from "../utils/auth";
import { sendEmail } from "../utils/emailHandler";
import { emailFooter } from "../utils/emailFooter";

import { emailHeader } from "../utils/emailHeader";
// Comment out rate-limit for now if not installed
// import rateLimit from "express-rate-limit";

// -------------------------------------------------------
// 1. CONSTANTS & CONFIGURATION
// -------------------------------------------------------

const {
  AWS_REGION,
  AWS_ACCESS_KEY,
  AWS_SECRET_KEY,
  AWS_BUCKET_NAME,
  JWT_SECRET,
  CLIENT_DEV_URL,
  NODE_ENV,
} = process.env;

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

// Validation constants
const VALIDATION = {
  MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
  ALLOWED_MIME_TYPES: ["application/pdf"] as const,
  OBJECT_ID_REGEX: /^[0-9a-fA-F]{24}$/,
  MAGIC_TOKEN_EXPIRY: "1440m", // 24 hours
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 5,
} as const;

// -------------------------------------------------------
// 2. TYPES & INTERFACES
// -------------------------------------------------------

interface MulterS3File extends Express.Multer.File {
  location: string;
  key: string;
  bucket: string;
}

interface UploadQuery {
  orgId: string;
}

// Fixed: Use proper interface extension with correct generics
interface UploadRequest extends Request {
  query: UploadQuery & Request["query"];
  file?: MulterS3File;
}

interface MagicLinkPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

// -------------------------------------------------------
// 3. S3 CLIENT & STORAGE CONFIGURATION
// -------------------------------------------------------

const s3Client = new S3Client({
  region: AWS_REGION!,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY!,
    secretAccessKey: AWS_SECRET_KEY!,
  },
});

const s3Storage = multerS3({
  s3: s3Client,
  bucket: AWS_BUCKET_NAME!,
  metadata: (req, file, cb) => {
    const orgId = (req as UploadRequest).query.orgId;
    cb(null, { fieldName: file.fieldname, orgId });
  },
  key: (req, file, cb) => {
    const orgId = (req as UploadRequest).query.orgId;
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const timestamp = Date.now();
    const key = `organization/${orgId}/legal/${timestamp}-${sanitizedName}`;
    cb(null, key);
  },
  contentType: multerS3.AUTO_CONTENT_TYPE,
});

// Fixed: Proper fileFilter callback
const upload = multer({
  storage: s3Storage,
  limits: { fileSize: VALIDATION.MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const isValidType = VALIDATION.ALLOWED_MIME_TYPES.includes(
      file.mimetype as any,
    );
    if (isValidType) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed."));
    }
  },
});

// -------------------------------------------------------
// 4. MIDDLEWARE
// -------------------------------------------------------

const validateOrgId = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { orgId } = req.query;

  if (!orgId) {
    res.status(400).json({ message: "Organization ID is required." });
    return;
  }

  if (!VALIDATION.OBJECT_ID_REGEX.test(orgId as string)) {
    res.status(400).json({ message: "Invalid Organization ID format." });
    return;
  }

  next();
};

// Simple rate limiter alternative if express-rate-limit is not installed
const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  // This is a simple in-memory rate limiter
  // For production, consider using express-rate-limit or Redis
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = VALIDATION.RATE_LIMIT_WINDOW_MS;
  const maxRequests = VALIDATION.RATE_LIMIT_MAX_REQUESTS;

  // Store in memory (consider using Redis for production)
  if (!(global as any).rateLimitStore) {
    (global as any).rateLimitStore = new Map();
  }

  const store = (global as any).rateLimitStore;
  const userRequests = store.get(ip) || [];
  const recentRequests = userRequests.filter(
    (timestamp: number) => now - timestamp < windowMs,
  );

  if (recentRequests.length >= maxRequests) {
    res
      .status(429)
      .json({ message: "Too many requests. Please try again later." });
    return;
  }

  recentRequests.push(now);
  store.set(ip, recentRequests);
  next();
};

// -------------------------------------------------------
// 5. UTILITY FUNCTIONS
// -------------------------------------------------------

const cleanupS3File = async (file: MulterS3File): Promise<void> => {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: file.bucket || AWS_BUCKET_NAME!,
        Key: file.key,
      }),
    );
    console.log("🧹 Cleaned up S3 file after error");
  } catch (cleanupError) {
    console.error("❌ Failed to clean up S3 file:", cleanupError);
  }
};

const generateMagicLink = (userId: string): string => {
  const token = jwt.sign({ userId } as MagicLinkPayload, JWT_SECRET!, {
    expiresIn: VALIDATION.MAGIC_TOKEN_EXPIRY,
  });
  return `${CLIENT_DEV_URL}/auth/verify?token=${token}`;
};

const formatExpiryTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};
const getHoursRemaining = (expiryDate: Date): number => {
  const diffMs = expiryDate.getTime() - Date.now();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
};
const generateEmailHTML = (
  userName: string,
  magicLink: string,
  expiryDate: Date,
): string => {
  //const formattedExpiry = formatExpiryTime(expiryDate);
  const formattedExpiry = `in 3 hours (${formatExpiryTime(expiryDate)})`;
  // Use theme colors for consistent styling
  const primaryColor = theme.colors.primary;
  const primaryDark = theme.colors["primary-darken-1"];
  const secondaryColor = theme.colors.secondary;
  const backgroundColor = theme.colors.background;
  const surfaceColor = theme.colors.surface;
  const textColor = "#2c3e50";
  const textMuted = "#7f8c8d";

  return `<div style="margin:0; padding:0; background-color: ${backgroundColor};">
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

          <!-- Content -->
          <tr>
            <td style="padding: 24px 16px;">
              
              <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: ${textColor};">
                Welcome back, ${userName || "there"}! 👋
              </h2>

              <p style="margin: 0 0 20px 0; color: ${textMuted}; font-size: 14px;">
                Click the button below to securely access your EventWave dashboard.
              </p>

              <!-- Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${magicLink}"
                      style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 14px 24px; font-size: 15px; border-radius: 8px; font-weight: 500;">
                      ✨ Sign In to Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="background-color: ${backgroundColor}; padding: 14px; border-radius: 8px; border-left: 4px solid ${primaryColor};">
                    <p style="margin: 0; font-size: 13px; color: ${textColor};">
                      <strong>🔒 Security notice:</strong>
                      This link will expire 
                      <strong style="color: ${primaryColor};">${formattedExpiry}</strong>.
                      Do not share this link.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <div style="height: 1px; background-color: #e9ecef; margin: 20px 0;"></div>

              <!-- Fallback URL -->
              <p style="margin: 0 0 8px 0; font-size: 13px; color: ${textMuted};">
                Or copy this link:
              </p>

              <div style="background-color: ${backgroundColor}; color: ${primaryColor}; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; word-break: break-all; border: 1px solid #e9ecef;">
                ${magicLink}
              </div>

              <!-- Footer note -->
              <p style="margin: 20px 0 0 0; font-size: 12px; color: ${textMuted}; text-align: center;">
                Didn’t request this email? You can ignore it.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td>
              ${emailFooter.replace(
                'style="font-family: Arial, sans-serif; background-color: #f4f5f7; padding: 20px; text-align: center; color: #6c757d; font-size: 12px;"',
                `style="background-color: ${backgroundColor}; padding: 16px; text-align: center; color: ${textMuted}; font-size: 12px; border-top: 1px solid #e9ecef;"`,
              )}
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</div>
  `;
};

// -------------------------------------------------------
// 6. HANDLERS
// -------------------------------------------------------
// Helper function to get valid enum values for a field
const getValidEnumValues = (model: any, path: string): string[] => {
  try {
    const schemaPath = model.schema.path(path);
    if (schemaPath && schemaPath.enumValues) {
      return schemaPath.enumValues;
    }
    return [];
  } catch (error) {
    return [];
  }
};

const uploadOrgPDF = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const uploadReq = req as unknown as UploadRequest;
  const { orgId, documentType = "ENTERPRISE_CONTRACT" } = uploadReq.query; // Allow specifying type via query param

  try {
    // Validate organization exists
    const organization = await Organization.findById(orgId);
    if (!organization) {
      throw new Error("Organization not found.");
    }

    // Validate file upload
    const uploadedFile = uploadReq.file;
    if (!uploadedFile) {
      res
        .status(400)
        .json({ message: "PDF file is required or failed validation." });
      return;
    }

    // Validate document type against enum
    const validTypes = [
      "TERMS_OF_SERVICE",
      "PRIVACY_POLICY",
      "DATA_PROCESSING_AGREEMENT",
      "SERVICE_LEVEL_AGREEMENT",
      "ENTERPRISE_CONTRACT",
    ];

    const selectedType = documentType as string;
    if (!validTypes.includes(selectedType)) {
      // Cleanup uploaded file if validation fails
      await cleanupS3File(uploadedFile);
      res.status(400).json({
        message: `Invalid document type. Must be one of: ${validTypes.join(", ")}`,
      });
      return;
    }

    // Calculate next version number (as string)
    const currentDocuments = organization.orgLegalDocuments || [];
    const nextVersion = String(currentDocuments.length + 1);

    // Update database with correct schema fields
    const updatedOrg = await Organization.findByIdAndUpdate(
      orgId,
      {
        $push: {
          orgLegalDocuments: {
            type: selectedType,
            url: uploadedFile.location,
            version: nextVersion,
            signedAt: new Date(),
            // signedBy: req.user?.id, // Add if you have authenticated user
          },
        },
        updatedAt: new Date(),
      },
      { new: true, runValidators: true },
    ).select("name email orgLegalDocuments");

    res.status(200).json({
      message: "PDF uploaded successfully",
      url: uploadedFile.location,
      organization: updatedOrg?.name,
      documentType: selectedType,
      version: nextVersion,
    });
  } catch (err) {
    // Cleanup S3 file on error
    if ((req as unknown as UploadRequest).file) {
      await cleanupS3File((req as unknown as UploadRequest).file!);
    }
    next(err);
  }
};

const requestLinkHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      res.status(400).json({ message: "Valid email is required." });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Always return success to prevent email enumeration
    if (!user) {
      res.json({
        message:
          "If a user with that email exists, a magic link has been sent.",
      });
      return;
    }

    const magicLink = generateMagicLink(user.id);
    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const emailHTML = generateEmailHTML(user.name, magicLink, expiresAt);

    const emailSent = await sendEmail(
      user.email,
      "✨ Your EventWave Secure Access Link",
      emailHTML,
    );

    if (!emailSent) {
      throw new Error("Email delivery failed");
    }

    // Log successful request (without exposing user data)
    console.log(
      `Magic link sent to: ${user.email.substring(0, 3)}***@${user.email.split("@")[1]}`,
    );

    res.json({
      message: `A login link was sent successfully to ${email}. Open your email and use it to access EventWave`,
    });
  } catch (error) {
    console.error("Error in request-link:", error);
    res
      .status(500)
      .json({ message: "Internal server error. Please try again later." });
  }
};

const verifyTokenHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== "string") {
      res.status(400).json({ message: "Token is required." });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET!) as MagicLinkPayload;
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      res.status(401).json({ message: "Invalid or expired token." });
      return;
    }

    const sessionToken = generateToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token: sessionToken,
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      console.error(`JWT Verification Failed: ${error.message}`);
      res.status(401).json({
        message: "Invalid or expired link. Redirecting to login...",
        redirect: { url: "/login", delay: 4 },
      });
    } else {
      console.error("Error in verify:", error);
      res.status(500).json({ message: "Internal server error." });
    }
  }
};

const handleUploadError = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (error instanceof multer.MulterError) {
    const errorMessages: Record<string, string> = {
      LIMIT_FILE_SIZE: "File size too large. Maximum size is 20MB.",
      LIMIT_UNEXPECTED_FILE:
        "Unexpected file field. Please use 'file' as the field name.",
    };

    const message =
      errorMessages[error.code] || `Upload error: ${error.message}`;
    res.status(400).json({ message });
    return;
  }

  if (error.message?.includes("PDF files")) {
    res.status(400).json({ message: "Only PDF files are allowed." });
    return;
  }

  if (error.message?.includes("Organization not found")) {
    res.status(404).json({ message: error.message });
    return;
  }

  next(error);
};

// -------------------------------------------------------
// 7. ROUTER SETUP
// -------------------------------------------------------

const router = Router();

// Upload routes
router.post(
  "/uploads",
  validateOrgId,
  upload.single("file"),
  uploadOrgPDF,
  handleUploadError,
);

// Authentication routes with rate limiting
router.post("/request-link", rateLimiter, requestLinkHandler);
router.post("/verify", verifyTokenHandler);

// Health check endpoint (optional)
if (NODE_ENV === "development") {
  router.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
}

export default router;
