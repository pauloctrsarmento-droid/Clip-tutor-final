---
globs: ["**/supabase/**", "**/migrations/**", "**/repositories/**", "**/prisma/**", "**/drizzle/**", "**/db/**"]
---

# Database Rules

## Migrations
- NEVER modify existing migration files — always create new ones
- Migration names must be descriptive: `add_user_email_index`, not `update_table`
- Test migrations both up and down before committing
- Always regenerate types after schema changes (`pnpm db:generate` or equivalent)

## Schema Design
- Every table must have `id`, `created_at`, `updated_at`
- Use UUIDs for primary keys (not auto-increment integers)
- Explicit `ON DELETE` behavior on every foreign key — never rely on defaults
- Use enums for fixed value sets, not magic strings
- Index foreign keys and frequently queried columns

## Row Level Security (RLS)
- Enable RLS on ALL tables that contain user data
- Policies must be restrictive by default (deny all, then allow specific)
- Test RLS policies with different user roles
- Document the intent of each policy

## Query Patterns
- Use the repository pattern — no raw SQL in services
- Parameterized queries only — NEVER string interpolation
- Select only needed columns — no `SELECT *` in production code
- Use transactions for multi-table writes

## Supabase Specific
- Use Supabase client with proper typing from generated types
- Prefer RPC functions for complex queries
- Use realtime subscriptions sparingly — they have connection limits
