import { Schema, model, Document } from 'mongoose';

export type PollType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'OPEN_TEXT' | 'RATING' | 'RANKING';

export interface IPollOption {
  text: string;
  votes: Schema.Types.ObjectId[];
  rankScores?: Map<string, number>;
}

export interface IPoll extends Document {
  event: Schema.Types.ObjectId;
  question: string;
  type: PollType;
  options: IPollOption[];
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
}

const pollOptionSchema = new Schema({
  text: String,
  votes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  // For ranking polls we can store score per voter if needed
  rankScores: { type: Map, of: Number }
});

const pollSchema = new Schema<IPoll>({
  event: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
  question: { type: String, required: true },
  type: {
    type: String,
    enum: ['SINGLE_CHOICE','MULTIPLE_CHOICE','OPEN_TEXT','RATING','RANKING'],
    default: 'SINGLE_CHOICE'
  },
  options: [pollOptionSchema],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export const Poll = model<IPoll>('Poll', pollSchema);
