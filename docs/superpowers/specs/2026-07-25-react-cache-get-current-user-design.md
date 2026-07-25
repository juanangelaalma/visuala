# Design: React `cache()` for `getCurrentUser`

## Problem

`getCurrentUser()` makes an HTTP request to Supabase auth server every time it's called. In server components, if multiple components/pages in the same render tree call it, redundant requests occur.

## Solution

Wrap `getCurrentUser` with React's `cache()` to deduplicate within a single request render tree.

## Changes

### File: `apps/app/application/auth/get-current-user.ts`

```ts
import { cache } from 'react'
import type { AuthProvider } from '@/domain/auth/auth-provider'

export const getCurrentUser = cache(async (authProvider: AuthProvider) => {
  return authProvider.getCurrentUser()
})
```

## How It Works

- React `cache()` stores the result within one request render tree
- If `getCurrentUser(authProvider)` is called 3 times in one page render (layout + 2 components), only 1 request to Supabase happens
- Cache automatically resets between requests (per navigation/page load)

## What Doesn't Change

- All call sites continue using `getCurrentUser(authProvider)` — no changes needed
- `AuthProvider` interface unchanged
- `SupabaseAuthAdapter` unchanged
- No new files, new patterns, or architecture changes

## Impact

| Before | After |
|--------|-------|
| 1 page with 3 call sites: 3 requests | 1 page with 3 call sites: 1 request |
| Dashboard layout + child pages: N requests | Same (per page load, still 1 per page) |

## Risks

- React `cache()` only works in React Server Components — client components calling `getCurrentUser` won't be cached (this is correct since client components shouldn't call Supabase directly)
- No behavior change — only deduplication
