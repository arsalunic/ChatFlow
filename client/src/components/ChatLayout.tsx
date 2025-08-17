import React, { useEffect, useRef, useState } from "react";
import api from "../services/api";
import { io } from "socket.io-client";

/**
 * Main WhatsApp-like chat layout: left convo list, right message pane.
 * Includes presence indicators, message status (sent/delivered), and typing indicator.
 */
export default function ChatLayout({ onLogout }: { onLogout: () => void }) {
  const [convs, setConvs] = useState<any[]>([]);
  const [sel, setSel] = useState<any>();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const socketRef = useRef<any>();

  const username = localStorage.getItem("username") || "";

  // Load conversations list and default selection
  const loadConvs = async () => {
    const r = await api.get("/conversations");
    setConvs(r.data);
    if (!sel && r.data[0]) selectConv(r.data[0]);
  };

  const selectConv = async (c: any) => {
    setSel(c);
    const r = await api.get(`/conversations/${c._id}/messages`);
    setMsgs(r.data);
  };

  const send = async () => {
    if (!text.trim() || !sel) return;
    await api.post(`/conversations/${sel._id}/messages`, { text });
    setText("");
    await selectConv(sel);
  };

  const newChat = async () => {
    const who = prompt(
      "Start a chat with username(s), comma-separated. For group, include 2+."
    );
    if (!who) return;
    const names = who
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const name =
      names.length >= 2
        ? prompt("Group name? (optional)") || undefined
        : undefined;
    const r = await api.post("/conversations", {
      participantUsernames: names,
      name,
    });
    await loadConvs();
    const created = r.data;
    const found = (await api.get("/conversations")).data.find(
      (x: any) => x._id === created._id
    );
    if (found) await selectConv(found);
  };

  const markDelivered = async () => {
    if (sel) await api.post(`/conversations/${sel._id}/delivered`);
  };

  const searchAll = async () => {
    if (!q) return;
    const r = await api.get(
      `/conversations/search/all?q=${encodeURIComponent(q)}`
    );
    alert(`Found ${r.data.length} messages. (Teaching demo: global search)`);
  };

  // Handle typing input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    if (socketRef.current && sel) {
      socketRef.current.emit("typing", { conversationId: sel._id, username });
    }
  };

  // Setup socket for presence, new messages, and typing events
  useEffect(() => {
    const token = localStorage.getItem("token");
    const s = io("http://localhost:3000", { path: "/ws", auth: { token } });
    socketRef.current = s;

    s.on("presence:update", async (_p: any) => {
      await loadConvs();
    });

    s.on("message:new", async (_payload: any) => {
      if (sel) await selectConv(sel);
      await loadConvs();
    });

    s.on("typing", (typingUsername: string) => {
      if (typingUsername === username) return; // ignore self
      setTypingUsers((prev) => {
        if (!prev.includes(typingUsername)) return [...prev, typingUsername];
        return prev;
      });
      setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== typingUsername));
      }, 2000);
    });

    loadConvs();
    return () => {
      s.disconnect();
    };
  }, [sel]);

  useEffect(() => {
    markDelivered();
  }, [sel, msgs.length]);

  return (
    <div className="app">
      <div className="sidebar">
        <div className="header">
          <strong>Chats</strong>
          <div>
            <button className="button secondary" onClick={newChat}>
              New
            </button>
            <button
              className="button secondary"
              onClick={onLogout}
              style={{ marginLeft: 8 }}
            >
              Logout
            </button>
          </div>
        </div>
        <div className="search">
          <input
            placeholder="Search (global)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchAll()}
          />
        </div>
        <div className="list">
          {convs.map((c) => (
            <div key={c._id} className="item" onClick={() => selectConv(c)}>
              <div>
                <strong>
                  {c.isGroup
                    ? c.name
                    : c.participants.find((p: any) => p.username !== username)
                        ?.name || "Direct chat"}
                </strong>
              </div>
              <div className="badge">
                {c.lastMessage
                  ? `${c.lastMessage.text.slice(0, 40)} · ${new Date(
                      c.lastMessage.createdAt
                    ).toLocaleTimeString()}`
                  : "No messages yet"}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="chat">
        <div className="chat-header">
          <div>
            <strong>
              {sel
                ? sel.isGroup
                  ? sel.name
                  : sel.participants.find((p: any) => p.username !== username)
                      ?.name || "Direct chat"
                : "Select a chat"}
            </strong>
          </div>
          {sel && (
            <div className="badge">
              {sel.participants
                .map((p: any) => `${p.name} ${p.online ? "●" : "○"}`)
                .join(" · ")}
            </div>
          )}
        </div>
        <div className="messages">
          {msgs.map((m) => (
            <div
              key={m._id}
              className={
                "msg " +
                (sel?.participants?.find((p: any) => p.username === username)
                  ?._id === m.senderId
                  ? "mine"
                  : "")
              }
            >
              <div>{m.text}</div>
              <div className="badge">
                {new Date(m.createdAt).toLocaleTimeString()} · {m.status}
              </div>
            </div>
          ))}
        </div>

        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            {typingUsers.join(", ")} {typingUsers.length > 1 ? "are" : "is"}{" "}
            typing...
          </div>
        )}

        {sel && (
          <div className="composer">
            <input
              placeholder="Type a message"
              value={text}
              onChange={handleInputChange}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="button" onClick={send}>
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
