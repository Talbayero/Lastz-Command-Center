# Deploying Last Z on the Web

This app is a Next.js server-rendered app that writes data to a local SQLite database.

## Best hosting choice for this version

Use a host that supports:

- a long-running Node server
- Docker deploys
- a persistent disk/volume

Good fits:

- Railway
- Render
- any VPS running Docker

Avoid Vercel for the current version because the app stores data in SQLite on disk, and Vercel's serverless filesystem is not a good fit for persistent writes.

## Environment variables

Set these in your host:

- `NODE_ENV=production`
- `SQLITE_PATH=/data/lastz.db`

`DATABASE_URL` is only needed if you later start using Prisma runtime queries in production.

## Railway or Render

1. Push this repo to GitHub.
2. Create a new web service from the repo.
3. Choose Docker deployment.
4. Attach a persistent disk and mount it at `/data`.
5. Set the environment variable `SQLITE_PATH=/data/lastz.db`.
6. Expose port `3000` if the platform asks.
7. Deploy.

## Local production test

```bash
docker build -t lastz-web .
docker run -p 3000:3000 -e SQLITE_PATH=/data/lastz.db -v lastz-data:/data lastz-web
```

Then open `http://localhost:3000`.
