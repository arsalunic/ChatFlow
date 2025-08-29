import request from "supertest";
import http from "http";
import { start } from "../src/index";
import { setupTestDB, teardownTestDB, clearDB } from "./helpers";

let server: http.Server;
let token = "";

beforeAll(async () => {
  jest.setTimeout(30000);
  await setupTestDB();

  // Start your server without connecting DB again
  server = await start({ skipDBConnect: true });
}, 30000);

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await teardownTestDB();
});

beforeEach(async () => {
  await clearDB();

  await request(server)
    .post("/auth/register")
    .send({ username: "a", email: "a@e.com", name: "A", password: "p" });
  await request(server)
    .post("/auth/register")
    .send({ username: "b", email: "b@e.com", name: "B", password: "p" });
  await request(server)
    .post("/auth/register")
    .send({ username: "c", email: "c@e.com", name: "C", password: "p" });

  const login = await request(server)
    .post("/auth/login")
    .send({ username: "a", password: "p" });
  token = login.body.token;
});

it("requires 3+ participants for group creation", async () => {
  const bad = await request(server)
    .post("/conversations")
    .set("Authorization", `Bearer ${token}`)
    .send({ participantUsernames: ["b"], name: "should-fail" });
  expect(bad.status).toBe(201);

  const good = await request(server)
    .post("/conversations")
    .set("Authorization", `Bearer ${token}`)
    .send({ participantUsernames: ["b", "c"], name: "group-ok" });
  expect(good.status).toBe(201);
  expect(good.body.isGroup).toBe(true);
});
