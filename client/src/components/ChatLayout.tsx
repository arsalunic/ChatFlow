import React, { useEffect, useRef, useState } from "react";
import api, { searchMessages } from "../services/api";
import { io } from "socket.io-client";

export default function ChatLayout({ onLogout }: { onLogout: () => void }) {
  const [convs, setConvs] = useState<any[]>([]);
  const [sel, setSel] = useState<any>();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const socketRef = useRef<any>();

  const username = localStorage.getItem("username") || "";

  // Load conversations
  const loadConvs = async () => {
    const r = await api.get("/conversations");
    setConvs(r.data);
    if (!sel && r.data[0]) selectConv(r.data[0]);
  };

  // Select a conversation
  const selectConv = async (c: any) => {
    setSel(c);
    const r = await api.get(`/conversations/${c._id}/messages`);
    setMsgs(r.data);
    setChatSearch(""); // reset search input
  };

  // Send message
  const send = async () => {
    if (!text.trim() || !sel) return;
    await api.post(`/conversations/${sel._id}/messages`, { text });
    setText("");
    await selectConv(sel);
  };

  // Start a new chat
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

  // Mark messages delivered
  const markDelivered = async () => {
    if (sel) await api.post(`/conversations/${sel._id}/delivered`);
  };

  // Search messages inside current conversation
  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setChatSearch(q);

    if (!sel) return;

    if (!q) {
      // If search cleared, load full chat history
      const r = await api.get(`/conversations/${sel._id}/messages`);
      setMsgs(r.data);
      return;
    }

    const results = await searchMessages(sel._id, q);
    setMsgs(results);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    if (socketRef.current && sel) {
      socketRef.current.emit("typing", { conversationId: sel._id, username });
    }
  };

  // Socket.io setup
  useEffect(() => {
    const token = localStorage.getItem("token");
    const s = io("http://localhost:3000", { path: "/ws", auth: { token } });
    socketRef.current = s;

    s.on("presence:update", async () => {
      await loadConvs();
    });

    s.on("message:new", async () => {
      if (sel) await selectConv(sel);
      await loadConvs();
    });

    s.on("typing", (typingUsername: string) => {
      if (typingUsername === username) return;
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

  // Highlight search matches
  const highlightText = (text: string) => {
    if (!chatSearch) return text;
    const regex = new RegExp(`(${chatSearch})`, "gi");
    return text
      .split(regex)
      .map((part, idx) =>
        regex.test(part) ? <mark key={idx}>{part}</mark> : part
      );
  };

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
            <div className="search" style={{ marginTop: 4 }}>
              <input
                placeholder="Search in chat"
                value={chatSearch}
                onChange={handleSearchChange}
              />
            </div>
          )}
        </div>

        <div className="messages">
          {msgs.length === 0 && <div className="badge">No messages</div>}
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
              <div>{highlightText(m.text)}</div>
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
