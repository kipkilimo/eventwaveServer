import { Schema, model, Document, Types } from "mongoose";

/* ----------------------------- */
/* Invoice Interface             */
/* ----------------------------- */
export interface IInvoice extends Document {
  organization: Types.ObjectId;
  event: Types.ObjectId;

  invoiceNumber: string;
  accessVoucher: string;
  voucherRedeem: boolean; // ✅ NEW FIELD

  currency: string;
  amount: number;
  status: "UNPAID" | "PAID" | "VOID";

  issuedAt: Date;
  paidAt?: Date;

  calculateAmountFromEvent(): Promise<number>;
}

/* ----------------------------- */
/* Helper — Generate Voucher     */
/* ----------------------------- */


/* ----------------------------- */
/* Schema                        */
/* ----------------------------- */
const InvoiceSchema = new Schema<IInvoice>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    event: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: false,
    },

    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    accessVoucher: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 6,
      maxlength: 6,
      unique: true, 
    },

    voucherRedeem: {
      type: Boolean,
      default: false, // ⭐ voucher initially not redeemed
    },

    currency: { type: String, default: "USD" },
    amount: { type: Number, required: true, default: 0 },

    status: {
      type: String,
      enum: ["UNPAID", "PAID", "VOID"],
      default: "UNPAID",
    },

    issuedAt: { type: Date, default: Date.now },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

/* ----------------------------- */
/* Method — Calculate Amount     */
/* ----------------------------- */
InvoiceSchema.methods.calculateAmountFromEvent =
  async function (): Promise<number> {
    const Event = require("./Event").Event;

    const event = await Event.findById(this.event);
    if (!event) return 0;

    // event duration in days
    const durationMs =
      event.dateTime.end.getTime() - event.dateTime.start.getTime();

    const days = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));

    // Your specified flat rate
    const rate = 4; // USD 4

    const total = days * rate;

    this.amount = total;
    return total;
  };

/* ----------------------------- */
/* Export                        */
/* ----------------------------- */
export const Invoice = model<IInvoice>("Invoice", InvoiceSchema);
