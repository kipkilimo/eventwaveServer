import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  phone: string;
  role: 'SUPER' | 'FACILITATOR' | 'ADMIN' | 'PARTICIPANT';
  organizations?: Types.ObjectId[]; // ✅ use Types.ObjectId[]
  events?: Types.ObjectId[]; // ✅ use Types.ObjectId[]
}

const kenyanPhoneRegex = /^(?:07\d{8}|011\d{7})$/;
const emailRegex =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [155, 'Full name cannot exceed 155 characters'],
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v: string) {
          return emailRegex.test(v);
        },
        message: (props: any) => `${props.value} is not a valid email address.`,
      },
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      validate: {
        validator: function (v: string) {
          return kenyanPhoneRegex.test(v);
        },
        message: (props: any) =>
          `${props.value} is not a valid Kenyan phone number. Must start with 07 + 8 digits (e.g. 0712345678) or 011 + 7 digits (e.g. 0112345678).`,
      },
    },
    role: {
      type: String,
      enum: ['SUPER', 'FACILITATOR', 'ADMIN', 'PARTICIPANT'],
      default: 'PARTICIPANT',
    },
    organizations: [{ type: Schema.Types.ObjectId, ref: "Organization" }], // ✅ array
    events: [{ type: Schema.Types.ObjectId, ref: "Event" }], // ✅ array
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);

