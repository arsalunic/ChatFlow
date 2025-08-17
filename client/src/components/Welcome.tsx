import React, { useState } from 'react';
import api from '../services/api';

/**
 * Combined login/register screen like a modern messaging app.
 */
export default function Welcome({ onLogin }: { onLogin: () => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ username:'', email:'', name:'', password:'' });
  const [msg, setMsg] = useState('');

  const change = (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister ? form : { username: form.username, password: form.password };
      const resp = await api.post(url, payload);
      localStorage.setItem('token', resp.data.token);
      localStorage.setItem('username', resp.data.user?.username || form.username);
      onLogin();
    } catch (err: any) {
      setMsg(err?.response?.data?.error || 'Request failed');
    }
  };

  return (
    <div className="welcome">
      <h2>ChatFlow</h2>
      <form className="form" onSubmit={submit}>
        <input name="username" placeholder="Username" onChange={change} />
        {isRegister && <input name="email" placeholder="Email" onChange={change} />}
        {isRegister && <input name="name" placeholder="Name" onChange={change} />}
        <input type="password" name="password" placeholder="Password" onChange={change} />
        <button className="button" type="submit">{isRegister ? 'Create account' : 'Login'}</button>
        <button className="button secondary" type="button" onClick={() => setIsRegister(s => !s)}>
          {isRegister ? 'Have an account? Login' : 'New here? Register'}
        </button>
        <div style={{ color:'#c00', minHeight: 20 }}>{msg}</div>
      </form>
    </div>
  );
}
