# Database & migrations

Production schema changes are applied ONLY by `scripts/migrate.mjs` (`prisma migrate deploy`), which runs automatically before the server starts (`npm start`).

**Never** use `prisma db push --accept-data-loss` against a shared/production DB: it drops every table not in `schema.prisma` (this wiped the UK-to-US app's `shop_rules`/`shop_tokens` on every deploy and restart).

## Changing the schema
1. Edit `prisma/schema.prisma`.
2. Against a LOCAL/dev MySQL: `npx prisma migrate dev --name <what_changed>`
3. Commit the new folder in `prisma/migrations/` and push. Deploy applies it.

`migrate deploy` only runs your migration SQL and never touches tables it doesn't own.
