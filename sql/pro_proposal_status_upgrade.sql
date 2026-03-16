begin;

alter table public.proposals
  drop constraint if exists proposals_status_check;

alter table public.proposals
  add constraint proposals_status_check
  check (
    status = any (
      array[
        'pending'::text,
        'accepted'::text,
        'rejected'::text,
        'in_progress'::text,
        'completed'::text,
        'cancel_requested_owner'::text,
        'cancel_requested_dev'::text,
        'cancelled'::text
      ]
    )
  );

commit;
