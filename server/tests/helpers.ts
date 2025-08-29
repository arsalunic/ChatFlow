import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongoServer: MongoMemoryServer | undefined;

export const setupTestDB = async () => {
  try {
    if (!mongoServer) {
      mongoServer = await MongoMemoryServer.create();
    }

    const mongoUri = mongoServer.getUri();

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
      console.log("Test database connected successfully");
    }
  } catch (error) {
    console.error("Failed to setup test database:", error);
    throw error;
  }
};

export const teardownTestDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    if (mongoServer) {
      await mongoServer.stop();
      mongoServer = undefined;
    }

    console.log("Test database cleaned up successfully");
  } catch (error) {
    console.error("Failed to cleanup test database:", error);
  }
};

export const clearDB = async () => {
  try {
    if (mongoose.connection.db) {
      const collections = await mongoose.connection.db.collections();
      for (let collection of collections) {
        await collection.deleteMany({});
      }
    }
  } catch (error) {
    console.error("Failed to clear database:", error);
  }
};
