import axios from 'axios';
const API_BASE = (import.meta as any).env.VITE_API_BASE || 'http://localhost:3000';
const api = axios.create({ baseURL: API_BASE });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('token');
  if (t) cfg.headers = { ...cfg.headers, Authorization: `Bearer ${t}` };
  return cfg;
});
export default api;
