import mongoose, { Schema, Document, Types } from "mongoose";

/** Minimal status enum: sent -> delivered. */
export type MessageStatus = "sent" | "delivered";

interface IMessageReaction {
  userId: Types.ObjectId;
  emoji: string;
}

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  textEncrypted: string;
  status: MessageStatus;
  createdAt: Date;
  parentMessageId?: Types.ObjectId | null;
  reactions?: IMessageReaction[];
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    textEncrypted: { type: String, required: true },
    status: { type: String, enum: ["sent", "delivered"], default: "sent" },
    parentMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    reactions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        emoji: { type: String, required: true },
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Sort by time within a convo.
MessageSchema.index({ conversationId: 1, createdAt: 1 });

// Naive index to speed server-side decrypt+filter demo search.
MessageSchema.index({ textEncrypted: 1 });

export default mongoose.model<IMessage>("Message", MessageSchema);
