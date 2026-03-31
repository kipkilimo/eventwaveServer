import { gql } from "graphql-tag";

export const invoiceTypeDefs = gql`
  """
  Invoice status enumeration.
  """
  enum InvoiceStatus {
    UNPAID
    PAID
    VOID
  }

  """
  Represents an invoice generated for an organization's event.
  """
  type Invoice {
    id: ID!

    organization: Organization!
    event: Event

    invoiceNumber: String!
    accessVoucher: String!
    voucherRedeem: Boolean!

    currency: String!
    amount: Float!
    status: InvoiceStatus!

    issuedAt: Date!
    paidAt: Date

    createdAt: Date!
    updatedAt: Date!
  }

  # ===============================
  # INPUT TYPES
  # ===============================

  """
  Input for creating a new invoice.
  invoiceNumber and accessVoucher will be auto-generated if not provided.
  """
  input CreateInvoiceInput {
    organization: ID!
    event: ID
    invoiceNumber: String
    currency: String
    amount: Float
    status: InvoiceStatus
  }

  """
  Input for updating an invoice.
  """
  input UpdateInvoiceInput {
    id: ID!

    status: InvoiceStatus
    amount: Float
    currency: String
    voucherRedeem: Boolean
    paidAt: Date
  }

  # ===============================
  # PAGINATION
  # ===============================
  type PaginatedInvoices {
    data: [Invoice!]!
    total: Int!
  }

  # ===============================
  # QUERIES
  # ===============================
  extend type Query {
    """
    Get all invoices in the system (admin only).
    """
    invoices: [Invoice!]!

    """
    Get paginated invoices.
    """
    invoicesPaginated(page: Int!, limit: Int!): PaginatedInvoices!

    """
    Get a single invoice by ID.
    """
    invoice(id: ID!): Invoice!

    """
    Get invoices belonging to the current user's organization.
    """
    myOrganizationInvoices: [Invoice!]!
  }

  # ===============================
  # MUTATIONS
  # ===============================
  extend type Mutation {
    """
    Create a new invoice.
    """
    createInvoice(input: CreateInvoiceInput!): Invoice!

    """
    Update an invoice.
    """
    updateInvoice(input: UpdateInvoiceInput!): Invoice!

    """
    Delete an invoice.
    """
    deleteInvoice(id: ID!): Boolean!

    """
    Mark voucher as redeemed.
    """
    redeemInvoiceVoucher(invoiceId: ID!, accessVoucher: String!): Invoice!

    """
    Recalculate invoice amount based on event duration (uses schema method).
    """
    calculateInvoiceAmount(invoiceId: ID!): Invoice!
  }
`;
