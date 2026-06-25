if got errors like this:
```json
  hint: 'Grant the required privileges to the current role with: GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;',
  message: 'permission denied for table profiles'
```

## Give privilege SQL to SELECT/INSERT/UPDATE

To give authenticated users the ability to read, insert, and update their own profile, run the following SQL commands:

```sql
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
```

## How to enable RLS

To enable RLS, run the following SQL command:

```sql
alter table public.profiles enable row level security;

grant select, insert, update on table public.profiles to authenticated;
```
