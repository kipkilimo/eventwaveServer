import { Organization } from "../../models/Organization";
import { User } from "../../models/User";
import { requireAuth } from "../../utils/auth";

// ============================
// Helper: User
// ============================

// ============================
// Helper: Event
// (Add fields as needed)
// ============================

// ============================
// Helper: Organization
// ============================
const normalizeOrg = (org: any) => {
  if (!org) return null;

  return {
    ...org,
    id: org._id?.toString?.() || org.id?.toString?.() || null,
    // Remove _id to avoid confusion
    _id: undefined,
  };
};

// ============================
// Helper: User
// ============================
const normalizeUser = (user: any) => {
  if (!user) return null;

  return {
    ...user,
    id: user._id?.toString?.() || user.id?.toString?.() || null,
    _id: undefined,
  };
};

// ============================
// Helper: Invoice
// ============================
const normalizeInvoice = (invoice: any) => {
  if (!invoice) return null;

  return {
    ...invoice,
    id: invoice._id?.toString?.() || invoice.id?.toString?.() || null,
    _id: undefined,
  };
};

// ============================
// Helper: Event
// ============================
const normalizeEvent = (event: any) => {
  if (!event) return null;

  return {
    ...event,
    id: event._id?.toString?.() || event.id?.toString?.() || null,
    _id: undefined,
  };
};

// ============================
// Helper: Payment
// ============================
const normalizePayment = (payment: any) => {
  if (!payment) return null;

  return {
    ...payment,
    id: payment._id?.toString?.() || payment.id?.toString?.() || null,
    _id: undefined,
  };
};

