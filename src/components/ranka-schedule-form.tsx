"use client";

import { useState } from "react";
import { weekdays, type RankaSchedule } from "@/domain/ranka/schedule";

export function RankaScheduleForm({ schedule, action, requestId }: { schedule: RankaSchedule; action: (form: FormData) => Promise<void>; requestId: string }) {
  const [mode, setMode] = useState(schedule.mode);
  return <section className="panel">
    <h2 className="panel-title display">Quando acontece o ranka?</h2>
    <form className="stack compact-form" action={action}>
      <input type="hidden" name="idempotencyKey" value={requestId} />
      <label className="field">Frequência<select className="select" name="mode" value={mode} onChange={(event) => setMode(event.target.value as RankaSchedule["mode"])}>
        <option value="unset">Sem agenda</option><option value="date">Data específica</option><option value="weekly">Toda semana</option><option value="alternating">Alternar duas semanas</option>
      </select></label>
      {(mode === "date" || mode === "alternating") && <label className="field">{mode === "alternating" ? "Data do encontro da primeira semana" : "Data do encontro"}<input className="input" type="date" name="date" required defaultValue={"date" in schedule ? schedule.date : undefined} /></label>}
      {mode === "weekly" && <fieldset className="rule-options"><legend>Dias da semana</legend>{weekdays.map((day, index) => <label className="check-row" key={day}><input type="checkbox" name="weekdays" value={index} defaultChecked={schedule.mode === "weekly" && schedule.weekdays.includes(index)} />{day}</label>)}</fieldset>}
      {mode === "alternating" && <label className="field">Dia da segunda semana<select className="select" name="alternateDay" defaultValue={schedule.mode === "alternating" ? schedule.alternateDay : 2}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>}
      <button className="button button-primary">Salvar agenda</button>
    </form>
  </section>;
}
