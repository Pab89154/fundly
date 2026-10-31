# Fundly

Private personal savings app for Pablo’s iPhone Duo goal. **Do not publish a public GitHub repo.**

## Run locally

```bash
cd my-money-tracker
npm install
npm run dev
```

Open **http://localhost:7687**

## PrintX sync (server secrets only)

Copy `.env.example` → `.env` (gitignored). Set:

- `PRINTX_MONEY_TRACKER_API_KEY` — same value as PrintX `MONEY_TRACKER_API_KEY`
- `PRINTX_API_BASE` — `https://printx.pw` (or local PrintX)

Never use `VITE_*` for these keys. The browser calls `/api/printx/sync`; the Vite middleware / Worker adds the Bearer token.

## Scripts

- `npm run dev` — port 7687
- `npm run build`
- `npm run test:money` — allocation / spend balance checks