const Query = {
  // ============================
  // GET PAGINATED ORGANIZATIONS
  // ============================
  async organizationsPaginated(
    _: any,
    { page = 1, limit = 10 }: any,
    context: any,
  ) {
    const logger = context?.logger || console;
    const operation = "organizationsPaginated";

    const startTime = Date.now();
    logger.info(`[${operation}] Starting paginated fetch`, {
      page,
      limit,
      timestamp: new Date().toISOString(),
    });

    try {
      const skip = (page - 1) * limit;

      logger.debug(`[${operation}] Counting total organizations...`);
      const total = await Organization.countDocuments().maxTimeMS(20000);

      logger.debug(`[${operation}] Querying organizations`, {
        skip,
        limit,
      });

      // Fixed: Remove duplicate declaration and incorrect syntax
      const orgs = await Organization.find()
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "id name email phone role")
        .populate("users", "id name email phone role")
        .populate("admins", "id name email phone role")
        .populate("events", "id title description status")
        .populate("invoices", "id invoiceNumber amount status")
        .populate("payments", "id amount status method")
        .lean({ virtuals: true })
        .maxTimeMS(30000)
        .setOptions({ sanitizeFilter: true });

      logger.info(`[${operation}] Query successful`, {
        returned: orgs.length,
        total,
        timestamp: new Date().toISOString(),
      });

      // Normalize like in myOrganizations()
      const normalized = orgs.map((org) => {
        const normalizedOrg = normalizeOrg(org);

        if (normalizedOrg.createdBy) {
          normalizedOrg.createdBy = normalizeUser(normalizedOrg.createdBy);
        }

        if (Array.isArray(normalizedOrg.admins)) {
          normalizedOrg.admins = normalizedOrg.admins.map(normalizeUser);
        }

        if (Array.isArray(normalizedOrg.users)) {
          normalizedOrg.users = normalizedOrg.users.map(normalizeUser);
        }

        if (Array.isArray(normalizedOrg.invoices)) {
          normalizedOrg.invoices = normalizedOrg.invoices.map(normalizeInvoice);
        }

        if (Array.isArray(normalizedOrg.events)) {
          normalizedOrg.events = normalizedOrg.events.map(normalizeEvent);
        }

        if (Array.isArray(normalizedOrg.payments)) {
          normalizedOrg.payments = normalizedOrg.payments.map(normalizePayment);
        }

        return normalizedOrg;
      });

      logger.debug(
        `[${operation}] Normalized ${normalized.length} organizations`,
      );

      return {
        data: normalized,
        total,
        page,
        limit,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error(`[${operation}] Error fetching paginated organizations`, {
        error,
        executionTime: `${executionTime}ms`,
        timestamp: new Date().toISOString(),
      });

      throw new Error(
        "Unable to load organizations due to an internal server error.",
      );
    }
  },
  myOrganizations: async (_: any, { userId }, context) => {
    const logger = context?.logger || console;
    const startTime = Date.now();
    const operation = "myOrganizations";

    logger.info(`[${operation}] Starting execution for user: ${userId}`, {
      userId,
      timestamp: new Date().toISOString(),
    });

    if (!userId) {
      logger.warn(`[${operation}] No userId provided, returning empty array`);
      return [];
    }

    try {
      logger.debug(
        `[${operation}] Querying organizations for user: ${userId}`,
        {
          userId,
          query: { admins: userId },
        },
      );

      // Fixed: Remove .select() to get ALL fields (including autoRenew)
      const orgs = await Organization.find({ admins: userId })
        .populate("createdBy", "id name email phone role")
        .populate("users", "id name email phone role")
        .populate("admins", "id name email phone role")
        .populate("invoices", "id invoiceNumber amount status")
        .populate("events", "id title description status")
        .populate("payments", "id amount status method")
        .lean()
        .maxTimeMS(30000)
        .setOptions({ sanitizeFilter: true });

      const executionTime = Date.now() - startTime;

      logger.info(`[${operation}] Successfully fetched organizations`, {
        userId,
        orgCount: orgs.length,
        executionTime: `${executionTime}ms`,
        timestamp: new Date().toISOString(),
      });

      if (orgs.length > 0) {
        logger.debug(`[${operation}] Organization details`, {
          userId,
          orgIds: orgs.map((org) => org._id || org.id),
          orgNames: orgs.map((org) => org.name),
        });
      } else {
        logger.debug(
          `[${operation}] No organizations found for user: ${userId}`,
        );
      }

      // Normalize each organization and its populated fields
      const normalizedOrgs = orgs.map((org) => {
        const normalizedOrg = normalizeOrg(org);

        // Normalize populated fields
        if (normalizedOrg.createdBy) {
          normalizedOrg.createdBy = normalizeUser(normalizedOrg.createdBy);
        }

        if (normalizedOrg.admins && Array.isArray(normalizedOrg.admins)) {
          normalizedOrg.admins = normalizedOrg.admins.map(normalizeUser);
        }

        if (normalizedOrg.users && Array.isArray(normalizedOrg.users)) {
          normalizedOrg.users = normalizedOrg.users.map(normalizeUser);
        }

        if (normalizedOrg.invoices && Array.isArray(normalizedOrg.invoices)) {
          normalizedOrg.invoices = normalizedOrg.invoices.map(normalizeInvoice);
        }

        if (normalizedOrg.events && Array.isArray(normalizedOrg.events)) {
          normalizedOrg.events = normalizedOrg.events.map(normalizeEvent);
        }

        if (normalizedOrg.payments && Array.isArray(normalizedOrg.payments)) {
          normalizedOrg.payments = normalizedOrg.payments.map(normalizePayment);
        }

        return normalizedOrg;
      });

      // Log normalization details for debugging
      logger.debug(
        `[${operation}] Normalized ${normalizedOrgs.length} organizations with all nested models`,
      );

      if (normalizedOrgs.length > 0) {
        const firstOrg = normalizedOrgs[0];
        logger.debug(
          `[${operation}] Sample normalized organization structure`,
          {
            orgId: firstOrg.id,
            hasCreatedBy: !!firstOrg.createdBy,
            createdById: firstOrg.createdBy?.id || "null",
            adminCount: firstOrg.admins?.length || 0,
            userCount: firstOrg.users?.length || 0,
            invoiceCount: firstOrg.invoices?.length || 0,
            eventCount: firstOrg.events?.length || 0,
            paymentCount: firstOrg.payments?.length || 0,
          },
        );
      }

      return normalizedOrgs;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error(
        `[${operation}] Error fetching organizations for user: ${userId}`,
        {
          userId,
          error: error,
          errorName: error,
          executionTime: `${executionTime}ms`,
          timestamp: new Date().toISOString(),
        },
      );

      throw new Error(
        "Unable to fetch organizations due to an internal error.",
      );
    }
  },
  organization: async (_: any, { id }: any, context: any) => {
    const logger = context?.logger || console;
    const operation = "organization";

    logger.info(`[${operation}] Fetching organization: ${id}`);

    try {
      const org = await Organization.findById(id)
        .populate("createdBy", "id name email phone role")
        .populate("users", "id name email phone role")
        .populate("admins", "id name email phone role")
        .populate("events", "id title description status")
        .populate("invoices", "id invoiceNumber amount status")
        .populate("payments", "id amount status method")
        .lean();

      if (!org) {
        logger.warn(`[${operation}] Organization not found: ${id}`);
        return null;
      }

      const normalizedOrg = normalizeOrg(org);

      if (normalizedOrg.createdBy) {
        normalizedOrg.createdBy = normalizeUser(normalizedOrg.createdBy);
      }

      if (Array.isArray(normalizedOrg.admins)) {
        normalizedOrg.admins = normalizedOrg.admins.map(normalizeUser);
      }

      if (Array.isArray(normalizedOrg.users)) {
        normalizedOrg.users = normalizedOrg.users.map(normalizeUser);
      }

      if (Array.isArray(normalizedOrg.invoices)) {
        normalizedOrg.invoices = normalizedOrg.invoices.map(normalizeInvoice);
      }

      if (Array.isArray(normalizedOrg.events)) {
        normalizedOrg.events = normalizedOrg.events.map(normalizeEvent);
      }

      if (Array.isArray(normalizedOrg.payments)) {
        normalizedOrg.payments = normalizedOrg.payments.map(normalizePayment);
      }

      return normalizedOrg;
    } catch (error) {
      logger.error(`[${operation}] Error fetching organization: ${id}`, error);
      throw new Error("Unable to fetch organization due to an internal error.");
    }
  },
};

