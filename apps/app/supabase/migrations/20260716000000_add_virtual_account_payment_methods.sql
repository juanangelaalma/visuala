begin;

insert into public.billing_payment_methods
  (slug, kind, label, description, currency, min_amount, max_amount, enabled, launch_phase, sort_order)
values
  ('bca-virtual-account', 'virtual_account', 'BCA Virtual Account', 'Pay via BCA Virtual Account', 'IDR', 10000, 50000000, false, 1, 20),
  ('bni-virtual-account', 'virtual_account', 'BNI Virtual Account', 'Pay via BNI Virtual Account', 'IDR', 1, null, false, 1, 30),
  ('bri-virtual-account', 'virtual_account', 'BRI Virtual Account', 'Pay via BRI Virtual Account', 'IDR', 1, 50000000000, false, 1, 40),
  ('mandiri-virtual-account', 'virtual_account', 'Mandiri Virtual Account', 'Pay via Mandiri Virtual Account', 'IDR', 1, null, false, 1, 50),
  ('permata-virtual-account', 'virtual_account', 'Permata Virtual Account', 'Pay via Permata Virtual Account', 'IDR', 1, 9999999999, false, 1, 60)
on conflict (slug) do nothing;

do $$
begin
  if exists (
    select 1
    from (
      values
        ('bca-virtual-account', 'BCA Virtual Account', 'Pay via BCA Virtual Account', 10000::bigint, 50000000::bigint, 20),
        ('bni-virtual-account', 'BNI Virtual Account', 'Pay via BNI Virtual Account', 1::bigint, null::bigint, 30),
        ('bri-virtual-account', 'BRI Virtual Account', 'Pay via BRI Virtual Account', 1::bigint, 50000000000::bigint, 40),
        ('mandiri-virtual-account', 'Mandiri Virtual Account', 'Pay via Mandiri Virtual Account', 1::bigint, null::bigint, 50),
        ('permata-virtual-account', 'Permata Virtual Account', 'Pay via Permata Virtual Account', 1::bigint, 9999999999::bigint, 60)
    ) as expected(slug, label, description, min_amount, max_amount, sort_order)
    left join public.billing_payment_methods method on method.slug = expected.slug
    where method.id is null
      or method.kind <> 'virtual_account'
      or method.label <> expected.label
      or method.description <> expected.description
      or method.currency <> 'IDR'
      or method.min_amount is distinct from expected.min_amount
      or method.max_amount is distinct from expected.max_amount
      or method.enabled <> false
      or method.launch_phase <> 1
      or method.sort_order <> expected.sort_order
      or method.logo_url is not null
  ) then
    raise exception 'billing_payment_method_seed_conflict:virtual_account';
  end if;
end
$$;

insert into public.billing_payment_method_provider_mappings
  (payment_method_id, provider, environment, mapping_version, provider_method_type, provider_channel_code, provider_config, enabled)
select method.id, 'xendit', environment.name, 1, 'VIRTUAL_ACCOUNT', channel.channel_code, '{"display_name":"Visuala"}'::jsonb, false
from (
  values
    ('bca-virtual-account', 'BCA_VIRTUAL_ACCOUNT'),
    ('bni-virtual-account', 'BNI_VIRTUAL_ACCOUNT'),
    ('bri-virtual-account', 'BRI_VIRTUAL_ACCOUNT'),
    ('mandiri-virtual-account', 'MANDIRI_VIRTUAL_ACCOUNT'),
    ('permata-virtual-account', 'PERMATA_VIRTUAL_ACCOUNT')
) as channel(slug, channel_code)
join public.billing_payment_methods method on method.slug = channel.slug
cross join (values ('test'), ('production')) as environment(name)
on conflict (payment_method_id, provider, environment, mapping_version) do nothing;

do $$
begin
  if exists (
    select 1
    from (
      values
        ('bca-virtual-account', 'BCA_VIRTUAL_ACCOUNT'),
        ('bni-virtual-account', 'BNI_VIRTUAL_ACCOUNT'),
        ('bri-virtual-account', 'BRI_VIRTUAL_ACCOUNT'),
        ('mandiri-virtual-account', 'MANDIRI_VIRTUAL_ACCOUNT'),
        ('permata-virtual-account', 'PERMATA_VIRTUAL_ACCOUNT')
    ) as channel(slug, channel_code)
    join public.billing_payment_methods method on method.slug = channel.slug
    cross join (values ('test'), ('production')) as environment(name)
    left join public.billing_payment_method_provider_mappings mapping
      on mapping.payment_method_id = method.id
      and mapping.provider = 'xendit'
      and mapping.environment = environment.name
      and mapping.mapping_version = 1
    where mapping.id is null
      or mapping.provider_method_type <> 'VIRTUAL_ACCOUNT'
      or mapping.provider_channel_code <> channel.channel_code
      or mapping.provider_config <> '{"display_name":"Visuala"}'::jsonb
      or mapping.enabled <> false
  ) then
    raise exception 'billing_provider_mapping_seed_conflict:virtual_account';
  end if;
end
$$;

commit;
