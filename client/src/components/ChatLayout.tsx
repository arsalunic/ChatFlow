// client/src/components/ChatLayout.tsx
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
  const [replyingTo, setReplyingTo] = useState<any>(null);

  const socketRef = useRef<any>();
  const username = localStorage.getItem("username") || "";

  const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

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
    await api.post(`/conversations/${sel._id}/messages`, {
      text,
      replyTo: replyingTo?._id,
    });
    setText("");
    setReplyingTo(null);
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

    await api.post(`/conversations/${sel._id}/messages/${msgId}/react`, {
      emoji,
    });
  };

  const highlightText = (text: string) => {
    if (!chatSearch) return text;
    const regex = new RegExp(`(${chatSearch})`, "gi");
    return text
      .split(regex)
      .map((part, idx) =>
        regex.test(part) ? <mark key={idx}>{part}</mark> : part
      );
  };

  // --- Socket.io ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    const s = io("http://localhost:3000", { path: "/ws", auth: { token } });
    socketRef.current = s;

    s.on("presence:update", async () => await loadConvs());

    // When a new message is sent into the room, refresh the conversation & list
    s.on("message:new", async () => {
      if (sel) await selectConv(sel);
      await loadConvs();
    });

    // When server emits that messages were delivered, update local state
    s.on("message:delivered", ({ conversationId, messageIds }: any) => {
      // If the delivered event is for the currently open conversation
      if (sel && sel._id === conversationId) {
        setMsgs((prev) =>
          prev.map((m) =>
            messageIds.includes(m._id) ? { ...m, status: "delivered" } : m
          )
        );
      }
      // Update conversation list (lastMessage status summary)
      loadConvs();
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
    // NOTE: we intentionally do not include `loadConvs` in dependency list
    // to avoid re-creating socket unnecessarily. `sel` is included to
    // ensure handler has access to the currently selected conv.
  }, [sel]);

  useEffect(() => {
    markDelivered();
  }, [sel, msgs.length]);

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
                {m.parent && (
                  <div
                    className="parent-msg"
                    style={{
                      borderLeft: "3px solid #000000ff", // vertical bold line
                      paddingLeft: 6,
                      marginBottom: 4,
                      fontSize: "0.85em",
                      color: "#555",
                    }}
                  >
                    <small>Replying to:</small>
                    <div>{highlightText(m.parent.text)}</div>
                  </div>
                )}
                <div>{highlightText(m.text)}</div>
                <div className="badge">
                  {new Date(m.createdAt).toLocaleTimeString()} · {m.status}
                </div>

                <div className="reactions">
                  {aggregated.map((r) => (
                    <span
                      key={r.emoji}
                      className={"reaction" + (r.reacted ? " mine" : "")}
                      onClick={() => reactToMessage(m._id, r.emoji)}
                    >
                      {r.emoji} {r.count}
                    </span>
                  ))}
                  {showReactionsFor === m._id && (
                    <span className="reaction-picker">
                      {EMOJIS.map((e) => (
                        <span key={e} onClick={() => reactToMessage(m._1d, e)}>
                          {e}
                        </span>
                      ))}
                    </span>
                  )}
                </div>

                {isMine && replyingTo?._id === m._id && (
                  <div className="replying">Replying...</div>
                )}
                {!isMine && (
                  <button onClick={() => setReplyingTo(m)}>Reply</button>
                )}
              </div>
            );
          })}
        </div>

        {typingUsers.length > 0 && (
          <div className="typing">{typingUsers.join(", ")} typing...</div>
        )}

        <div
          className="chat-input"
          style={{ display: "flex", padding: "12px", alignItems: "center" }}
        >
          {replyingTo && (
            <div
              className="reply-preview"
              style={{
                marginBottom: 6,
                borderLeft: "4px solid #007bff", // blue vertical line
                paddingLeft: 8,
                fontSize: "0.9em",
                color: "#444",
              }}
            >
              <strong>Replying to:</strong> {replyingTo.text}
              <button
                onClick={() => setReplyingTo(null)}
                style={{ marginLeft: 8, fontSize: "0.8em" }}
              >
                ×
              </button>
            </div>
          )}
          <input
            value={text}
            onChange={handleInputChange}
            placeholder="Type a message"
            onKeyDown={(e) => e.key === "Enter" && send()}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontSize: 16,
              minHeight: 40, // taller input
            }}
          />
          <button
            className="button primary"
            onClick={send}
            style={{ marginLeft: 8, padding: "10px 16px", fontSize: 16 }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
