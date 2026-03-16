# Deploying Last Z on the Web

This app now uses Prisma with PostgreSQL instead of a local SQLite file.

## Recommended free-friendly stack

- Vercel for the app
- Neon or Supabase for the Postgres database

This removes the persistent-disk requirement and works much better on free hosting.

## Environment variable

Set this in your host:

- `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require`

## First-time database setup

After creating your Postgres database and setting `DATABASE_URL`, run:

```bash
npx prisma generate
npx prisma db push
```

## Vercel

1. Push this repo to GitHub.
2. Create a Postgres database in Neon or Supabase.
3. Copy its connection string into `DATABASE_URL`.
4. Import this repo into Vercel.
5. Add the `DATABASE_URL` environment variable in Vercel.
6. Deploy.

## Render

1. Push this repo to GitHub.
2. Create a managed Postgres database or use Neon/Supabase.
3. Create a new web service from the repo.
4. Set `DATABASE_URL`.
5. Deploy.
