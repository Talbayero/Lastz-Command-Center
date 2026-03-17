This is a Next.js alliance dashboard for tracking Last Z player performance, OCR-ing profile screenshots, and storing roster and bug data in PostgreSQL through Prisma.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Set `DATABASE_URL` before running the app so Prisma can connect to your Postgres database.
Set `GEMINI_API_KEY` if you want Gemini vision to help extract player names from screenshots.

## PC Client Capture

You can capture live screenshots directly from the native Last Z desktop window and feed them into the existing import pipeline.

Capture the visible game window into `C:\Users\Teddy A\OneDrive\Escritorio\BOM\pc-captures`:

```bash
npm run capture:pc
```

Capture multiple profiles while you click through the game:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/capture-lastz-window.ps1 -Count 5 -IntervalSeconds 3
```

Import a specific folder of captures into the database without clearing current players:

```bash
node batch_ingest.js "C:\Users\Teddy A\OneDrive\Escritorio\BOM\pc-captures"
```

If you want a clean rebuild first, add `--clear`:

```bash
node batch_ingest.js "C:\Users\Teddy A\OneDrive\Escritorio\BOM\pc-captures" --clear
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Deploy

Deployment instructions are in `DEPLOY.md`.

This version is best deployed on Vercel, Render, or another host that can connect to Postgres.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

For first-time setup, run `npx prisma generate` and `npx prisma db push` after configuring `DATABASE_URL`.
