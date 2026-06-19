# Phase 0 — Foundation & Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `hush` monorepo where all three apps (Expo mobile, Next.js dashboard, FastAPI ai-service) boot, the FastAPI `/health` endpoint passes a test, and secrets are handled correctly from line one.

**Architecture:** A single repo using **npm workspaces** for the JS/TS apps + packages, and an isolated **Python venv** for the FastAPI service. The Supabase backend is represented locally as migration + seed files (PostGIS enabled via migration); creating the cloud project requires the Supabase CLI + login and is documented, not automated. Env/secret hygiene (`.env.example`, git-ignored `.env`, audit scripts, no service-role key in clients) is set up before any app code.

**Tech Stack:** npm workspaces · TypeScript · Expo (React Native) · Next.js 15 + Tailwind · FastAPI + Pydantic + pytest · Supabase (PostGIS migration) · Node 24 / Python 3.13.

**Environment notes (verified):** `node v24`, `npm 11`, `corepack 0.34`, `python 3.13`, `pip 25.3`, `git 2.52` are present. `pnpm`, `uv`, and `supabase` CLI are **not** installed — this plan uses npm + venv + pip accordingly. Windows + Git Bash; run JS via `npm`, Python via the venv.

---

## File structure produced by this plan

```
hush/  (= repo root, the OGIS working dir)
├─ package.json              # npm workspaces root, dev/audit scripts
├─ tsconfig.base.json        # shared TS compiler options
├─ .gitignore               # ignores .env, node_modules, venv, build output
├─ .env.example             # every required var documented (SR-2)
├─ README.md
├─ apps/
│  ├─ mobile/               # Expo + TS app shell
│  ├─ dashboard/            # Next.js + Tailwind shell
│  └─ ai-service/           # FastAPI + pytest, GET /health
├─ packages/
│  ├─ shared-types/         # TS contracts (placeholder export in P0)
│  └─ config/               # shared tsconfig + env schema
└─ supabase/
   ├─ config.toml           # local Supabase config (project id placeholder)
   ├─ migrations/           # 0001_enable_postgis.sql
   └─ seed/                 # seed.sql placeholder
```

> The repo root **is** the existing working directory (`.../OGIS`). We do not create a nested `hush/` folder — the existing `CLAUDE.md` and `documents/` stay at root.

---

## Task 1: Repo bootstrap, git, and secret hygiene (SR-2, SR-14)

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `README.md`

- [ ] **Step 1: Initialize git**

Run:
```bash
git init
git config core.autocrlf false
```
Expected: `Initialized empty Git repository`.

- [ ] **Step 2: Write `.gitignore`**

```gitignore
# deps
node_modules/
.pnp.*
# python
.venv/
__pycache__/
*.pyc
.pytest_cache/
# env / secrets (SR-2)
.env
.env.*
!.env.example
# builds
.next/
dist/
build/
.expo/
*.tsbuildinfo
# os / editor
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Write `.env.example`** (documents every var; no real values — SR-2)

```dotenv
# ---- Supabase (client-safe: anon key + URL only) ----
SUPABASE_URL=
SUPABASE_ANON_KEY=
# Service-role key is SERVER-ONLY. It must NEVER appear in apps/mobile or apps/dashboard. (SR-2)
SUPABASE_SERVICE_ROLE_KEY=

# ---- AI service (server-only) ----
# Claude key lives ONLY in apps/ai-service env. Never bundled into any client. (SR-2)
ANTHROPIC_API_KEY=
AI_SERVICE_PORT=8000

# ---- Next.js dashboard (only NEXT_PUBLIC_* reach the browser bundle) ----
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# ---- Expo mobile (only EXPO_PUBLIC_* reach the device bundle) ----
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 4: Write root `package.json`** (npm workspaces + audit + dev scripts)

```json
{
  "name": "hush",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "apps/dashboard",
    "apps/mobile",
    "packages/shared-types",
    "packages/config"
  ],
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "dev:dashboard": "npm run dev --workspace apps/dashboard",
    "dev:mobile": "npm run start --workspace apps/mobile",
    "dev:ai": "bash scripts/run-ai.sh",
    "audit:js": "npm audit --audit-level=high",
    "audit:py": "bash scripts/audit-py.sh",
    "audit": "npm run audit:js && npm run audit:py",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 5: Write `tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "composite": true
  }
}
```

- [ ] **Step 6: Write `README.md`** (top-level orientation)

```markdown
# Hush

