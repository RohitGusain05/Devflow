import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand"><span className="brand-mark">D</span> DevFlow</div>
        <span className="status">● Foundation online</span>
      </nav>
      <section className="hero">
        <p className="eyebrow">Developer collaboration platform</p>
        <h1>Build. Track. Ship.</h1>
        <p className="lead">A focused workspace for teams to plan issues, collaborate in real time, and ship better software.</p>
        <div className="cards">
          <article><strong>Projects</strong><span>Organize work by team and project.</span></article>
          <article><strong>Issues</strong><span>Track ownership, priority and progress.</span></article>
          <article><strong>Realtime</strong><span>Stay synchronized as teammates work.</span></article>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
