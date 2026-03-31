// ===============================================
// Payment Resolvers
// ===============================================
import { Payment } from "../../models/Payment";
import { Invoice } from "../../models/Invoice";
import { Organization } from "../../models/Organization";
import { User } from "../../models/User";

import {
  AuthenticationError,
  UserInputError,
} from "apollo-server-errors";

export const paymentResolvers = {
  // ===============================================
  // FIELD RESOLVERS
  // ===============================================
  Payment: {
    organization: (parent) => {
      return Organization.findById(parent.organization);
    },

    invoice: (parent) => {
      return Invoice.findById(parent.invoice);
    },

    payer: (parent) => {
      return User.findById(parent.payer);
    },
  },

  // ===============================================
  // QUERIES
  // ===============================================
  Query: {
    // -------------------------------------------
    // Get all payments (super admin only)
    // -------------------------------------------
    payments: async (_, __, { user }) => {
      if (!user?.isSuperAdmin) {
        throw new AuthenticationError("Not authorized");
      }

      return Payment.find().sort({ createdAt: -1 });
    },

    // -------------------------------------------
    // Paginated payments
    // -------------------------------------------
    paymentsPaginated: async (_, { page, limit }, { user }) => {
      if (!user) throw new AuthenticationError("Not authenticated");

      const skip = (page - 1) * limit;

      const data = await Payment.find()
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      const total = await Payment.countDocuments();

      return { data, total };
    },

    // -------------------------------------------
    // Get a single payment
    // -------------------------------------------
    payment: async (_, { id }, { user }) => {
      const payment = await Payment.findById(id);
      if (!payment) throw new UserInputError("Payment not found");

      if (
        !user?.isSuperAdmin &&
        payment.organization.toString() !== user.organization.toString()
      ) {
        throw new AuthenticationError("Access denied");
      }

      return payment;
    },

    // -------------------------------------------
    // Payments belonging to logged user's organization
    // -------------------------------------------
    myOrganizationPayments: async (_, __, { user }) => {
      if (!user) throw new AuthenticationError("Not authenticated");

      return Payment.find({
        organization: user.organization,
      }).sort({ createdAt: -1 });
    },
  },

  // ===============================================
  // MUTATIONS
  // ===============================================
  Mutation: {
    // -------------------------------------------
    // CREATE PAYMENT
    // -------------------------------------------
    createPayment: async (_, { input }, { user }) => {
      if (!user) throw new AuthenticationError("Not authenticated");

      // Validate Organization Access
      if (input.organization.toString() !== user.organization.toString()) {
        throw new AuthenticationError("Unauthorized organization access.");
      }

      const invoice = await Invoice.findById(input.invoice);
      if (!invoice) throw new UserInputError("Invoice not found");

      // Create new payment
      const payment = new Payment({
        ...input,
        currency: input.currency || "USD",
        status: "PENDING",
      });

      await payment.save();

      return payment;
    },

    // -------------------------------------------
    // UPDATE PAYMENT
    // -------------------------------------------
    updatePayment: async (_, { input }, { user }) => {
      const payment = await Payment.findById(input.id);
      if (!payment) throw new UserInputError("Payment not found");

      // Access control
      if (
        !user?.isSuperAdmin &&
        payment.organization.toString() !== user.organization.toString()
      ) {
        throw new AuthenticationError("Access denied");
      }

      const oldStatus = payment.status;

      // Apply updates
      Object.assign(payment, input);
      await payment.save();

      // -------------------------------------------
      // If payment becomes SUCCESS → update Invoice
      // -------------------------------------------
      if (input.status === "SUCCESS" && oldStatus !== "SUCCESS") {
        await Invoice.findByIdAndUpdate(payment.invoice, {
          status: "PAID",
          paidAt: input.paidAt || new Date(),
        });
      }

      // If status changed away from SUCCESS, revert invoice
      if (oldStatus === "SUCCESS" && input.status !== "SUCCESS") {
        await Invoice.findByIdAndUpdate(payment.invoice, {
          status: "UNPAID",
          paidAt: null,
        });
      }

      return payment;
    },

    // -------------------------------------------
    // DELETE PAYMENT
    // -------------------------------------------
    deletePayment: async (_, { id }, { user }) => {
      const payment = await Payment.findById(id);
      if (!payment) throw new UserInputError("Payment not found");

      // Access control
      if (
        !user?.isSuperAdmin &&
        payment.organization.toString() !== user.organization.toString()
      ) {
        throw new AuthenticationError("Not authorized");
      }

      // If deleting a successful payment → revert invoice
      if (payment.status === "SUCCESS") {
        await Invoice.findByIdAndUpdate(payment.invoice, {
          status: "UNPAID",
          paidAt: null,
        });
      }

      await payment.deleteOne();
      return true;
    },
  },
};