A 100% software platform that turns a physical place into a measurable, rewarded
zone of intentional digital silence. Core metric: the **Quiet Index** (0–100).

## Repo layout
- `apps/mobile` — Expo / React Native user app (Android-first)
- `apps/dashboard` — Next.js operator console
- `apps/ai-service` — FastAPI Claude orchestration service
- `packages/shared-types` — TS contracts shared by mobile + dashboard
- `packages/config` — shared tsconfig + env schema
- `supabase/` — Postgres/PostGIS migrations + seed

## Prerequisites
Node 20+, Python 3.11+, git. Optional: Supabase CLI (for the live backend).

## Quick start
```bash
cp .env.example .env          # fill in values; .env is git-ignored (SR-2)
npm install                   # installs JS workspaces
npm run dev:ai -- --setup     # creates the Python venv + installs ai-service deps
npm run dev                   # boots dashboard + mobile + ai-service
```

## Security baseline
- No secrets in any client bundle (SR-2). Clients use only the Supabase **anon** key.
  The service-role key and Claude key live only in `apps/ai-service` env.
- Run `npm run audit` before submission (SR-14).
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example package.json tsconfig.base.json README.md
git commit -m "chore: bootstrap hush monorepo with secret hygiene (SR-2, SR-14)"
```

---

## Task 2: Shared packages (`shared-types`, `config`)

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/index.ts`

- [ ] **Step 1: `packages/shared-types/package.json`**

```json
{
  "name": "@hush/shared-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -b"
  }
}
```

- [ ] **Step 2: `packages/shared-types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: `packages/shared-types/src/index.ts`** (P0 placeholder; full contracts land in Phase 1)

```ts
// Shared contracts for Hush. Full Zone/Session/ScorePing types are authored in
// Phase 1 from the DB schema so the three apps can never drift.
export const SHARED_TYPES_VERSION = "0.0.0" as const;
```

- [ ] **Step 4: `packages/config/package.json`**

```json
{
  "name": "@hush/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

- [ ] **Step 5: `packages/config/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: `packages/config/src/index.ts`** (env var name registry — single source of truth for SR-2 review)

```ts
// Names of env vars consumed by each surface. Centralized so a security review
// can assert no server-only secret name is referenced from a client surface.
export const CLIENT_SAFE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export const SERVER_ONLY_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
] as const;
```

- [ ] **Step 7: Commit**

```bash
git add packages
git commit -m "feat: add shared-types and config workspace packages"
```

---

## Task 3: FastAPI ai-service with `/health` (TDD)

**Files:**
- Create: `apps/ai-service/pyproject.toml`
- Create: `apps/ai-service/app/__init__.py`
- Create: `apps/ai-service/app/main.py`
- Create: `apps/ai-service/tests/__init__.py`
- Create: `apps/ai-service/tests/test_health.py`
- Create: `scripts/run-ai.sh`
- Create: `scripts/audit-py.sh`

- [ ] **Step 1: `apps/ai-service/pyproject.toml`**

```toml
[project]
name = "hush-ai-service"
version = "0.0.0"
description = "Hush FastAPI service: Claude orchestration + Quiet Index helpers"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "pydantic>=2.9",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "httpx>=0.27",
    "pip-audit>=2.7",
]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

- [ ] **Step 2: Create the venv and install deps**

Run:
```bash
python -m venv apps/ai-service/.venv
apps/ai-service/.venv/Scripts/python.exe -m pip install -e "apps/ai-service[dev]"
```
Expected: installs fastapi, uvicorn, pydantic, pytest, httpx, pip-audit.

- [ ] **Step 3: Write the failing test** `apps/ai-service/tests/test_health.py`

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

Also create empty `apps/ai-service/tests/__init__.py` and `apps/ai-service/app/__init__.py`.

- [ ] **Step 4: Run test, verify it fails**

Run:
```bash
apps/ai-service/.venv/Scripts/python.exe -m pytest apps/ai-service/tests/test_health.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 5: Write minimal implementation** `apps/ai-service/app/main.py`

```python
from fastapi import FastAPI

