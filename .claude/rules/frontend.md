---
globs: ["**/frontend/**", "**/*.tsx", "**/*.jsx"]
---

# Frontend Rules

## Next.js App Router
- Use App Router conventions (app/ directory, page.tsx, layout.tsx, loading.tsx, error.tsx)
- Server Components by default — add `"use client"` only when you need browser APIs, hooks, or event handlers
- Use `generateMetadata` for SEO, not `<Head>`
- Prefer Server Actions for mutations when appropriate

## Data Fetching
- NEVER call backend/database directly from client components
- Use custom hooks for API calls (e.g., `useQuery`, `useMutation` patterns)
- Fetch data in Server Components or via API routes
- Handle loading, error, and empty states for every data fetch

## Components
- One component per file, file name matches the default export
- Functional components only — no class components
- Props interface defined above the component, named `{ComponentName}Props`
- Use Tailwind CSS exclusively — no inline styles, no CSS modules
- Colocate component-specific types in the same file

## State Management
- Local state with `useState`/`useReducer` first
- Lift state only when genuinely shared
- Context for cross-cutting concerns (theme, auth, i18n)
- No global state libraries unless explicitly decided

## Accessibility
- Semantic HTML elements (nav, main, section, article, button)
- All interactive elements must be keyboard accessible
- Images need meaningful alt text
- Form inputs need associated labels
