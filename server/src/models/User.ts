import mongoose, { Schema, Document } from 'mongoose';

/**
 * User schema contains minimal profile + presence.
 */
export interface IUser extends Document {
  username: string;
  email: string;
  name: string;
  avatar?: string;
  passwordHash: string;
  lastOnline?: Date;
  online: boolean;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    avatar: { type: String },
    passwordHash: { type: String, required: true },
    lastOnline: { type: Date },
    online: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', UserSchema);
