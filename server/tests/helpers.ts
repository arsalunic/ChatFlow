import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer | null = null;

/** Spin up in-memory Mongo for Jest. */
export const setupTestDB = async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  process.env.JWT_SECRET = 'testsecret';
  process.env.ENC_KEY = '0123456789abcdef0123456789abcdef';
  return uri;
};

export const teardownTestDB = async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
};
