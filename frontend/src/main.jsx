import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './styles.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? API.replace(/\/api\/?$/, '');

async function request(path, options = {}) {
  const token = localStorage.getItem('devflow_token');
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login'); const [form, setForm] = useState({ name: '', email: '', password: '' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e) { e.preventDefault(); setError(''); setBusy(true); try { const data = await request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) }); localStorage.setItem('devflow_token', data.accessToken); onLogin(data.user); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <main className="auth-shell"><div className="auth-card"><div className="brand"><span className="brand-mark">D</span> DevFlow</div><p className="eyebrow">Developer collaboration platform</p><h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1><p className="muted">Plan work, track issues and collaborate with your engineering team.</p><form onSubmit={submit}>{mode === 'register' && <input required minLength="2" placeholder="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />}<input required type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /><input required minLength="8" type="password" placeholder="Password (8+ characters)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />{error && <div className="error">{error}</div>}<button disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button></form><button className="link-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New to DevFlow? Create an account' : 'Already have an account? Sign in'}</button></div></main>;
}

function IssueBoard({ project, onBack }) {
  const [issues, setIssues] = useState([]); const [form, setForm] = useState({ title: '', description: '', priority: 'medium' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [selected, setSelected] = useState(null); const [live, setLive] = useState(false);
  async function load() { try { setIssues((await request(`/projects/${project.id}/issues?limit=100`)).issues); } catch (e) { setError(e.message); } }
  useEffect(() => {
    load();
    const token = localStorage.getItem('devflow_token');
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => { setLive(true); socket.emit('project:join', project.id, (result) => { if (!result?.ok) setError(result?.error ?? 'Unable to join live project updates'); }); });
    socket.on('disconnect', () => setLive(false));
    socket.on('connect_error', () => setLive(false));
    socket.on('issue:created', ({ issue }) => setIssues(current => current.some(item => item.id === issue.id) ? current : [issue, ...current]));
    socket.on('issue:updated', ({ issue }) => setIssues(current => current.map(item => item.id === issue.id ? issue : item)));
    return () => { socket.emit('project:leave', project.id); socket.disconnect(); };
  }, [project.id]);
  async function createIssue(e) { e.preventDefault(); setBusy(true); setError(''); try { await request(`/projects/${project.id}/issues`, { method: 'POST', body: JSON.stringify(form) }); setForm({ title: '', description: '', priority: 'medium' }); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function move(issue, status) { try { const data = await request(`/issues/${issue.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setIssues(current => current.map(item => item.id === data.issue.id ? data.issue : item)); } catch (e) { setError(e.message); } }
  const columns = [['todo', 'Todo'], ['in_progress', 'In Progress'], ['in_review', 'In Review'], ['done', 'Done']];
  return <div><button className="back" onClick={onBack}>← Workspace</button><header className="page-header"><div><p className="eyebrow">{project.key} · Project</p><h1>{project.name}</h1><p className="muted">{project.description || 'Track and ship engineering work.'}</p></div><span className={`role-pill ${live ? '' : 'offline'}`}>{live ? '● Live' : '○ Reconnecting'}</span></header>{error && <div className="error">{error}</div>}<div className="issue-layout"><section className="board">{columns.map(([status, label]) => <div className="column" key={status}><div className="column-title"><strong>{label}</strong><span>{issues.filter(i => i.status === status).length}</span></div>{issues.filter(i => i.status === status).map(issue => <button className="issue-card" key={issue.id} onClick={() => setSelected(issue)}><span>{project.key}-{issue.issue_number}</span><strong>{issue.title}</strong><small className={`priority ${issue.priority}`}>{issue.priority}</small></button>)}</div>)}</section><aside className="panel issue-form"><h2>New issue</h2><form onSubmit={createIssue}><input required minLength="3" placeholder="Issue title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /><textarea placeholder="Describe the problem or task" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /><select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select><button disabled={busy}>{busy ? 'Creating…' : 'Create issue'}</button></form></aside></div>{selected && <IssueModal issue={selected} project={project} onClose={() => setSelected(null)} onMove={async s => { await move(selected, s); setSelected(null); }} />}</div>;
}

function IssueModal({ issue, project, onClose, onMove }) {
  const [comments, setComments] = useState([]); const [body, setBody] = useState(''); const [error, setError] = useState('');
  async function load() { try { setComments((await request(`/issues/${issue.id}/comments`)).comments); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, [issue.id]);
  async function comment(e) { e.preventDefault(); if (!body.trim()) return; try { await request(`/issues/${issue.id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); await load(); } catch (e) { setError(e.message); } }
  return <div className="modal-backdrop"><div className="modal"><button className="close" onClick={onClose}>×</button><p className="eyebrow">{project.key}-{issue.issue_number}</p><h2>{issue.title}</h2><p>{issue.description || 'No description.'}</p><div className="modal-actions"><button onClick={() => onMove('in_progress')}>Start</button><button onClick={() => onMove('in_review')}>Review</button><button onClick={() => onMove('done')}>Complete</button></div><hr /><h3>Comments</h3>{comments.map(c => <div className="comment" key={c.id}><strong>{c.author_name}</strong><p>{c.body}</p></div>)}<form onSubmit={comment} className="comment-form"><input placeholder="Add a comment…" value={body} onChange={e => setBody(e.target.value)} /><button>Add</button></form>{error && <div className="error">{error}</div>}</div></div>;
}

function WorkspaceView({ data, onRefresh }) {
  const { workspace, members, projects } = data; const [project, setProject] = useState(''); const [key, setKey] = useState(''); const [description, setDescription] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [openProject, setOpenProject] = useState(null);
  if (openProject) return <IssueBoard project={openProject} onBack={() => setOpenProject(null)} />;
  async function createProject(e) { e.preventDefault(); setBusy(true); setMessage(''); try { await request(`/workspaces/${workspace.id}/projects`, { method: 'POST', body: JSON.stringify({ name: project, key, description }) }); setProject(''); setKey(''); setDescription(''); setMessage('Project created.'); onRefresh(); } catch (e) { setMessage(e.message); } finally { setBusy(false); } }
  return <><header className="page-header"><div><p className="eyebrow">Workspace</p><h1>{workspace.name}</h1></div><span className="role-pill">{data.role}</span></header><div className="stats"><div><strong>{projects.length}</strong><span>Projects</span></div><div><strong>{members.length}</strong><span>Members</span></div><div><strong>Live</strong><span>Workspace</span></div></div><div className="grid"><section className="panel"><div className="panel-title"><h2>Projects</h2><span>{projects.length} total</span></div>{projects.map(p => <button className="project-card" key={p.id} onClick={() => setOpenProject(p)}><div><strong>{p.key}</strong><h3>{p.name}</h3><p>{p.description || 'No description yet.'}</p></div><span>Open →</span></button>)}{!projects.length && <p className="muted">No projects yet.</p>}</section><section className="panel"><div className="panel-title"><h2>New project</h2></div><form onSubmit={createProject}><input required placeholder="Project name" value={project} onChange={e => setProject(e.target.value)} /><input required placeholder="Key e.g. WEB" maxLength="12" value={key} onChange={e => setKey(e.target.value)} /><textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} /><button disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>{message && <p className="muted small">{message}</p>}</form></section></div></>;
}

function Dashboard({ user, onLogout }) {
  const [workspaces, setWorkspaces] = useState([]); const [selected, setSelected] = useState(null); const [error, setError] = useState('');
  async function load() { try { setWorkspaces((await request('/workspaces')).workspaces); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  async function createWorkspace() { const name = window.prompt('Workspace name'); if (!name) return; try { await request('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }); await load(); } catch (e) { setError(e.message); } }
  async function openWorkspace(id) { try { setSelected(await request(`/workspaces/${id}`)); } catch (e) { setError(e.message); } }
  return <div className="app-shell"><nav className="topbar"><div className="brand"><span className="brand-mark">D</span> DevFlow</div><div className="user-menu">{user.name}<button onClick={onLogout}>Log out</button></div></nav><div className="dashboard"><aside className="sidebar"><div className="sidebar-heading">Workspaces <button onClick={createWorkspace}>+</button></div>{!workspaces.length && <p className="muted small">Create your first workspace.</p>}{workspaces.map(w => <button className={`workspace-item ${selected?.workspace?.id === w.id ? 'active' : ''}`} key={w.id} onClick={() => openWorkspace(w.id)}>{w.name}<span>{w.role}</span></button>)}</aside><section className="content">{error && <div className="error">{error}</div>}{!selected ? <div className="empty"><p className="eyebrow">Your engineering workspace</p><h1>Welcome, {user.name.split(' ')[0]}.</h1><p className="lead">Select a workspace or create one to get started.</p></div> : <WorkspaceView data={selected} onRefresh={() => openWorkspace(selected.workspace.id)} />}</section></div></div>;
}

function App() { const [user, setUser] = useState(null); const [checking, setChecking] = useState(true); useEffect(() => { if (!localStorage.getItem('devflow_token')) { setChecking(false); return; } request('/auth/me').then(d => setUser(d.user)).catch(() => localStorage.removeItem('devflow_token')).finally(() => setChecking(false)); }, []); if (checking) return <div className="loading">Loading DevFlow…</div>; if (!user) return <Auth onLogin={setUser} />; return <Dashboard user={user} onLogout={() => { localStorage.removeItem('devflow_token'); setUser(null); }} />; }
createRoot(document.getElementById('root')).render(<App />);
