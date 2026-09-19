begin;

insert into public.billing_payment_methods
  (slug, kind, label, description, currency, min_amount, max_amount, enabled, launch_phase, sort_order)
values
  ('bca-virtual-account', 'virtual_account', 'BCA Virtual Account', 'Pay via BCA Virtual Account', 'IDR', 10000, 50000000, false, 1, 20),
  ('bni-virtual-account', 'virtual_account', 'BNI Virtual Account', 'Pay via BNI Virtual Account', 'IDR', 1, null, false, 1, 30),
  ('bri-virtual-account', 'virtual_account', 'BRI Virtual Account', 'Pay via BRI Virtual Account', 'IDR', 1, 50000000000, false, 1, 40),
  ('mandiri-virtual-account', 'virtual_account', 'Mandiri Virtual Account', 'Pay via Mandiri Virtual Account', 'IDR', 1, null, false, 1, 50),
  ('permata-virtual-account', 'virtual_account', 'Permata Virtual Account', 'Pay via Permata Virtual Account', 'IDR', 1, 9999999999, false, 1, 60)
on conflict (slug) do update
set
  kind = excluded.kind,
  label = excluded.label,
  description = excluded.description,
  logo_url = null,
  currency = excluded.currency,
  min_amount = excluded.min_amount,
  max_amount = excluded.max_amount,
  enabled = excluded.enabled,
  launch_phase = excluded.launch_phase,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.billing_payment_method_provider_mappings
  (payment_method_id, provider, environment, mapping_version, provider_method_type, provider_channel_code, provider_config, enabled)
select
  method.id,
  'xendit',
  environment.name,
  1,
  'VIRTUAL_ACCOUNT',
  channel.channel_code,
  '{"display_name":"Visuala"}'::jsonb,
  false
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
on conflict (payment_method_id, provider, environment, mapping_version) do update
set
  provider_method_type = excluded.provider_method_type,
  provider_channel_code = excluded.provider_channel_code,
  provider_config = excluded.provider_config,
  enabled = excluded.enabled,
  updated_at = now();

commit;
