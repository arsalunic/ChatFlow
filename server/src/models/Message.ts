import mongoose, { Schema, Document, Types } from 'mongoose';

/** Minimal status enum: sent -> delivered. */
export type MessageStatus = 'sent' | 'delivered';

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  textEncrypted: string;
  status: MessageStatus;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    textEncrypted: { type: String, required: true },
    status: { type: String, enum: ['sent', 'delivered'], default: 'sent' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Sort by time within a convo.
MessageSchema.index({ conversationId: 1, createdAt: 1 });

// Naive index to speed server-side decrypt+filter demo search.
MessageSchema.index({ textEncrypted: 1 });

export default mongoose.model<IMessage>('Message', MessageSchema);
