# Database migrations

This directory contains the versioned PostgreSQL schema and policy changes used by the API and admin dashboard. Apply migrations in timestamp order after comparing them with the hosted project's migration history and actual schema.

## Safety

- Back up the hosted database and verify a restore before applying production migrations.
- Apply only migrations that are not already present in the hosted history.
- Do not run `supabase db reset` against a hosted project.
- Keep API releases compatible with the schema version in use; do not run an old API against a schema that has removed fields or tables it expects.
- Use `supabase/tests` and the repository's database checks for disposable/local environments. Passing local checks does not prove the hosted migration history is aligned.

The deployment runbook documents the current release migration range and production procedure.
