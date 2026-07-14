# Supabase Migrations

## Applying the Koda MVP migration

### Option 1: Supabase CLI (recommended)

1. Link your project if you haven't already:

   ```bash
   supabase link --project-ref <your-project-ref>
   ```

2. Push the migration to your remote database:

   ```bash
   supabase db push
   ```

   This applies all pending files in `supabase/migrations/` in order.

### Option 2: Run SQL directly

1. Open the Supabase Dashboard > SQL Editor.
2. Paste the contents of `supabase/migrations/20260710000000_koda_mvp_schema.sql`.
3. Click **Run**.

### Option 3: psql

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260710000000_koda_mvp_schema.sql
```

## Notes

- The existing `waitlist` table is not affected by this migration.
- All new tables have Row Level Security enabled. Users can only access their own rows.
