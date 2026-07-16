update public.billing_payment_methods
set enabled = true
where slug = 'qris';

select * from public.billing_payment_method_provider_mappings