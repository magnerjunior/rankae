"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { absenceDetails, selectPlayerActivityRows, type PlayerAbsenceOrder, type PlayerActivity, type PlayerActivityFilter, type PendingContribution } from "@/domain/player-activity";
import type { Player } from "@/domain/ranka/types";
import { payPendingContributionAction, setPlayerMembershipAction } from "@/app/app/rankas/[rankaId]/actions";
import { batchContributionsAction } from "@/app/app/rankas/[rankaId]/actions";

type Row = {
  player: Player;
  activity?: PlayerActivity;
};

export function PlayerDirectory({ rows, today, rankaId, sessionId, revision, presentIds, waivedIds, pending, debtFilter }: { rows: Row[]; today: string; rankaId: string; sessionId?: string; revision: number; presentIds: string[]; waivedIds: string[]; pending: PendingContribution[]; debtFilter: boolean }) {
  const [filter, setFilter] = useState<PlayerActivityFilter>(debtFilter ? "debt" : "all");
  const [order, setOrder] = useState<PlayerAbsenceOrder>("longest");
  const visible = useMemo(() => selectPlayerActivityRows(rows, filter, order, today), [filter, order, rows, today]);
  const byPlayer = useMemo(() => Map.groupBy(pending, (record) => record.player_id), [pending]);

  return <>
    <div className="player-directory-controls">
      <label className="field">Mostrar
        <select className="select" value={filter} onChange={(event) => setFilter(event.target.value as PlayerActivityFilter)}>
          <option value="all">Todos os jogadores</option>
          <option value="debt">Com contribuição pendente</option>
          <option value="absent">Que perderam encontros</option>
        </select>
      </label>
      <label className="field">Ordenar por ausência
        <select className="select" value={order} onChange={(event) => setOrder(event.target.value as PlayerAbsenceOrder)}>
          <option value="longest">Há mais tempo sem ir</option>
          <option value="shortest">Há menos tempo sem ir</option>
        </select>
      </label>
      <span className="badge">{visible.length} de {rows.length}</span>
    </div>
    {visible.map(({ player, activity }) => {
      const absence = activity ? absenceDetails(activity, today) : undefined;
      return <div className="person-row player-catalog-row" key={player.id}>
        <span className="avatar">{player.fullName.split(" ").slice(0, 2).map((part) => part[0]).join("")}</span>
        <span className="person-info">
          <strong>{player.fullName}</strong>
          <small>{player.role === "keeper" ? "Goleiro" : "Linha"}</small>
          {absence && activity && <details className="player-activity" open={debtFilter && activity.unpaid_sessions > 0 ? true : undefined}>
            <summary><span className={absence.alert ? "activity-alert" : ""}>{absence.alert ? "Atenção · " : ""}{absence.short}</span>{activity.unpaid_sessions > 0 && <span className="activity-debt">{activity.unpaid_sessions} {activity.unpaid_sessions === 1 ? "contribuição pendente" : "contribuições pendentes"}</span>}</summary>
            <small>{activity.last_seen_on ? `Última presença em ${activity.last_seen_on.split("-").reverse().join("/")} · ` : "Sem presença registrada · "}{absence.exact}{activity.unpaid_sessions > 0 ? ` · ${activity.unpaid_cents.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em aberto` : ""}</small>
            {byPlayer.get(player.id)?.map((record) => <form className="player-payment" key={record.session_id} action={payPendingContributionAction.bind(null, rankaId, record.session_id, player.id, record.revision)}>
              <input type="hidden" name="idempotencyKey" value={record.requestId} />
              <span>{record.scheduled_on.split("-").reverse().join("/")}{record.session_number > 1 ? ` · Encontro ${record.session_number}` : ""} · {(record.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              <button className="button button-secondary button-small">Marcar como pago</button>
            </form>)}
          </details>}
        </span>
        <form className="player-membership-form" action={setPlayerMembershipAction.bind(null, rankaId, player.id)}>
          <select className="select" name="membership" defaultValue={player.membership ?? "regular"} aria-label={`Vínculo de ${player.fullName}`}>
            <option value="regular">Fixo</option><option value="guest">Visitante</option>
          </select>
          <button className="button button-secondary button-small">Salvar</button>
        </form>
        {sessionId && presentIds.includes(player.id) && <WaiveButton sessionId={sessionId} revision={revision} playerId={player.id} isWaived={waivedIds.includes(player.id)} />}
      </div>;
    })}
    {visible.length === 0 && <p className="muted">Nenhum jogador corresponde a este filtro.</p>}
  </>;
}

function WaiveButton({ sessionId, revision, playerId, isWaived }: { sessionId: string; revision: number; playerId: string; isWaived: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return <div className="player-waiver-form">
    <button className="button button-quiet button-small" type="button" disabled={isWaived || pending} onClick={async () => {
      setPending(true);
      const form = new FormData();
      form.set("playerIds", playerId);
      form.set("status", "waived");
      form.set("idempotencyKey", crypto.randomUUID());
      const result = await batchContributionsAction(sessionId, revision, form);
      setMessage(result.message);
      setPending(false);
      if (result.status === "success") router.refresh();
    }}>{pending ? "Salvando…" : isWaived ? "Isento nesta rodada" : "Isentar nesta rodada"}</button>
    {message && <span className="sr-only" role="status">{message}</span>}
  </div>;
}
