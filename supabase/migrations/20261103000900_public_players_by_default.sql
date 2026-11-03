-- O portal habilitado mostra automaticamente os nomes esportivos dos jogadores ativos.
alter table public.players alter column public_visible set default true;

update public.players
set public_visible = true,
    public_display_name = coalesce(nullif(trim(public_display_name), ''), nullif(trim(nickname), ''), split_part(trim(full_name), ' ', 1)),
    revision = revision + 1,
    updated_at = now()
where status = 'active'
  and (not public_visible or public_display_name is null);

create or replace function private.default_public_player_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' then
    new.public_visible := true;
    new.public_display_name := coalesce(nullif(trim(new.public_display_name), ''), nullif(trim(new.nickname), ''), split_part(trim(new.full_name), ' ', 1));
  end if;
  return new;
end;
$$;

drop trigger if exists players_default_public_profile on public.players;
create trigger players_default_public_profile
before insert or update of full_name, nickname, status on public.players
for each row execute function private.default_public_player_profile();