app = FastAPI(title="Hush AI Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run test, verify it passes**

Run:
```bash
apps/ai-service/.venv/Scripts/python.exe -m pytest apps/ai-service/tests/test_health.py -v
```
Expected: `1 passed`.

- [ ] **Step 7: Write `scripts/run-ai.sh`** (venv-aware runner; `--setup` creates venv)

```bash
#!/usr/bin/env bash
set -euo pipefail
SVC="apps/ai-service"
PY="$SVC/.venv/Scripts/python.exe"
[ -f "$PY" ] || PY="$SVC/.venv/bin/python"   # cross-platform venv path

if [ "${1:-}" = "--setup" ]; then
  python -m venv "$SVC/.venv"
  "$PY" -m pip install --upgrade pip
  "$PY" -m pip install -e "$SVC[dev]"
  exit 0
fi

PORT="${AI_SERVICE_PORT:-8000}"
exec "$PY" -m uvicorn app.main:app --app-dir "$SVC" --port "$PORT" --reload
```

- [ ] **Step 8: Write `scripts/audit-py.sh`** (SR-14)

```bash
#!/usr/bin/env bash
set -euo pipefail
SVC="apps/ai-service"
PY="$SVC/.venv/Scripts/python.exe"
[ -f "$PY" ] || PY="$SVC/.venv/bin/python"
"$PY" -m pip_audit
```

- [ ] **Step 9: Commit**

```bash
git add apps/ai-service scripts/run-ai.sh scripts/audit-py.sh
git commit -m "feat(ai-service): FastAPI shell with passing /health test (TDD)"
```

---

## Task 4: Next.js dashboard shell

**Files:**
- Create: `apps/dashboard/package.json`
- Create: `apps/dashboard/next.config.mjs`
- Create: `apps/dashboard/tsconfig.json`
- Create: `apps/dashboard/postcss.config.mjs`
- Create: `apps/dashboard/tailwind.config.ts`
- Create: `apps/dashboard/app/globals.css`
- Create: `apps/dashboard/app/layout.tsx`
- Create: `apps/dashboard/app/page.tsx`

- [ ] **Step 1: `apps/dashboard/package.json`**

```json
{
  "name": "@hush/dashboard",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: `apps/dashboard/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 3: `apps/dashboard/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: `apps/dashboard/postcss.config.mjs`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 5: `apps/dashboard/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Design Brief palette anchor; expanded in later phases.
        ink: "#0E1116",
        mist: "#F4F6F8",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 6: `apps/dashboard/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body {
  background: theme(colors.ink);
  color: theme(colors.mist);
}
```

- [ ] **Step 7: `apps/dashboard/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hush — Operator Console",
  description: "Quiet Index operator dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: `apps/dashboard/app/page.tsx`** (placeholder)

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-light tracking-wide">Hush — operator console</h1>
    </main>
  );
}
```

- [ ] **Step 9: Install + verify dev boot**

Run:
```bash
npm install
npm run build --workspace apps/dashboard
```
Expected: `npm install` resolves workspaces; `next build` completes (compiles the placeholder page). Boot check (`next dev`) is manual.

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard
git commit -m "feat(dashboard): Next.js + Tailwind placeholder shell"
```

---

## Task 5: Expo mobile shell

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/babel.config.js`
- Create: `apps/mobile/index.ts`
- Create: `apps/mobile/App.tsx`

- [ ] **Step 1: `apps/mobile/package.json`**

```json
{
  "name": "@hush/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.5"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~18.3.12",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: `apps/mobile/app.json`**

```json
{
  "expo": {
    "name": "Hush",
    "slug": "hush",
    "version": "0.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "android": { "package": "com.hush.app" },
    "newArchEnabled": true
  }
}
```

- [ ] **Step 3: `apps/mobile/tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  }
}
```

- [ ] **Step 4: `apps/mobile/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
```

- [ ] **Step 5: `apps/mobile/index.ts`**

```ts
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
```

- [ ] **Step 6: `apps/mobile/App.tsx`** (blank calm screen)

```tsx
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hush</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0E1116",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#F4F6F8", fontSize: 28, fontWeight: "200", letterSpacing: 2 },
});
```

- [ ] **Step 7: Install + typecheck**

Run:
```bash
npm install
npm run typecheck --workspace apps/mobile
```
Expected: install resolves Expo deps; `tsc --noEmit` passes. (Full emulator boot is a manual device step, documented in README.)

- [ ] **Step 8: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): Expo + TypeScript blank app shell"
```

