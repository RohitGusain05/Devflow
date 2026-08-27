# DevFlow

**Production-style developer collaboration and issue tracking platform.**

DevFlow is a full-stack SaaS-style application designed to demonstrate practical software engineering skills: secure authentication, relational data modeling, REST APIs, real-time collaboration, caching, background jobs, automated testing, containerization, CI/CD, and cloud deployment.

## Current Status

🚧 Phase 1 — Foundation

The project is being built incrementally with small, reviewable changes. The goal is a working product first, followed by performance, reliability, testing, and deployment improvements.

## Planned Stack

- React + Vite
- Node.js + Express
- PostgreSQL
- Redis
- Socket.IO
- JWT authentication
- Docker / Docker Compose
- GitHub Actions
- Render deployment

## Product Model

`User → Workspace → Project → Issue → Comments / Activity`

## Engineering Goals

- Secure authentication and authorization
- Clean modular backend architecture
- PostgreSQL transactions and constraints
- Pagination and indexed queries
- Redis caching and rate limiting
- Real-time issue and notification events
- Asynchronous background processing
- Unit and integration tests
- Reproducible local development with Docker
- CI checks on every change

## Roadmap

- [x] Repository foundation
- [ ] Authentication
- [ ] Workspaces and membership
- [ ] Projects and issues
- [ ] Comments and activity log
- [ ] Real-time collaboration
- [ ] Redis caching / rate limiting
- [ ] Background jobs and notifications
- [ ] Search and filtering
- [ ] Automated tests
- [ ] Dockerized production setup
- [ ] CI/CD
- [ ] Render deployment
- [ ] Production hardening
- [ ] Optional AI issue assistant

## Local Development

Never commit real secrets. Copy `.env.example` to `.env` for local configuration.
