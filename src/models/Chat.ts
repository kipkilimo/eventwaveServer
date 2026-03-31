import { Schema, model, Document } from 'mongoose';

export interface IChat extends Document {
  event: Schema.Types.ObjectId;
  sender: Schema.Types.ObjectId;
  content: string;
  type: 'text' | 'image' | 'file';
  mediaUrl?: string;
  createdAt: Date;
}

const chatSchema = new Schema<IChat>({
  event: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'image', 'file'], default: 'text' },
  mediaUrl: String
}, { timestamps: true });

export const Chat = model<IChat>('Chat', chatSchema);
