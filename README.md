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
