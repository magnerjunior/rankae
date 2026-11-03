"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseArrivalList, type ArrivalImportEntry } from "@/domain/ranka/arrival-import";
import type { ArrivalItem, ArrivalMutationResult } from "@/app/app/rankas/[rankaId]/actions";

type MutationAction<T> = (input: T & { expectedRevision: number; idempotencyKey: string }) => Promise<ArrivalMutationResult>;

interface ArrivalManagerProps {
  rankaId: string;
  sessionId: string;
  initialRevision: number;
  initialEntries: ArrivalItem[];
  knownNames: string[];
  maxLinePlayers: number;
  maxKeepers: number;
  squadSize: number;
  canStartExisting: boolean;
  activeGameHref?: string;
  addAction: MutationAction<{ fullName: string; role: "line" | "keeper" }>;
  bulkAction: MutationAction<{ entries: ArrivalImportEntry[] }>;
  reorderAction: MutationAction<{ playerId: string; targetPosition: number }>;
  renameAction: MutationAction<{ playerId: string; fullName: string }>;
  removeAction: MutationAction<{ playerId: string }>;
  startGameAction: () => Promise<void>;
}

function renumber(entries: ArrivalItem[]): ArrivalItem[] {
  return entries.map((entry, index) => ({ ...entry, arrivalIndex: index + 1 }));
}

function mergeEntries(current: ArrivalItem[], incoming: ArrivalItem[], optimisticPrefix?: string): ArrivalItem[] {
  const base = optimisticPrefix ? current.filter((entry) => !entry.id.startsWith(optimisticPrefix)) : current;
  const byPlayer = new Map(base.map((entry) => [entry.id.startsWith("temp-") ? entry.id : entry.playerId, entry]));
  incoming.forEach((entry) => byPlayer.set(entry.playerId, entry));
  return [...byPlayer.values()].toSorted((a, b) => a.arrivalIndex - b.arrivalIndex);
}

