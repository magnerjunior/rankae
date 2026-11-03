# Modelo de dados e segurança no banco

## Entidades (estrutura conceitual; Codex escreverá migrations reais)
- `organizations(id, name, owner_user_id, created_at)`
- `organization_members(id, org_id, user_id, role, active)`; role superadmin não é gravada como membro comum.
- `rankas(id, org_id, slug, name, timezone, visibility, settings_json, invite_token_hash, pin_hash, rules_version)`
- `ranka_organizers(id, ranka_id, member_id, role)` — máximo 3 coorganizadores + proprietário.
- `players(id, org_id, full_name, normalized_name, nickname, normalized_nickname, status)`
- `player_aliases(id, player_id, alias, normalized_alias)` para Magner / Junior / Magner Junior, confirmação de identidade na UI.
- `sessions(id, ranka_id, scheduled_on, state, contribution_amount_cents, rules_snapshot, season_year)`
- `attendance(id, session_id, player_id, arrival_index, arrived_at, status, role_preference)` UNIQUE(session,player), UNIQUE(session,arrival_index)
- `squads(id, session_id, squad_number, state, creation_order)`
- `squad_members(id, squad_id, player_id, assigned_at, removed_at, assignment_reason)`; integridade de membros ativos.
- `keeper_assignments(id, session_id, match_id, keeper_player_id, squad_id?, field_side?, mode, active)`
- `match_support_roles(id, match_id, player_id, role=borrowed_keeper|ball_boy, field_side?, status)`
- `matches(id, session_id, ordinal, yellow_squad_id, red_squad_id, state, regulation_duration_ms, overtime_duration_ms, clock_snapshot, rule_snapshot, revision, started_at, ended_at)`
- `match_lineups(id, match_id, player_id, squad_id, field_side, role, start_ms, end_ms)`
- `match_events(id, match_id, event_type, side, scorer_player_id?, assist_player_id?, keeper_player_id?, goal_kind?, occurrence_ms, status, metadata, idempotency_key, created_by, created_at, voided_at)`
- `penalty_shootouts`, `penalty_attempts(id, match_id, shooter_player_id?, goalkeeper_player_id?, side, outcome, shot_order)`
- `contribution_records(id, session_id, player_id, amount_cents, status, recorded_by, recorded_at)` UNIQUE(session,player)
- `access_grants(id, ranka_id, scope, expires_at, token_hash, revoked_at)`
- `award_snapshots`, `audit_logs`, `observability_events`, `legal_documents`, `legal_acceptances`, `incident_records`.

## Modelagem / invariantes
- Todos os relacionamentos devem validar que os filhos pertencem à mesma organização/ranka/sessão; preferir constraints, FKs compostas e procedimentos transacionais.
- `full_name` canoniza cadastro; normalized + aliases são busca, nunca fusão automática de jogadores homônimos.
- Ordenação por chegada atribuída no servidor com lock/transação; índice não depende de clock client.
- Cada `event_type` valida quais IDs são obrigatórios/opcionais; gol sem autor permitido.
- Event sourcing leve: eventos + projeções; soft delete/cancelamento auditado para correções.
- Criação de times não pode reescrever eventos de jogos já concluídos.
- Operações importantes usam `revision` / compare-and-swap e idempotency keys.

## RLS
- Negar por padrão todas as tabelas privadas; políticas por usuário autenticado, vínculo e `organization_id`.
- Leituras públicas só por **views/RPC de projeção** com campos explicitamente permitidos e verificações de visibilidade no servidor; nunca `SELECT *` da tabela de atletas/finanças.
- Admin SaaS com sessão reforçada, auditoria, acesso minimizado; sem bypass irrestrito em frontend.
- Testes multi-tenant obrigatórios: organizador A não lê nem escreve dados de B; visitante não consulta PIN hash, pagamentos ou contatos.
- Evitar função `security definer` sem `search_path` fixo, validação de scope e revisão de privilégios.
- Segredos exclusivamente server-side via env, zero chaves service_role no client.

## Migrações
SQL versionado e reversible quando viável, seeds de dados **fictícios**, índices e constraints antes de abrir tráfego; migrations staging testadas antes de produção.
