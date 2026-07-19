# Ancla

Private diet & gym coach web app with **secure login**. Your personal plan lives in **SQLite on the server**, not in the public GitHub tree.

## Security model

| What | Where |
|---|---|
| UI shell (React) | This repo (public OK) |
| Auth (bcrypt + httpOnly session cookies) | Server |
| Personal meal/workout plan | `data/seed.private.json` → SQLite (`data/ancla.db`) — **gitignored** |
| Daily check-ins | SQLite — **gitignored** |
| Demo plan only | `data/seed.example.json` (safe placeholder) |

Never commit: `.env`, `data/seed.private.json`, `data/*.db`, PDFs, medical notes, or personal exports.

Run before every push:

```bash
npm run audit
```

## Quick start (local)

```bash
cp .env.example .env
# edit ANCLA_USERNAME + ANCLA_PASSWORD (min 12 chars)

# Put your real plan here (not committed):
cp data/seed.example.json data/seed.private.json
# then edit seed.private.json with your real plan

npm install
npm run dev
```

- Web: http://127.0.0.1:5173  
- API: http://127.0.0.1:8787  

First API boot creates the user + loads the seed into SQLite.

## Production (VPS)

```bash
npm install
npm run build
cp .env.example .env   # set strong secrets
# ensure data/seed.private.json exists on the server (scp/rsync; do not put in git)
npm start
```

Serve behind HTTPS (Caddy/Nginx). Sessions use `Secure` cookies when `NODE_ENV=production`.

### Suggested Nginx

```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

### systemd (sketch)

```ini
[Service]
WorkingDirectory=/opt/ancla
EnvironmentFile=/opt/ancla/.env
ExecStart=/usr/bin/npm start
Restart=always
```

## Stack

- React + Vite (frontend)
- Hono + better-sqlite3 (API + DB)
- bcryptjs password hashing
- Session cookies (`httpOnly`, `SameSite=Lax`, `Secure` in prod)
- Login rate limit (per IP)

## Exercise GIFs

Optional media in `public/exercises/` from [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)  
© Gym visual — see `public/exercises/NOTICE.md`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | API + Vite together |
| `npm run build` | Production frontend build |
| `npm start` | Serve API + static `dist/` |
| `npm run audit` | Block push if personal markers leak into source |
| `npm run seed` | Check seed/env presence |

## License

MIT for application code. Exercise media remains © Gym visual under their terms.
