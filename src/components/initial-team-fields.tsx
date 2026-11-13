"use client";
import { useState } from "react";
export function InitialTeamFields({ players, size }: { players: { id: string; fullName: string }[]; size: number }) {
 const [method, setMethod] = useState("shuffle_blocks");
 const [count, setCount] = useState(size);
 const [selected, setSelected] = useState<Record<number, string>>({});
 return <div className="stack">
 <label className="field">Jogadores por time<select className="select" name="squadSize" value={count} onChange={e => { setCount(Number(e.target.value)); setSelected({}); }}>{[5,6,7].map(n => <option key={n}>{n}</option>)}</select></label>
 <label className="field">Como dividir<select className="select" name="method" value={method} onChange={e => setMethod(e.target.value)}><option value="shuffle_blocks">Sortear T1/T2 · demais por chegada</option><option value="manual">Escolher os jogadores de T1 e T2</option><option value="sequential">Por ordem de chegada</option></select></label>
 <label className="field">Coletes iniciais<select className="select" name="yellowNumber"><option value="1">T1 amarelo · T2 vermelho</option><option value="2">T1 vermelho · T2 amarelo</option></select></label>
 {method === "manual" && <><p>Escolha os jogadores presentes de cada time. Os demais continuam pela ordem de chegada.</p><div className="squad-grid">{[1,2].map(team => <fieldset key={team} className="stack"><legend>Time {team}</legend>{Array.from({length: count}, (_, slot) => { const index=(team-1)*count+slot; return <label className="field" key={slot}>Jogador {slot+1}<select className="select" name="manualPlayers" required value={selected[index] || ""} onChange={e => setSelected({...selected, [index]: e.target.value})}><option value="">Selecione</option>{players.map(p => <option key={p.id} value={p.id} disabled={Object.entries(selected).some(([i,id]) => Number(i)!==index && id===p.id)}>{p.fullName}</option>)}</select></label>;})}</fieldset>)}</div></>}
 </div>;
}
