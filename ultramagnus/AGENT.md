# Ultramagnus Project - AI Agent Reference

This document serves as the baseline context for AI agents working on the **Ultramagnus** project. It outlines the architecture, technology stack, project structure, and development guidelines.

## 1. Project Overview
**Ultramagnus** is an AI-powered equity analysis platform. It consists of a React-based frontend ("Moonshot") and a Node.js/Express backend ("Ultramagnus BFF"). The system leverages Google's GenAI for analysis and Supabase for authentication and data persistence.

## 2. Technology Stack

### 2.1 Frontend (`/moonshot`)
*   **Framework:** React 19 (Vite)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS
*   **State Management:** React Hooks (`useState`, `useEffect`, `useContext`)
*   **Authentication:** Supabase Auth (`@supabase/supabase-js`)
*   **Visualization:** Recharts
*   **Icons:** Lucide React
*   **AI Integration:** `@google/genai` (Direct client-side usage for some features)

### 2.2 Backend (`/backend`)
*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Language:** TypeScript (`ts-node-esm`)
*   **Database ORM:** Drizzle ORM
*   **Database:** PostgreSQL
*   **Authentication:** JWT (JSON Web Tokens) & Supabase Integration
*   **AI Integration:** `@google/genai`

### 2.3 Infrastructure & Tools
*   **Package Manager:** npm
*   **Database Migrations:** Drizzle Kit
*   **Documentation:** Markdown files in `/docs`

## 3. Project Structure

```
/
├── backend/                # Express.js Backend
│   ├── drizzle/            # Database migrations (SQL)
│   ├── src/
│   │   ├── config/         # Environment & App Config
│   │   ├── db/             # Drizzle Client & Schema Definitions
│   │   ├── middleware/     # Auth & Error Handling Middleware
│   │   ├── routes/         # API Route Definitions
│   │   ├── utils/          # Helper functions
│   │   ├── app.ts          # Express App Setup
│   │   └── server.ts       # Server Entry Point
│   ├── .env                # Backend Environment Variables
│   ├── drizzle.config.ts   # Drizzle Configuration
│   └── package.json
│
├── moonshot/               # React Frontend
│   ├── src/
│   │   ├── components/     # Reusable UI Components
│   │   ├── lib/            # External Library Clients (Supabase, etc.)
│   │   ├── services/       # API & Logic Services
│   │   ├── App.tsx         # Main Application Component
│   │   └── main.tsx        # Entry Point
│   ├── .env.local          # Frontend Environment Variables
│   ├── vite.config.ts      # Vite Configuration
│   └── package.json
│
├── docs/                   # Project Documentation & PRDs
└── supabase/               # Supabase Configuration & Migrations
```

## 4. Key Development Commands

### Backend
*   `npm run dev`: Start the development server (watch mode).
*   `npm run build`: Compile TypeScript to JavaScript.
*   `npm run start`: Run the compiled production server.
*   `npm run db:generate`: Generate SQL migrations from Drizzle schema changes.
*   `npm run db:migrate`: Apply migrations to the database.

### Frontend
*   `npm run dev`: Start the Vite development server.
*   `npm run build`: Build the application for production.
*   `npm run preview`: Preview the production build locally.

## 5. Coding Standards & Guidelines

### 5.1 General
*   **TypeScript:** Use strict typing. Avoid `any` whenever possible. Define interfaces for all data structures (Props, API responses, DB models).
*   **Async/Await:** Prefer `async/await` over `.then()` chains for readability.
*   **Environment Variables:** Never hardcode secrets. Use `process.env` (Backend) or `import.meta.env` (Frontend).
*   **Documentation format:** Write all new docs/PRDs as Markdown `.md` files and place them in the appropriate `docs/` subfolder.

### 5.4 File Format Rules
*   Text files use UTF-8 (ASCII preferred if possible) with a trailing newline; avoid BOM.
*   Indentation: 2 spaces for TypeScript/JavaScript/JSON/TOML; never tabs unless required by an existing file.
*   Line endings: LF only. Keep lines under ~120 chars where practical.
*   Do not introduce non-ASCII characters unless already present or clearly justified.
*   Preserve existing file conventions; match surrounding style if a file differs from defaults.

### 5.5 Docs & Specs Checklist
*   Tech specs must include a brief implementation checklist near the end of the document; keep items actionable (e.g., “Wire GET /api/dashboard”, “Add bookmark pinning UI”).
*   PRDs do not require checklists; include acceptance criteria there only if useful for clarity.
*   When planning work, break development into small, sequential phases with clear milestones and deliverables; prefer multiple short iterations over monolithic drops. Each phase should have bite-sized tasks that can ship independently.
*   For tech specs, split the implementation checklist into FE and BE tracks. Start with FE development (can use mock data) to validate UX quickly before wiring backend; then follow with BE integration.
*   Any tech spec involving persisted data must include backend storage design (tables/fields/indexes/ACL rules) alongside the plan.
*   When changing backend data models, always add the corresponding Drizzle migration files; do not rely on schema.ts changes alone.

### 5.2 Backend
*   **Architecture:** Follow a layered architecture: Route -> Controller -> Service -> Data Access.
*   **Error Handling:** Use a centralized error handling middleware. Log errors using the defined logging standards (see `docs/logging-system-prd.md`).
*   **Database:** Always use Drizzle ORM for database interactions. Update `schema.ts` and run migrations for schema changes.

### 5.3 Frontend
*   **Components:** Functional components with Hooks. Keep components small and focused.
*   **Styling:** Use Tailwind CSS utility classes. Avoid inline styles.
*   **State:** Lift state up when shared. Use Context for global state (Auth, Theme).

## 6. Environment Setup
*   **Backend:** Requires a `.env` file with `DATABASE_URL`, `GEMINI_API_KEY`, `JWT_SECRET`, etc.
*   **Frontend:** Requires a `.env.local` file with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`.

## 7. Documentation References
*   **Logging:** `docs/logging-system-prd.md` - Requirements for the unified logging system.
*   **Authentication:** `docs/Sign-in function/` - Specs for the sign-in flow.
*   **Architecture:** `docs/architecture-bff.md` - Backend-for-Frontend architecture details.

## 8. Agent Operating Notes
- **When in doubt:** Prefer `rg` for search; check relevant `docs/` folder before coding; don’t use destructive git commands; never overwrite env files with secrets.
- **Testing defaults:** Backend `npm run lint`; frontend `npm run lint`. Skip heavy builds unless requested. If tests are absent or slow, note it in the handoff.
- **Critical paths & gotchas:** Avoid editing generated artifacts; skip searching large binaries; follow sandbox rules if present; respect existing dirty worktree changes.
- **Documentation locations:** Auth flows in `docs/Sign-in function/`; dashboards in `docs/personalized dashboard/`; logging in `docs/logging-system-prd.md`; architecture in `docs/architecture-bff.md`.
- **PR hygiene:** Short, imperative subjects; link issues/docs; note commands run; add screenshots for UI changes.
