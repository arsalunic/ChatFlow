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
  const [showReactionsFor, setShowReactionsFor] = useState<string | null>(null);

  const socketRef = useRef<any>();
  const username = localStorage.getItem("username") || "";

  // --- Utility: aggregate reactions by emoji ---
  const aggregateReactions = (reactions: any[]) => {
    const map: Record<
      string,
      { emoji: string; count: number; reacted: boolean }
    > = {};
    reactions?.forEach((r) => {
      if (!map[r.emoji])
        map[r.emoji] = { emoji: r.emoji, count: 0, reacted: false };
      map[r.emoji].count += 1;
      if (r.userId === username) map[r.emoji].reacted = true;
    });
    return Object.values(map);
  };

  // --- Load conversations ---
  const loadConvs = async () => {
    const r = await api.get("/conversations");
    setConvs(r.data);
    if (!sel && r.data[0]) selectConv(r.data[0]);
  };

  // --- Select a conversation ---
  const selectConv = async (c: any) => {
    setSel(c);
    const r = await api.get(`/conversations/${c._id}/messages`);
    setMsgs(r.data);
    setChatSearch("");
  };

  // --- Send message ---
  const send = async () => {
    if (!text.trim() || !sel) return;
    await api.post(`/conversations/${sel._id}/messages`, { text });
    setText("");
    await selectConv(sel);
  };

  // --- Start new chat ---
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

  // --- Mark delivered ---
  const markDelivered = async () => {
    if (sel) await api.post(`/conversations/${sel._id}/delivered`);
  };

  // --- Search messages ---
  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setChatSearch(q);
    if (!sel) return;

    if (!q) {
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

  // --- React to message ---
  const reactToMessage = async (msgId: string, emoji: string) => {
    if (!sel) return;

    // Optimistic UI toggle
    setMsgs((prev) =>
      prev.map((m) => {
        if (m._id !== msgId) return m;

        const userReacted = m.reactions?.some(
          (r: any) => r.userId === username && r.emoji === emoji
        );
        let newReactions;

        if (userReacted) {
          newReactions = m.reactions.filter(
            (r: any) => !(r.userId === username && r.emoji === emoji)
          );
        } else {
          newReactions = m.reactions
            ? [...m.reactions, { userId: username, emoji }]
            : [{ userId: username, emoji }];
        }

        return { ...m, reactions: newReactions };
      })
    );

    // Send to server
    await api.post(`/conversations/${sel._id}/messages/${msgId}/react`, {
      emoji,
    });
  };

  // --- Socket.io ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    const s = io("http://localhost:3000", { path: "/ws", auth: { token } });
    socketRef.current = s;

    s.on("presence:update", async () => await loadConvs());
    s.on("message:new", async () => {
      if (sel) await selectConv(sel);
      await loadConvs();
    });
    s.on("message:react", ({ msgId, reactions }: any) => {
      setMsgs((prev) =>
        prev.map((m) => (m._id === msgId ? { ...m, reactions } : m))
      );
    });

    s.on("typing", (typingUsername: string) => {
      if (typingUsername === username) return;
      setTypingUsers((prev) =>
        !prev.includes(typingUsername) ? [...prev, typingUsername] : prev
      );
      setTimeout(
        () =>
          setTypingUsers((prev) => prev.filter((u) => u !== typingUsername)),
        2000
      );
    });

    loadConvs();
    return () => {
      s.disconnect();
    };
  }, [sel]);

  useEffect(() => {
    markDelivered();
  }, [sel, msgs.length]);

  // --- Highlight search matches ---
  const highlightText = (text: string) => {
    if (!chatSearch) return text;
    const regex = new RegExp(`(${chatSearch})`, "gi");
    return text
      .split(regex)
      .map((part, idx) =>
        regex.test(part) ? <mark key={idx}>{part}</mark> : part
      );
  };

  // --- Quick emoji options ---
  const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

  return (
    <div className="app">
      {/* Sidebar */}
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

      {/* Chat */}
      <div className="chat">
        <div className="chat-header">
          {sel ? (
            <>
              <strong>
                {sel.isGroup
                  ? sel.name || "Group Chat"
                  : sel.participants.find((p: any) => p.username !== username)
                      ?.name || "Direct chat"}
              </strong>
              {sel.isGroup && (
                <div style={{ fontSize: "0.9em", marginTop: 4 }}>
                  Members:{" "}
                  {sel.participants.map((p: any) => (
                    <span key={p._id} style={{ marginRight: 8 }}>
                      {p.name || p.username}
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          marginLeft: 4,
                          backgroundColor: p.online ? "green" : "gray",
                        }}
                      />
                    </span>
                  ))}
                </div>
              )}
              {sel && (
                <div className="search" style={{ marginTop: 4 }}>
                  <input
                    placeholder="Search in chat"
                    value={chatSearch}
                    onChange={handleSearchChange}
                  />
                </div>
              )}
            </>
          ) : (
            <strong>Select a chat</strong>
          )}
        </div>

        <div className="messages">
          {msgs.length === 0 && <div className="badge">No messages</div>}
          {msgs.map((m) => {
            const aggregated = aggregateReactions(m.reactions);
            const isMine =
              sel?.participants?.find((p: any) => p.username === username)
                ?._id === m.senderId;

            return (
              <div
                key={m._id}
                className={"msg " + (isMine ? "mine" : "")}
                onMouseEnter={() => setShowReactionsFor(m._id)}
                onMouseLeave={() => setShowReactionsFor(null)}
              >
                <div>{highlightText(m.text)}</div>
                <div className="badge">
                  {new Date(m.createdAt).toLocaleTimeString()} · {m.status}
                </div>

                <div className="reactions">
                  {/* Aggregated reactions */}
                  {aggregated.map((r) => (
                    <span
                      key={r.emoji}
                      className={"reaction" + (r.reacted ? " reacted" : "")}
                      onClick={() => reactToMessage(m._id, r.emoji)}
                    >
                      {r.emoji} {r.count}
                    </span>
                  ))}

                  {/* Dynamic emoji picker */}
                  {showReactionsFor === m._id && (
                    <div className="emoji-picker">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => reactToMessage(m._id, e)}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
