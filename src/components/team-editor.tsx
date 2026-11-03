"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { swapPlayersBetweenSquads } from "@/domain/ranka/rules";
import type { Player, Squad } from "@/domain/ranka/types";

export interface TeamSwapResult {
  status: "success" | "error";
  message: string;
  revision?: number;
}

type Pick = { squadId: string; playerId: string };

export function TeamEditor({
  initialSquads,
  players,
  initialRevision,
  action,
}: {
  initialSquads: Squad[];
  players: Player[];
  initialRevision: number;
  action: (formData: FormData) => Promise<TeamSwapResult>;
}) {
  const [squads, setSquads] = useState(initialSquads);
  const [revision, setRevision] = useState(initialRevision);
  const [selected, setSelected] = useState<Pick>();
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const names = new Map(players.map((player) => [player.id, player.fullName]));

  function exchange(first: Pick, second: Pick) {
    if (pending || first.squadId === second.squadId || first.playerId === second.playerId) return;
    const previous = squads;
    let optimistic: Squad[];
    try {
      optimistic = swapPlayersBetweenSquads(previous, first, second);
    } catch {
      return;
    }
    setSquads(optimistic);
    setSelected(undefined);
    setMessage(undefined);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("firstSquadId", first.squadId);
      formData.set("firstPlayerId", first.playerId);
      formData.set("secondSquadId", second.squadId);
      formData.set("secondPlayerId", second.playerId);
      formData.set("expectedRevision", String(revision));
      formData.set("idempotencyKey", crypto.randomUUID());
      const result = await action(formData);
      if (result.status === "error") {
        setSquads(previous);
        setMessage(result.message);
        return;
      }
      if (result.revision) setRevision(result.revision);
      setMessage("Times atualizados.");
      router.refresh();
      window.setTimeout(() => setMessage(undefined), 1800);
    });
  }

  function choose(pick: Pick) {
    if (!selected) return setSelected(pick);
    if (selected.squadId === pick.squadId) return setSelected(pick);
    exchange(selected, pick);
  }

  return (
    <section className="team-editor" aria-busy={pending}>
      <div className="team-editor-head">
        <strong>Ajustar times</strong>
        <span>Toque em dois jogadores de times diferentes ou arraste para trocar.</span>
      </div>
      <div className="team-editor-grid">
        {squads.map((squad, index) => (
          <article className="team-editor-card" key={squad.id}>
            <header>
              <span className={index === 0 ? "team-dot yellow" : index === 1 ? "team-dot red" : "team-dot"} />
              <strong>T{squad.number}</strong>
              <small>{squad.playerIds.length} jogadores</small>
            </header>
            <div className="team-editor-list">
              {squad.playerIds.map((playerId, playerIndex) => {
                const pick = { squadId: squad.id, playerId };
                const active = selected?.squadId === squad.id && selected.playerId === playerId;
                return (
                  <button
                    type="button"
                    className={active ? "team-player selected" : "team-player"}
                    key={playerId}
                    draggable={!pending}
                    onClick={() => choose(pick)}
                    onDragStart={(event) => event.dataTransfer.setData("application/json", JSON.stringify(pick))}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      try { exchange(JSON.parse(event.dataTransfer.getData("application/json")) as Pick, pick); } catch { /* dado externo ignorado */ }
                    }}
                  >
                    <span>{playerIndex + 1}</span>
                    {names.get(playerId) ?? "Jogador"}
                    <i aria-hidden>⇄</i>
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </div>
      {message && <div className={message.startsWith("Times") ? "team-editor-toast" : "team-editor-toast error"} role="status">{message}</div>}
    </section>
  );
}
