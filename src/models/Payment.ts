import { Schema, model, Document, Types } from "mongoose";

/* ----------------------------- */
/* Payment Interface             */
/* ----------------------------- */
export interface IPayment extends Document {
  organization: Types.ObjectId;
  invoice: Types.ObjectId;
  payer: Types.ObjectId;       // User making the payment

  method: "MPESA" | "PAYPAL" | "BANK" | "CASH";
  amount: number;
  currency: string;

  reference: string;           // e.g. MPesa code / PayPal ID / Bank slip
  status: "PENDING" | "SUCCESS" | "FAILED";

  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/* ----------------------------- */
/* Schema                        */
/* ----------------------------- */
const PaymentSchema = new Schema<IPayment>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
    },

    payer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    method: {
      type: String,
      enum: ["MPESA", "PAYPAL", "BANK", "CASH"],
      required: true,
    },

    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },

    reference: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },

    paidAt: { type: Date },
  },
  { timestamps: true }
);

/* ----------------------------- */
/* Export                        */
/* ----------------------------- */
export const Payment = model<IPayment>("Payment", PaymentSchema);