---

## Task 6: Supabase local scaffold (PostGIS migration + seed)

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/0001_enable_postgis.sql`
- Create: `supabase/seed/seed.sql`

- [ ] **Step 1: `supabase/config.toml`** (minimal; project_id is a placeholder until `supabase link`)

```toml
project_id = "hush-local"

[db]
major_version = 15

[api]
enabled = true
```

- [ ] **Step 2: `supabase/migrations/0001_enable_postgis.sql`**

```sql
-- Enable PostGIS for geofencing (zone polygons, point-in-polygon check-in).
-- Schema + RLS policies are authored in Phase 1.
create extension if not exists postgis;
```

- [ ] **Step 3: `supabase/seed/seed.sql`** (placeholder; real demo operator + zone seeded in Phase 1)

```sql
-- Seed data is authored in Phase 1 (one demo operator + one demo zone).
-- Placeholder kept so the supabase/seed path exists from Phase 0.
select 1;
```

- [ ] **Step 4: Commit**

```bash
git add supabase
git commit -m "feat(supabase): local scaffold with PostGIS-enable migration"
```

---

## Task 7: Root dev orchestration + final verification (SR-2, SR-14 gates)

**Files:**
- Create: `scripts/dev.mjs`

- [ ] **Step 1: Write `scripts/dev.mjs`** (boots all three apps concurrently with no extra deps)

```js
// Boots dashboard + mobile + ai-service together. Pure Node, no extra deps.
import { spawn } from "node:child_process";

const procs = [
  ["dashboard", "npm", ["run", "dev", "--workspace", "apps/dashboard"]],
  ["mobile", "npm", ["run", "start", "--workspace", "apps/mobile"]],
  ["ai-service", "bash", ["scripts/run-ai.sh"]],
];

const children = procs.map(([name, cmd, args]) => {
  const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  child.on("exit", (code) => console.log(`[${name}] exited ${code}`));
  return child;
});

const shutdown = () => children.forEach((c) => c.kill());
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

- [ ] **Step 2: SR-2 gate — assert no server-only secret is referenced from a client app**

Run:
```bash
grep -rIl --exclude-dir=node_modules -e "SERVICE_ROLE" -e "ANTHROPIC_API_KEY" apps/mobile apps/dashboard || echo "CLEAN: no server-only secrets in client apps"
```
Expected: `CLEAN: no server-only secrets in client apps`.

- [ ] **Step 3: SR-2 gate — assert `.env` is git-ignored and untracked**

Run:
```bash
git check-ignore .env && echo "OK: .env is ignored"
git ls-files .env | grep -q . && echo "FAIL: .env tracked" || echo "OK: .env not tracked"
```
Expected: `.env` is ignored and not tracked.

- [ ] **Step 4: SR-14 gate — audit scripts run**

Run:
```bash
npm run audit:js
```
Expected: npm audit runs and reports at the high level (0 high/critical vulns is the pass condition; note any findings).

- [ ] **Step 5: Re-run the FastAPI health test (green exit criteria)**

Run:
```bash
apps/ai-service/.venv/Scripts/python.exe -m pytest apps/ai-service -v
```
Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add scripts/dev.mjs
git commit -m "feat: root dev orchestration; pass SR-2/SR-14 Phase 0 gates"
```

---

## Exit criteria checklist (Phase 0)

- [ ] All three apps scaffolded; dashboard builds, mobile typechecks, ai-service `/health` test passes.
- [ ] `npm install` resolves workspaces with no errors.
- [ ] `.env.example` complete; `.env` git-ignored and untracked (SR-2).
- [ ] No service-role / Claude key referenced from any client app (SR-2).
- [ ] `npm run audit` (js + py) wired and runnable (SR-14).
- [ ] PostGIS-enable migration present under `supabase/migrations`.
- [ ] Repo committed at each task.

## Deferred / documented (not automated in Phase 0)

- Creating the **cloud** Supabase project + `supabase link` (needs the Supabase CLI + login) — documented in README, executed in Phase 1 when schema lands.
- Expo **custom dev client** native build + emulator boot — needs Android SDK on a device machine; the shell + typecheck stand in for CI here.
