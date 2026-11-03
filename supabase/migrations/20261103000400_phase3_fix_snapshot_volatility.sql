begin;

alter function public.get_public_ranka_snapshot(text, text, text, date) volatile;

commit;
