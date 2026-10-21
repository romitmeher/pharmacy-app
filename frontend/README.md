# SmartPharm frontend

Next.js 16.3.5, React 19 and TypeScript. Run `npm ci`, copy `.env.example` to `.env.local` for a new installation, then `npm run dev`.

The API defaults to `http://127.0.0.1:5000`; set `NEXT_PUBLIC_API_URL` before building to change it. Start at `/login/setup` for a new pharmacy.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

See the [project README](../README.md) for backend setup, migrations, offline behavior and limitations. Read [AGENTS.md](AGENTS.md) and the installed Next.js docs before framework changes.
