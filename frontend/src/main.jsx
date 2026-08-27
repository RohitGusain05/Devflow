import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('devflow_token');
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setError(''); setBusy(true); try { const data = await request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) }); localStorage.setItem('devflow_token', data.token); onLogin(data.user); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <main className="auth-shell"><div className="auth-card"><div className="brand"><span className="brand-mark">D</span> DevFlow</div><p className="eyebrow">Developer collaboration platform</p><h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1><p className="muted">Plan work, track issues and collaborate with your engineering team.</p><form onSubmit={submit}>{mode === 'register' && <input required minLength="2" placeholder="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />}<input required type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /><input required minLength="8" type="password" placeholder="Password (8+ characters)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />{error && <div className="error">{error}</div>}<button disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button></form><button className="link-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New to DevFlow? Create an account' : 'Already have an account? Sign in'}</button></div></main>;
}

function Dashboard({ user, onLogout }) {
  const [workspaces, setWorkspaces] = useState([]); const [selected, setSelected] = useState(null); const [error, setError] = useState('');
  async function load() { try { setWorkspaces((await request('/workspaces')).workspaces); } catch (err) { setError(err.message); } }
  useEffect(() => { load(); }, []);
  async function createWorkspace() { const name = window.prompt('Workspace name'); if (!name) return; try { await request('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }); await load(); } catch (err) { setError(err.message); } }
  async function openWorkspace(id) { try { setSelected(await request(`/workspaces/${id}`)); } catch (err) { setError(err.message); } }
  return <div className="app-shell"><nav className="topbar"><div className="brand"><span className="brand-mark">D</span> DevFlow</div><div className="user-menu">{user.name}<button onClick={onLogout}>Log out</button></div></nav><div className="dashboard"><aside className="sidebar"><div className="sidebar-heading">Workspaces <button onClick={createWorkspace}>+</button></div>{!workspaces.length && <p className="muted small">Create your first workspace.</p>}{workspaces.map(w => <button className={`workspace-item ${selected?.workspace?.id === w.id ? 'active' : ''}`} key={w.id} onClick={() => openWorkspace(w.id)}>{w.name}<span>{w.role}</span></button>)}</aside><section className="content">{error && <div className="error">{error}</div>}{!selected ? <div className="empty"><p className="eyebrow">Your engineering workspace</p><h1>Welcome, {user.name.split(' ')[0]}.</h1><p className="lead">Select a workspace or create one to get started.</p></div> : <WorkspaceView data={selected} onRefresh={() => openWorkspace(selected.workspace.id)} />}</section></div></div>;
}

function WorkspaceView({ data, onRefresh }) {
  const { workspace, members, projects } = data; const [project, setProject] = useState(''); const [key, setKey] = useState(''); const [description, setDescription] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function createProject(event) { event.preventDefault(); setBusy(true); setMessage(''); try { await request(`/workspaces/${workspace.id}/projects`, { method: 'POST', body: JSON.stringify({ name: project, key, description }) }); setProject(''); setKey(''); setDescription(''); setMessage('Project created.'); onRefresh(); } catch (err) { setMessage(err.message); } finally { setBusy(false); } }
  return <><header className="page-header"><div><p className="eyebrow">Workspace</p><h1>{workspace.name}</h1></div><span className="role-pill">{data.role}</span></header><div className="stats"><div><strong>{projects.length}</strong><span>Projects</span></div><div><strong>{members.length}</strong><span>Members</span></div></div><div className="grid"><section className="panel"><div className="panel-title"><h2>Projects</h2><span>{projects.length} total</span></div>{projects.map(p => <article className="project-card" key={p.id}><div><strong>{p.key}</strong><h3>{p.name}</h3><p>{p.description || 'No description yet.'}</p></div><span>Open →</span></article>)}{!projects.length && <p className="muted">No projects yet.</p>}</section><section className="panel"><div className="panel-title"><h2>New project</h2></div><form onSubmit={createProject}><input required placeholder="Project name" value={project} onChange={e => setProject(e.target.value)} /><input required placeholder="Key e.g. WEB" maxLength="12" value={key} onChange={e => setKey(e.target.value)} /><textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} /><button disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>{message && <p className="muted small">{message}</p>}</form></section></div></>;
}

function App() {
  const [user, setUser] = useState(null); const [checking, setChecking] = useState(true);
  useEffect(() => { if (!localStorage.getItem('devflow_token')) { setChecking(false); return; } request('/auth/me').then(data => setUser(data.user)).catch(() => localStorage.removeItem('devflow_token')).finally(() => setChecking(false)); }, []);
  if (checking) return <div className="loading">Loading DevFlow…</div>; if (!user) return <Auth onLogin={setUser} />; return <Dashboard user={user} onLogout={() => { localStorage.removeItem('devflow_token'); setUser(null); }} />;
}

createRoot(document.getElementById('root')).render(<App />);
