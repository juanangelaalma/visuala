alter table public.billing_webhook_events
  drop constraint billing_webhook_events_normalized_status_check,
  add constraint billing_webhook_events_normalized_status_check
    check (normalized_status in ('pending', 'requires_action', 'paid', 'failed', 'expired', 'cancelled', 'ignored', 'requires_review'));
