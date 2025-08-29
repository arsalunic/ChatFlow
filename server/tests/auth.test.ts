import request from "supertest";
import app from "../src/index";
import { setupTestDB, teardownTestDB, clearDB } from "./helpers";

beforeAll(async () => {
  await setupTestDB();
});

afterAll(async () => {
  await teardownTestDB();
});

beforeEach(async () => {
  await clearDB();
});

describe("Authentication", () => {
  describe("POST /auth/register", () => {
    it("should register a new user successfully", async () => {
      const userData = {
        username: "testuser",
        email: "test@example.com",
        name: "Test User",
        password: "password123",
      };

      const response = await request(app)
        .post("/auth/register")
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty("token");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user).not.toHaveProperty("password");
      expect(response.body.user.username).toBe(userData.username);
    });

    it("should return 400 for missing required fields", async () => {
      const incompleteData = { username: "testuser" };

      const response = await request(app)
        .post("/auth/register")
        .send(incompleteData)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("POST /auth/login", () => {
    beforeEach(async () => {
      await request(app).post("/auth/register").send({
        username: "testuser",
        email: "test@example.com",
        name: "Test User",
        password: "password123",
      });
    });

    it("should login with valid credentials", async () => {
      const response = await request(app)
        .post("/auth/login")
        .send({ username: "testuser", password: "password123" })
        .expect(200);

      expect(response.body).toHaveProperty("token");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user.username).toBe("testuser");
    });
  });
});
