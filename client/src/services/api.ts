import axios from "axios";

const API_BASE =
  (import.meta as any).env.VITE_API_BASE || "http://localhost:3000";

const api = axios.create({ baseURL: API_BASE });

// Attach auth token
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers = { ...cfg.headers, Authorization: `Bearer ${t}` };
  return cfg;
});

export default api;

/**
 * Search messages inside a specific conversation
 * @param conversationId - chat or group chat id
 * @param query - search text
 */
export async function searchMessages(conversationId: string, query: string) {
  const res = await api.get(
    `/conversations/${conversationId}/messages/search`,
    {
      params: { q: query },
    }
  );
  return res.data; // [{ _id, sender, text, createdAt, ... }]
}