export function ArrivalManager(props: ArrivalManagerProps) {
  const [entries, setEntries] = useState(() => props.initialEntries.toSorted((a, b) => a.arrivalIndex - b.arrivalIndex));
  const [name, setName] = useState("");
  const [role, setRole] = useState<"line" | "keeper">("line");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [message, setMessage] = useState("Pronto para adicionar.");
  const [syncing, setSyncing] = useState(0);
  const revisionRef = useRef(props.initialRevision);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const inputRef = useRef<HTMLInputElement>(null);
  const cacheKey = `rankae:arrival:${props.rankaId}:${props.sessionId}`;
  const draftKey = `${cacheKey}:bulk-draft`;
  const parsedBulk = useMemo(() => parseArrivalList(bulkText), [bulkText]);
  const lineCount = entries.filter((entry) => entry.role === "line").length;
  const keeperCount = entries.filter((entry) => entry.role === "keeper").length;
  const requiredLines = props.squadSize * 2;
  const canStart = lineCount >= requiredLines || props.canStartExisting;

  useEffect(() => {
    const safeEntries = entries.filter((entry) => !entry.id.startsWith("temp-"));
    localStorage.setItem(cacheKey, JSON.stringify({ revision: revisionRef.current, entries: safeEntries, savedAt: Date.now() }));
  }, [cacheKey, entries]);

  function enqueue<T>(action: MutationAction<T>, input: T, onSuccess: (result: ArrivalMutationResult) => void, onError: () => void) {
    setSyncing((current) => current + 1);
    queueRef.current = queueRef.current.then(async () => {
      const result = await action({ ...input, expectedRevision: revisionRef.current, idempotencyKey: crypto.randomUUID() });
      if (result.status === "success") {
        if (result.revision) revisionRef.current = result.revision;
        setMessage(result.message);
        onSuccess(result);
      } else {
        setMessage(result.message);
        onError();
      }
    }).catch(() => {
      setMessage("A conexão oscilou. Tente novamente.");
      onError();
    }).finally(() => setSyncing((current) => Math.max(0, current - 1)));
  }

  function addOne() {
    const fullName = name.trim().replace(/\s+/g, " ");
    if (fullName.length < 2) return;
    const optimisticId = `temp-${crypto.randomUUID()}`;
    const optimistic: ArrivalItem = { id: optimisticId, playerId: optimisticId, fullName, role, arrivalIndex: entries.length + 1 };
    setEntries((current) => [...current, optimistic]);
    setName("");
    setRole("line");
    setMessage(`${fullName} adicionado. Salvando…`);
    inputRef.current?.focus();
    enqueue(props.addAction, { fullName, role }, (result) => {
      setEntries((current) => mergeEntries(current.filter((entry) => entry.id !== optimisticId), result.arrivals ?? []));
    }, () => setEntries((current) => renumber(current.filter((entry) => entry.id !== optimisticId))));
  }

  function importBulk() {
    if (!parsedBulk.entries.length) return;
    const prefix = `temp-bulk-${crypto.randomUUID()}`;
    const optimistic = parsedBulk.entries.map<ArrivalItem>((entry, index) => ({
      id: `${prefix}-${index}`,
      playerId: `${prefix}-${index}`,
      fullName: entry.fullName,
      role: entry.role,
      arrivalIndex: entries.length + index + 1,
    }));
    setEntries((current) => [...current, ...optimistic]);
    setMessage(`${optimistic.length} jogadores adicionados. Salvando…`);
    setBulkOpen(false);
    setBulkText("");
    localStorage.removeItem(draftKey);
    enqueue(props.bulkAction, { entries: parsedBulk.entries }, (result) => {
      setEntries((current) => mergeEntries(current, result.arrivals ?? [], prefix));
    }, () => setEntries((current) => renumber(current.filter((entry) => !entry.id.startsWith(prefix)))));
  }

  function move(entry: ArrivalItem, direction: -1 | 1) {
    if (entry.id.startsWith("temp-")) return;
    const previous = entries;
    const currentIndex = entries.findIndex((item) => item.id === entry.id);
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= entries.length) return;
    const moved = [...entries];
    [moved[currentIndex], moved[targetIndex]] = [moved[targetIndex], moved[currentIndex]];
    setEntries(renumber(moved));
    setMessage("Ordem alterada. Salvando…");
    enqueue(props.reorderAction, { playerId: entry.playerId, targetPosition: targetIndex + 1 }, (result) => {
      if (result.arrivals) setEntries(result.arrivals);
    }, () => setEntries(previous));
  }

  function saveName(entry: ArrivalItem) {
    const fullName = editingName.trim().replace(/\s+/g, " ");
    if (fullName.length < 2 || entry.id.startsWith("temp-")) return;
    const previousName = entry.fullName;
    setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, fullName } : item));
    setEditingId(undefined);
    setMessage("Nome alterado. Salvando…");
    enqueue(props.renameAction, { playerId: entry.playerId, fullName }, () => undefined, () => {
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, fullName: previousName } : item));
    });
  }

  function remove(entry: ArrivalItem) {
    if (entry.id.startsWith("temp-")) return;
    const previous = entries;
    setEntries((current) => renumber(current.filter((item) => item.id !== entry.id)));
    setMessage(`${entry.fullName} removido. Salvando…`);
    enqueue(props.removeAction, { playerId: entry.playerId }, () => undefined, () => setEntries(previous));
  }

  function openBulk() {
    setBulkText(localStorage.getItem(draftKey) ?? "");
    setBulkOpen(true);
  }

  return <>
    <div className="arrival-capacity"><span><b>{lineCount}</b>/{props.maxLinePlayers} linha</span><span><b>{keeperCount}</b>/{props.maxKeepers} goleiros</span></div>
    <section className="panel arrival-panel">
      <div className="quick-arrival">
        <div className="quick-arrival-form">
          <label className="sr-only" htmlFor="arrival-name">Nome do jogador</label>
          <input ref={inputRef} id="arrival-name" className="quick-arrival-name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOne(); } }} list="known-players" autoComplete="off" autoCapitalize="words" placeholder="Digite o nome" />
          <datalist id="known-players">{props.knownNames.map((knownName) => <option key={knownName} value={knownName} />)}</datalist>
          <select className="quick-arrival-role" value={role} onChange={(event) => setRole(event.target.value as typeof role)} aria-label="Posição"><option value="line">Linha</option><option value="keeper">Goleiro</option></select>
          <button className="quick-arrival-confirm" type="button" onClick={addOne} disabled={name.trim().length < 2} aria-label="Confirmar chegada">✓</button>
        </div>
        <div className="arrival-feedback"><span className={syncing ? "syncing" : "saved"}>{syncing ? `${syncing} salvando…` : "Tudo salvo"}</span><button className="bulk-open" type="button" onClick={openBulk}>Adicionar lista</button></div>
        <p className="quick-arrival-message" role="status">{message}</p>
      </div>

      <div className="arrival-list"><div className="panel-head"><h2 className="panel-title display">Ordem de chegada</h2><span className="badge badge-green">{entries.length}</span></div>{entries.length ? entries.map((entry, index) => <div className={`person-row arrival-manage-row ${entry.id.startsWith("temp-") ? "pending" : ""}`} key={entry.id}>
        <span className="arrival-index">{String(index + 1).padStart(2, "0")}</span>
        <span className="person-info">{editingId === entry.id ? <span className="arrival-edit"><input className="input" value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveName(entry); if (event.key === "Escape") setEditingId(undefined); }} autoFocus /><button type="button" onClick={() => saveName(entry)} aria-label="Salvar nome">✓</button></span> : <><strong>{entry.fullName}</strong><small>{entry.role === "keeper" ? "Goleiro" : "Linha"}</small></>}</span>
        <span className="arrival-row-actions"><button type="button" onClick={() => move(entry, -1)} disabled={index === 0 || entry.id.startsWith("temp-")} aria-label={`Mover ${entry.fullName} para cima`}>↑</button><button type="button" onClick={() => move(entry, 1)} disabled={index === entries.length - 1 || entry.id.startsWith("temp-")} aria-label={`Mover ${entry.fullName} para baixo`}>↓</button><button type="button" onClick={() => { setEditingId(entry.id); setEditingName(entry.fullName); }} disabled={entry.id.startsWith("temp-")} aria-label={`Editar ${entry.fullName}`}>✎</button><button className="remove" type="button" onClick={() => remove(entry)} disabled={entry.id.startsWith("temp-")} aria-label={`Remover ${entry.fullName}`}>×</button></span>
      </div>) : <div className="empty"><strong>Ninguém chegou ainda</strong><span>Digite um nome ou adicione uma lista.</span></div>}</div>

      <div className="arrival-start"><div><strong>{props.activeGameHref ? "Jogo em andamento" : canStart ? "Dois times prontos" : `Faltam ${Math.max(0, requiredLines - lineCount)} jogadores de linha`}</strong><small>{props.activeGameHref ? "O placar e o cronômetro estão prontos." : canStart ? "Os times serão formados pela ordem acima." : `São necessários ${requiredLines} para iniciar.`}</small></div>{props.activeGameHref ? <Link className="button button-primary" href={props.activeGameHref}>Ir para o jogo</Link> : <form action={props.startGameAction}><button className="button button-primary" disabled={!canStart || syncing > 0}>Iniciar jogo</button></form>}</div>
    </section>

    {bulkOpen && <div className="modal-backdrop" onMouseDown={() => setBulkOpen(false)}><section className="modal bulk-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-title" onMouseDown={(event) => event.stopPropagation()}><span className="eyebrow">Vários de uma vez</span><h2 className="display" id="bulk-title">Adicionar lista</h2><p className="muted">Use <strong>GK- Nome</strong> para goleiros e <strong>1- Nome</strong> para jogadores de linha.</p><textarea className="input bulk-textarea" value={bulkText} onChange={(event) => { setBulkText(event.target.value); localStorage.setItem(draftKey, event.target.value); }} placeholder={"GK- Fernando\nGK- Ryan\n1- Esdras\n2- Samuel"} autoFocus /><div className="bulk-preview"><strong>{parsedBulk.entries.length} reconhecidos</strong><span>{parsedBulk.entries.filter((entry) => entry.role === "keeper").length} goleiros · {parsedBulk.entries.filter((entry) => entry.role === "line").length} linha</span>{parsedBulk.ignoredLines.length > 0 && <small>Linhas ignoradas: {parsedBulk.ignoredLines.join(", ")}</small>}</div><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setBulkOpen(false)}>Cancelar</button><button className="button button-primary" type="button" onClick={importBulk} disabled={!parsedBulk.entries.length}>Adicionar todos</button></div></section></div>}
  </>;
}
