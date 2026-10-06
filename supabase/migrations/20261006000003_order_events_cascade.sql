-- The append-only trigger on order_events also fired for ON DELETE CASCADE, which made it
-- impossible to delete an order, project or organization. History rows must never be edited;
-- removal happens only through cascades from the parent (clients have no write grants at all).
drop trigger if exists order_events_append_only on public.order_events;
create trigger order_events_no_update before update on public.order_events
  for each row execute function public.forbid_mutation();