const Mutation = {
  /**
   * Express Create Organization - Simplified creation with minimal checks
   * Designed for quick organization setup with basic validation
   */
  expressCreateOrganization: async (_: any, { input }: any, { user }: any) => {
    const logger = console;
    const operation = "expressCreateOrganization";

    logger.info(`[${operation}] Starting express organization creation`);
    logger.debug(`[${operation}] Input:`, input);
    logger.debug(`[${operation}] User:`, user);

    try {
      // Validate user exists
      const currentUser = await User.findOne({
        _id: user?.id || input.createdBy,
      });

      if (!currentUser) {
        logger.error(`[${operation}] User not found`);
        throw new Error("User not found. Unable to create organization.");
      }

      // ============================
      // 📋 EXPRESS MODE: Minimal validation
      // ============================

      // Only validate required fields
      if (!input.name) {
        throw new Error("Organization name is required");
      }

      if (!input.email) {
        throw new Error("Organization email is required");
      }

      // ============================
      // 🚀 Create organization with default values
      // ============================
      const orgData = {
        name: input.name,
        email: input.email,
        orgType: input.orgType || "OTHER",
        isBlocked: false, // Express orgs are auto-approved
        subscriptionTier: input.subscriptionTier || "BASIC",
        maxEvents: input.maxEvents || 10000,
        maxParticipants: input.maxParticipants || 10000,
        createdBy: currentUser.id,
        users: [currentUser.id],
        admins: [currentUser.id],
        // Express specific fields
        expressCreated: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add optional fields if provided

      const org = await Organization.create(orgData);

      // Update user's organization list
      if (currentUser.organizations) {
        currentUser.organizations = [...currentUser.organizations, org.id];
      } else {
        currentUser.organizations = [org.id];
      }

      // NOTE: Role elevation removed - will be handled at event level
      // No role changes here

      await currentUser.save();

      logger.info(`[${operation}] Express organization created successfully`, {
        orgId: org.id,
        orgName: org.name,
        userId: currentUser.id,
      });

      // Populate and return the created organization
      const populatedOrg = await Organization.findById(org.id)
        .populate("createdBy", "id name email phone role")
        .populate("users", "id name email phone role")
        .populate("admins", "id name email phone role")
        .lean();

      return normalizeOrg(populatedOrg);
    } catch (error) {
      logger.error(
        `[${operation}] Error creating express organization:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Standard Create Organization - Full validation and checks
   * Includes admin limit checks, role-based permissions, and comprehensive validation
   */
  /**
   * Standard Create Organization - Full validation and checks
   * Includes admin limit checks, role-based permissions, and comprehensive validation
   */
  standardCreateOrganization: async (_: any, { input }: any, { user }: any) => {
    const logger = console;
    const operation = "standardCreateOrganization";

    logger.info(`[${operation}] Starting standard organization creation`);
    logger.debug(`[${operation}] Input:`, input);
    logger.debug(`[${operation}] User:`, user);

    try {
      // ============================
      // 🔐 STEP 1: User Validation (prioritize orgCreator, fallback to context user)
      // ============================
      const creatorId = input.orgCreator || user?.id;

      if (!creatorId) {
        logger.error(`[${operation}] No creator ID provided`);
        throw new Error(
          "Organization creator ID is required. Please provide orgCreator field.",
        );
      }

      const currentUser = await User.findOne({ _id: creatorId });

      if (!currentUser) {
        logger.error(`[${operation}] User not found with ID: ${creatorId}`);
        throw new Error("User not found. Unable to create organization.");
      }

      logger.debug(
        `[${operation}] Creator user found: ${currentUser.id} (${currentUser.email})`,
      );

      // ============================
      // ✅ STEP 2: Required Field Validation
      // ============================
      const requiredFields = ["name", "email", "orgType"];

      for (const field of requiredFields) {
        if (!input[field]) {
          throw new Error(`${field} is required for organization creation`);
        }
      }

      // ============================
      // 📧 STEP 3: Email Format Validation
      // ============================
      const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
      if (!emailRegex.test(input.email)) {
        throw new Error("Invalid email format");
      }

      // ============================
      // 🔍 STEP 4: Duplicate Check
      // ============================
      const existingOrg = await Organization.findOne({
        $or: [
          { email: input.email },
          { name: { $regex: new RegExp(`^${input.name}$`, "i") } },
        ],
      });

      if (existingOrg) {
        if (existingOrg.email === input.email) {
          throw new Error("An organization with this email already exists");
        }
        if (existingOrg.name === input.name) {
          throw new Error("An organization with this name already exists");
        }
      }

      // ============================
      // 👑 STEP 5: Admin Limit Check (skip for SUPER)
      // ============================
      if (currentUser.role !== "SUPER") {
        const adminOrgCount = await Organization.countDocuments({
          admins: currentUser.id,
        });

        logger.debug(
          `[${operation}] User is admin in ${adminOrgCount} organizations`,
        );

        if (adminOrgCount >= 12) {
          logger.error(
            `[${operation}] User ${currentUser.id} attempted to create org but already admin in 12 organizations`,
          );
          throw new Error(
            "You have reached the maximum limit of 12 organizations you can manage as an admin.",
          );
        }
      }

      // ============================
      // 🎯 STEP 6: Role-Based Auto-approval
      // ============================
      const isAutoApprove =
        currentUser.role === "ADMIN" || currentUser.role === "SUPER";

      logger.debug(
        `[${operation}] User role: ${currentUser.role}, Auto-approve: ${isAutoApprove}`,
      );

      // ============================
      // 📋 STEP 7: Subscription Tier Validation
      // ============================
      const validTiers = ["FREE", "PRO", "ENTERPRISE"];
      const subscriptionTier = input.subscriptionTier || "PRO";

      if (!validTiers.includes(subscriptionTier)) {
        throw new Error(
          `Invalid subscription tier. Must be one of: ${validTiers.join(", ")}`,
        );
      }

      // ============================
      // 🎨 STEP 8: Billing Cycle Validation
      // ============================
      const validCycles = ["MONTHLY", "QUARTERLY", "ANNUAL"];
      const billingCycle = input.billingCycle || "MONTHLY";

      if (!validCycles.includes(billingCycle)) {
        throw new Error(
          `Invalid billing cycle. Must be one of: ${validCycles.join(", ")}`,
        );
      }

      // ============================
      // 🏢 STEP 9: Create Organization
      // ============================
      const orgData = {
        // Basic Info
        name: input.name,
        email: input.email,
        phone: input.phone || undefined,
        address: input.address || undefined,
        website: input.website || undefined,

        // Billing & Subscription
        subscriptionTier,
        billingCycle,
        autoRenew: input.autoRenew !== undefined ? input.autoRenew : true,
        billingEmail: input.billingEmail || undefined,
        billingAddress: input.billingAddress || undefined,
        taxId: input.taxId || undefined,
        registrationNumber: input.registrationNumber || undefined,

        // Limits & Quotas
        maxEvents:
          input.maxEvents ||
          (subscriptionTier === "FREE"
            ? 10
            : subscriptionTier === "PRO"
              ? 100
              : 1000),
        maxParticipantsPerEvent:
          input.maxParticipantsPerEvent ||
          (subscriptionTier === "FREE"
            ? 100
            : subscriptionTier === "PRO"
              ? 1000
              : 10000),

        // Relationships
        createdBy: currentUser.id,
        users: [currentUser.id],
        admins: [currentUser.id],

        // Status tracking
        orgType: input.orgType,
        isBlocked: false,
        isSuspended: false,
        status: isAutoApprove ? "ACTIVE" : "PENDING_APPROVAL",
        billingStatus: isAutoApprove ? "ACTIVE" : "TRIAL",

        // Metadata
        metadata: {
          createdVia: "standard_creation",
          approvalRequired: !isAutoApprove,
          approvedBy: isAutoApprove ? currentUser.id : null,
          approvedAt: isAutoApprove ? new Date() : null,
          verificationStatus: isAutoApprove ? "VERIFIED" : "PENDING",
          sourceIp: user?.ip || null,
          userAgent: user?.userAgent || null,
        },

        // Legal documents if provided
        orgLegalDocuments:
          input.orgLegalDocuments?.map((docUrl: string) => ({
            type: "TERMS_OF_SERVICE",
            url: docUrl,
            version: "1.0",
            signedAt: new Date(),
            signedBy: currentUser.id,
          })) || [],

        // Primary contact info
        ...(input.primaryContactName && {
          primaryContactName: input.primaryContactName,
        }),
        ...(input.primaryContactPhone && {
          primaryContactPhone: input.primaryContactPhone,
        }),
      };

      logger.debug(`[${operation}] Creating organization with data:`, {
        ...orgData,
        // Don't log sensitive data
      });

      const organization = await Organization.create(orgData);

      logger.info(
        `[${operation}] Organization created successfully: ${organization.id}`,
      );

      // ============================
      // 📝 STEP 10: Add to user's organizations array
      // ============================
      await User.findByIdAndUpdate(currentUser.id, {
        $push: { organizations: organization.id },
      });

      // ============================
      // 📊 STEP 11: Create default quotas if not exists
      // ============================
      if (!organization.quotas) {
        organization.quotas = {
          eventsUsed: 0,
          eventsLimit: organization.maxEvents,
          participantsUsed: 0,
          participantsLimit: organization.maxParticipantsPerEvent,
          storageUsedGB: 0,
          storageLimitGB:
            subscriptionTier === "FREE"
              ? 1
              : subscriptionTier === "PRO"
                ? 10
                : 100,
          apiCallsThisMonth: 0,
          apiCallsLimit:
            subscriptionTier === "FREE"
              ? 1000
              : subscriptionTier === "PRO"
                ? 10000
                : 100000,
          concurrentEventsUsed: 0,
          concurrentEventsLimit:
            subscriptionTier === "FREE"
              ? 1
              : subscriptionTier === "PRO"
                ? 5
                : 50,
          customDomainEnabled: false,
          ssoEnabled: false,
          apiAccessEnabled: subscriptionTier === "ENTERPRISE",
          dedicatedSupportEnabled: subscriptionTier === "ENTERPRISE",
        };
        await organization.save();
      }

      // ============================
      // 🔔 STEP 12: Add billing history entry
      // ============================
      organization.billingHistory.push({
        action: "SUBSCRIPTION_STARTED",
        description: `Organization created with ${subscriptionTier} plan`,
        date: new Date(),
        metadata: {
          createdVia: "standard_creation",
          autoApproved: isAutoApprove,
          creatorId: currentUser.id,
        },
      });
      await organization.save();

      // ============================
      // 📧 STEP 13: Send notification (if needed)
      // ============================
      // TODO: Implement email notification based on auto-approval status
      // if (!isAutoApprove) {
      //   await sendAdminApprovalEmail(organization);
      // }

      // Return populated organization
      const populatedOrg = await Organization.findById(organization.id)
        .populate("createdBy", "id name email role")
        .populate("users", "id name email")
        .populate("admins", "id name email");

      return populatedOrg;
    } catch (error: any) {
      logger.error(`[${operation}] Error:`, error);

      // Handle specific error types
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        throw new Error(`An organization with this ${field} already exists`);
      }

      throw new Error(error.message || "Failed to create organization");
    }
  },
  updateOrganization: async (_: any, { input }: any, { user }: any) => {
    const logger = console;

    try {
      const currentUser = await User.findById(user?.id);

      if (!currentUser) {
        throw new Error("User not found");
      }

      const organization = await Organization.findById(input.id);

      if (!organization) {
        throw new Error("Organization not found");
      }

      // Check if user has permission to update (must be admin of org OR SUPER/ADMIN role)
      const isAdmin = organization.admins.includes(currentUser.id);
      const isSuperUser = currentUser.role === "SUPER";
      const isAdminUser = currentUser.role === "ADMIN";

      if (!isAdmin && !isSuperUser && !isAdminUser) {
        throw new Error(
          "You don't have permission to update this organization",
        );
      }

      // Update fields
      Object.keys(input).forEach((key) => {
        if (key !== "id" && input[key] !== undefined) {
          organization[key] = input[key];
        }
      });

      await organization.save();

      const populatedOrg = await Organization.findById(organization.id)
        .populate("createdBy", "id name email phone role")
        .populate("users", "id name email phone role")
        .populate("admins", "id name email phone role")
        .lean();

      return normalizeOrg(populatedOrg);
    } catch (error) {
      logger.error("Error updating organization:", error);
      throw error;
    }
  },

  deleteOrganization: async (_: any, { id }: any, { user }: any) => {
    const logger = console;

    try {
      const currentUser = await User.findById(user?.id);

      if (!currentUser) {
        throw new Error("User not found");
      }

      const organization = await Organization.findById(id);

      if (!organization) {
        throw new Error("Organization not found");
      }

      // Check if user has permission to delete (must be admin of org OR SUPER/ADMIN role)
      const isAdmin = organization.admins.includes(currentUser.id);
      const isSuperUser = currentUser.role === "SUPER";
      const isAdminUser = currentUser.role === "ADMIN";

      if (!isAdmin && !isSuperUser && !isAdminUser) {
        throw new Error(
          "You don't have permission to delete this organization",
        );
      }

      // Remove organization from users' lists
      await User.updateMany(
        { organizations: id },
        { $pull: { organizations: id } },
      );

      await Organization.findByIdAndDelete(id);

      return true;
    } catch (error) {
      logger.error("Error deleting organization:", error);
      throw error;
    }
  },
};

export default { Query, Mutation };
