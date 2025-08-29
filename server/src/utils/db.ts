// Centralized Mongo connection helpers.
import mongoose from "mongoose";

/**
 * Connects to MongoDB using Mongoose.
 * This is used by both runtime and tests.
 */
export const connectDB = async (uri: string) => {
  mongoose.set("strictQuery", true);

  //ONLY connect if not already connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
};

/** Disconnects for tests/shutdown. */
export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
};
