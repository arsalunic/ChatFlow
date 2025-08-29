import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { io as ioClient } from "socket.io-client";
import jwt from "jsonwebtoken";
import User from "../src/models/User";
import { initWebsocket } from "../src/websocket";
import { setupTestDB, teardownTestDB, clearDB } from "./helpers";

describe("WebSocket functionality", () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: SocketIOServer;
  let clientSocket: any;
  let testUser: any;
  let authToken: string;

  beforeAll(async () => {
    await setupTestDB();
    jest.setTimeout(15000);

    httpServer = createServer();
    io = initWebsocket(httpServer);

    // Start server
    await new Promise<void>((resolve) => httpServer.listen(() => resolve()));
  });

  beforeEach(async () => {
    await clearDB();

    testUser = await User.create({
      username: "sockettest",
      email: "socket@test.com",
      name: "Socket Test",
      passwordHash: "hashedpassword",
    });

    authToken = jwt.sign(
      { userId: testUser._id, username: testUser.username },
      process.env.JWT_SECRET || "supersecret"
    );

    const port = (httpServer.address() as any)?.port;
    clientSocket = ioClient(`http://localhost:${port}`, {
      path: "/ws",
      auth: { token: authToken },
      forceNew: true,
      transports: ["websocket"],
    });

    await new Promise<void>((resolve, reject) => {
      clientSocket.on("connect", resolve);
      clientSocket.on("connect_error", reject);
      setTimeout(() => reject(new Error("Socket connection timeout")), 5000);
    });
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  afterAll(async () => {
    // Disconnect any remaining client
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }

    // Close server
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }

    // Teardown DB after all connections are closed
    await teardownTestDB();
  });

  it("should connect with valid token", () => {
    expect(clientSocket.connected).toBe(true);
  });
});
