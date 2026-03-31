// ===============================================
// Invoice Resolvers
// ===============================================
import { Invoice } from "../../models/Invoice";
import { Organization } from "../../models/Organization";
import { Event } from "../../models/Event";
import { AuthenticationError, UserInputError } from "apollo-server-errors";
// -----------------------------
// Local helper methods
// -----------------------------
function generateInvoiceNumber(): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000).toString();
  return `INV-${timestamp}-${random}`;
}

function generateVoucherCode(): string {
  const chars = "ABCDEFGHJKLMNPRTVWXY23456789";
  let code = "";
  for (let i = 0; i < 7; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const invoiceResolvers = {
  // ===============================================
  // FIELD RESOLVERS
  // ===============================================
  Invoice: {
    organization: async (parent) => {
      return Organization.findById(parent.organization);
    },

    event: async (parent) => {
      return Event.findById(parent.event);
    },
  },

  // ===============================================
  // QUERIES
  // ===============================================
  Query: {
    // -------------------------------------------
    // Get all invoices (Super Admin)
    // -------------------------------------------
    invoices: async (_, __, { user }) => {
      if (!user?.isSuperAdmin) {
        throw new AuthenticationError("Not authorized");
      }
      return Invoice.find().sort({ createdAt: -1 });
    },

    // -------------------------------------------
    // Paginated invoices
    // -------------------------------------------
    invoicesPaginated: async (_, { page, limit }) => {
      const skip = (page - 1) * limit;
      const data = await Invoice.find()
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      const total = await Invoice.countDocuments();

      return { data, total };
    },

    // -------------------------------------------
    // Single invoice by ID
    // -------------------------------------------
    invoice: async (_, { id }, { user }) => {
      const invoice = await Invoice.findById(id);
      if (!invoice) throw new UserInputError("Invoice not found");

      // Access control: only super admins or org admins
      if (
        !user?.isSuperAdmin &&
        invoice.organization.toString() !== user.organization.toString()
      ) {
        throw new AuthenticationError("Access denied");
      }

      return invoice;
    },

    // -------------------------------------------
    // Invoices belonging to my organization
    // -------------------------------------------
    myOrganizationInvoices: async (_, __, { user }) => {
      if (!user) throw new AuthenticationError("Not authenticated");

      return Invoice.find({
        organization: user.organization,
      }).sort({ createdAt: -1 });
    },
  },

  // ===============================================
  // MUTATIONS
  // ===============================================
  Mutation: {
    // -------------------------------------------
    // CREATE INVOICE
    // -------------------------------------------
    createInvoice: async (_, { input }, { user }) => {
      if (!user) throw new AuthenticationError("Not authenticated");

      const organization = input.organization;
      if (organization.toString() !== user.organization.toString()) {
        throw new AuthenticationError("Unauthorized organization access.");
      }

      const invoice = new Invoice({
        ...input,
        invoiceNumber:
          input.invoiceNumber || generateInvoiceNumber(),
        accessVoucher: generateVoucherCode(),
        voucherRedeem: false,
      });

      await invoice.save();
      return invoice;
    },

    // -------------------------------------------
    // UPDATE INVOICE
    // -------------------------------------------
    updateInvoice: async (_, { input }, { user }) => {
      const invoice = await Invoice.findById(input.id);
      if (!invoice) throw new UserInputError("Invoice not found");

      if (
        !user?.isSuperAdmin &&
        invoice.organization.toString() !== user.organization.toString()
      ) {
        throw new AuthenticationError("Access denied");
      }

      Object.assign(invoice, input);
      await invoice.save();

      return invoice;
    },

    // -------------------------------------------
    // DELETE INVOICE
    // -------------------------------------------
    deleteInvoice: async (_, { id }, { user }) => {
      const invoice = await Invoice.findById(id);
      if (!invoice) throw new UserInputError("Invoice not found");

      if (
        !user?.isSuperAdmin &&
        invoice.organization.toString() !== user.organization.toString()
      ) {
        throw new AuthenticationError("Access denied");
      }

      await invoice.deleteOne();
      return true;
    },

    // -------------------------------------------
    // REDEEM VOUCHER
    // -------------------------------------------
    redeemInvoiceVoucher: async (_, { invoiceId, accessVoucher }, { user }) => {
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) throw new UserInputError("Invoice not found");

      if (invoice.accessVoucher !== accessVoucher) {
        throw new UserInputError("Invalid voucher code");
      }

      invoice.voucherRedeem = true;
      await invoice.save();

      return invoice;
    },

    // -------------------------------------------
    // RECALCULATE INVOICE AMOUNT BASED ON EVENT
    // -------------------------------------------
    calculateInvoiceAmount: async (_, { invoiceId }, { user }) => {
      const invoice = await Invoice.findById(invoiceId).populate("event");
      if (!invoice) throw new UserInputError("Invoice not found");

      if (
        !user?.isSuperAdmin &&
        invoice.organization.toString() !== user.organization.toString()
      ) {
        throw new AuthenticationError("Access denied");
      }

      // Ensure Event has calculateCost method
      await invoice.save();

      return invoice;
    },
  },
};
