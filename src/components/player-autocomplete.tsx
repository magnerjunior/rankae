"use client";

import { useMemo, useState } from "react";
import { findPlayerMatches } from "@/domain/ranka/rules";
import type { Player } from "@/domain/ranka/types";

export function PlayerAutocomplete({ players, name = "playerId", label = "Buscar jogador" }: { players: Player[]; name?: string; label?: string }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Player>();
  const matches = useMemo(() => query.trim() ? findPlayerMatches(players, query).slice(0, 6) : players.slice(0, 6), [players, query]);
  return <div className="search-wrap" style={{flex: 1}}>
    <label className="sr-only" htmlFor={`${name}-search`}>{label}</label>
    <input id={`${name}-search`} className="input" autoComplete="off" value={selected ? selected.fullName : query} onChange={(event) => { setSelected(undefined); setQuery(event.target.value); }} placeholder="Nome, apelido ou alias" />
    <input type="hidden" name={name} value={selected?.id ?? ""} />
    {!selected && query.trim() && <div className="search-results" role="listbox" aria-label="Resultados de jogadores">
      {matches.length ? matches.map((player) => <button className="search-option" type="button" role="option" aria-selected="false" key={player.id} onClick={() => setSelected(player)}><span><strong>{player.fullName}</strong><small className="muted" style={{display: "block"}}>{player.aliases.join(" · ") || "Sem alias"}</small></span><span className="badge">{player.role === "keeper" ? "Goleiro" : "Linha"}</span></button>) : <div className="notice notice-warning">Nenhum perfil encontrado. Cadastre sem mesclar homônimos automaticamente.</div>}
    </div>}
  </div>;
}
