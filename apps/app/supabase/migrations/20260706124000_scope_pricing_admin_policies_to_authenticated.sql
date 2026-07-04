drop policy if exists "Admins can read all pricing plans" on public.pricing_plans;
drop policy if exists "Admins can insert pricing plans" on public.pricing_plans;
drop policy if exists "Admins can update pricing plans" on public.pricing_plans;
drop policy if exists "Admins can delete pricing plans" on public.pricing_plans;

create policy "Admins can read all pricing plans"
  on public.pricing_plans for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can insert pricing plans"
  on public.pricing_plans for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can update pricing plans"
  on public.pricing_plans for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can delete pricing plans"
  on public.pricing_plans for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
