import React, { useEffect, useState } from 'react';
import Welcome from './components/Welcome';
import ChatLayout from './components/ChatLayout';

/**
 * App entry decides between welcome (login/register) and chat UI.
 */
export default function App() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => { if (localStorage.getItem('token')) setAuthed(true); }, []);
  return authed ? (
    <ChatLayout onLogout={() => { localStorage.removeItem('token'); localStorage.removeItem('username'); setAuthed(false); }} />
  ) : (
    <Welcome onLogin={() => setAuthed(true)} />
  );
}
