import User from "../src/models/User"; // REMOVED .js
import Conversation from "../src/models/Conversation"; // REMOVED .js
import Message from "../src/models/Message"; // REMOVED .js
import bcrypt from "bcryptjs";
import { setupTestDB, teardownTestDB, clearDB } from "./helpers"; // REMOVED .js

beforeAll(async () => {
  jest.setTimeout(30000);
  await setupTestDB();
});

beforeEach(async () => {
  await clearDB();
});

afterAll(async () => {
  await teardownTestDB();
});

describe("Database Models", () => {
  describe("User Model", () => {
    it("should create a user with valid data", async () => {
      const userData = {
        username: "testuser",
        email: "test@example.com",
        name: "Test User",
        passwordHash: await bcrypt.hash("password123", 10),
      };

      const user = await User.create(userData);

      expect(user.username).toBe(userData.username);
      expect(user.email).toBe(userData.email);
      expect(user.name).toBe(userData.name);
      expect(user.online).toBe(false);
      expect(user._id).toBeDefined();
    });

    it("should enforce unique username", async () => {
      const userData = {
        username: "testuser",
        email: "test1@example.com",
        name: "Test User",
        passwordHash: "hashedpassword",
      };

      await User.create(userData);

      const duplicateData = {
        username: "testuser",
        email: "test2@example.com",
        name: "Another User",
        passwordHash: "hashedpassword",
      };

      await expect(User.create(duplicateData)).rejects.toThrow();
    });
  });

  describe("Conversation Model", () => {
    let user1: any;
    let user2: any;

    beforeEach(async () => {
      user1 = await User.create({
        username: "user1",
        email: "user1@example.com",
        name: "User One",
        passwordHash: "hashedpassword",
      });

      user2 = await User.create({
        username: "user2",
        email: "user2@example.com",
        name: "User Two",
        passwordHash: "hashedpassword",
      });
    });

    it("should create a DM conversation", async () => {
      const conversation = await Conversation.create({
        participants: [user1._id, user2._id],
        isGroup: false,
      });

      expect(conversation.participants).toHaveLength(2);
      expect(conversation.isGroup).toBe(false);
      expect(conversation.name).toBeUndefined();
    });
  });

  describe("Message Model", () => {
    let user: any;
    let conversation: any;

    beforeEach(async () => {
      user = await User.create({
        username: "messageuser",
        email: "message@example.com",
        name: "Message User",
        passwordHash: "hashedpassword",
      });

      conversation = await Conversation.create({
        participants: [user._id],
        isGroup: false,
      });
    });

    it("should create a message", async () => {
      const message = await Message.create({
        conversationId: conversation._id,
        senderId: user._id,
        textEncrypted: "encrypted_text_here",
        status: "sent",
      });

      expect(message.conversationId).toEqual(conversation._id);
      expect(message.senderId).toEqual(user._id);
      expect(message.textEncrypted).toBe("encrypted_text_here");
      expect(message.status).toBe("sent");
      expect(message.createdAt).toBeDefined();
    });
  });
});
