begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('caa10000-0000-4000-8000-000000000001', 'team-owner@example.test', now(), '{}'),
  ('caa10000-0000-4000-8000-000000000002', 'team-member@example.test', now(), '{"rankae_team_only":true}'),
  ('caa10000-0000-4000-8000-000000000003', 'team-outsider@example.test', now(), '{}'),
  ('caa10000-0000-4000-8000-000000000004', 'team-admin@example.test', now(), '{}');
insert into public.platform_admins(user_id) values ('caa10000-0000-4000-8000-000000000004');
insert into public.organizations(id,name,owner_user_id,collaborator_limit) values
  ('caa10000-0000-4000-8000-000000000011', 'Equipe do dono', 'caa10000-0000-4000-8000-000000000001', 1),
  ('caa10000-0000-4000-8000-000000000012', 'Outra equipe', 'caa10000-0000-4000-8000-000000000003', 3);
insert into public.rankas(id,org_id,slug,name) values
  ('caa10000-0000-4000-8000-000000000021', 'caa10000-0000-4000-8000-000000000011', 'team-a', 'Primeiro ranka'),
  ('caa10000-0000-4000-8000-000000000022', 'caa10000-0000-4000-8000-000000000011', 'team-b', 'Segundo ranka'),
  ('caa10000-0000-4000-8000-000000000023', 'caa10000-0000-4000-8000-000000000012', 'team-c', 'Ranka alheio');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"caa10000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('rankae.team_invite', public.create_team_invite('caa10000-0000-4000-8000-000000000011', 'TEAM-MEMBER@example.test')::text, true);
select is(public.create_team_invite('caa10000-0000-4000-8000-000000000011', 'team-member@example.test')::text, current_setting('rankae.team_invite'), 'repeated invitation reuses its reserved seat');
select throws_ok($$select public.create_team_invite('caa10000-0000-4000-8000-000000000011', 'second@example.test')$$, 'PT409', 'Collaborator limit reached', 'pending invitations reserve a seat');
select throws_ok($$select public.team_invite_delivery(current_setting('rankae.team_invite')::uuid, false)$$, '42501', null, 'only the server can resolve the invitation email');

set local role service_role;
select is(public.team_invite_delivery(current_setting('rankae.team_invite')::uuid, true)->>'email', 'team-member@example.test', 'email delivery resolves the designated mailbox');
select throws_ok($$select public.team_invite_delivery(current_setting('rankae.team_invite')::uuid, true)$$, 'PT429', 'Wait before requesting another code', 'repeat email delivery is throttled');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"caa10000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.accept_team_invite(current_setting('rankae.team_invite')::uuid)$$, '42501', 'Invite belongs to another email', 'another email cannot redeem the invite');
select set_config('request.jwt.claims', '{"sub":"caa10000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.get_ranka_entitlement()->>'limit', '0', 'new team-only account has no personal ranka allowance');
select is(public.accept_team_invite(current_setting('rankae.team_invite')::uuid)->>'needsPassword', 'true', 'matching verified email can join and create a password');
select ok(private.can_manage_ranka('caa10000-0000-4000-8000-000000000021') and private.can_manage_ranka('caa10000-0000-4000-8000-000000000022'), 'collaborator can operate all rankas within the organization');
select ok(not private.can_manage_ranka('caa10000-0000-4000-8000-000000000023'), 'collaborator cannot operate an unrelated ranka');
select throws_ok($$select public.create_team_invite('caa10000-0000-4000-8000-000000000011', 'third@example.test')$$, '42501', 'Only the owner can invite collaborators', 'collaborator cannot invite others');
select throws_ok($$select public.create_ranka_workspace('Meu grupo', 'Meu ranka', 'team-personal')$$, '23514', 'Ranka limit reached', 'team-only account cannot create its own workspace');
select throws_ok($$insert into public.organizations(name,owner_user_id) values ('Grupo sem licença','caa10000-0000-4000-8000-000000000002')$$, '42501', null, 'direct writes cannot bypass the workspace quota');
select throws_ok($$select public.admin_get_ranka_review('caa10000-0000-4000-8000-000000000023')$$, '42501', 'Forbidden', 'ordinary organizer cannot access the global review');
select throws_ok($$select public.accept_team_invite(current_setting('rankae.team_invite')::uuid)$$, 'PT404', 'Invite is unavailable', 'invite cannot be redeemed twice');

select set_config('request.jwt.claims', '{"sub":"caa10000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.admin_set_team_limit('caa10000-0000-4000-8000-000000000011', 0)$$, 'PT409', 'Remove collaborators or pending invites before reducing the limit', 'admin cannot reduce below occupied seats');
select lives_ok($$select public.admin_set_team_limit('caa10000-0000-4000-8000-000000000011', 4)$$, 'admin can expand the team quota');
select is(public.admin_get_ranka_review('caa10000-0000-4000-8000-000000000023')->>'name', 'Ranka alheio', 'platform admin can inspect a ranka outside their organizations');
select set_config('request.jwt.claims', '{"sub":"caa10000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.remove_team_access('caa10000-0000-4000-8000-000000000011', (public.get_owned_teams()->0->'members'->0->>'id')::uuid, false)$$, 'owner can remove a collaborator');
select set_config('request.jwt.claims', '{"sub":"caa10000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select ok(not private.can_manage_ranka('caa10000-0000-4000-8000-000000000021'), 'removed collaborator loses ranka operations');
select * from finish();
rollback;
