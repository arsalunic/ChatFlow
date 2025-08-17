import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A conversation can be a DM (2 participants) or Group (3+ participants).
 */
export interface IConversation extends Document {
  participants: Types.ObjectId[];
  isGroup: boolean;
  name?: string; // for groups
}

const ConversationSchema = new Schema<IConversation>(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    isGroup: { type: Boolean, default: false },
    name: { type: String },
  },
  { timestamps: true }
);

// Helps list by membership quickly.
ConversationSchema.index({ participants: 1 });

export default mongoose.model<IConversation>('Conversation', ConversationSchema);
