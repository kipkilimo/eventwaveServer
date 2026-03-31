import { gql } from "graphql-tag";

export const paymentTypeDefs = gql`
  """
  Payment method options.
  """
  enum PaymentMethod {
    MPESA
    PAYPAL
    BANK
    CASH
  }

  """
  Payment status.
  """
  enum PaymentStatus {
    PENDING
    SUCCESS
    FAILED
  }

  """
  Represents a payment made for an invoice.
  """
  type Payment {
    id: ID!

    organization: Organization!
    invoice: Invoice!
    payer: User!

    method: PaymentMethod!
    amount: Float!
    currency: String!

    reference: String!
    status: PaymentStatus!

    paidAt: Date
    createdAt: Date!
    updatedAt: Date!
  }

  # ===============================
  # INPUT TYPES
  # ===============================

  """
  Input type for creating a new payment.
  """
  input CreatePaymentInput {
    organization: ID!
    invoice: ID!
    payer: ID!

    method: PaymentMethod!
    amount: Float!
    currency: String

    reference: String!
  }

  """
  Input type for updating an existing payment.
  """
  input UpdatePaymentInput {
    id: ID!

    method: PaymentMethod
    amount: Float
    currency: String

    reference: String
    status: PaymentStatus
    paidAt: Date
  }

  # ===============================
  # PAGINATION
  # ===============================
  type PaginatedPayments {
    data: [Payment!]!
    total: Int!
  }

  # ===============================
  # QUERIES
  # ===============================
  extend type Query {
    """
    Get all payments in the system (admin only).
    """
    payments: [Payment!]!

    """
    Get payments using pagination.
    """
    paymentsPaginated(page: Int!, limit: Int!): PaginatedPayments!

    """
    Get a single payment by its ID.
    """
    payment(id: ID!): Payment!

    """
    Get payments belonging to the current user's organization.
    """
    myOrganizationPayments: [Payment!]!
  }

  # ===============================
  # MUTATIONS
  # ===============================
  extend type Mutation {
    """
    Create a new payment.
    """
    createPayment(input: CreatePaymentInput!): Payment!

    """
    Update an existing payment.
    """
    updatePayment(input: UpdatePaymentInput!): Payment!

    """
    Delete a payment.
    """
    deletePayment(id: ID!): Boolean!
  }
`;
