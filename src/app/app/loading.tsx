export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <div className="page-heading" role="status" aria-live="polite">
        <span className="eyebrow">Rankaê</span>
        <h1 className="display">Carregando…</h1>
        <p>Abrindo a próxima tela.</p>
      </div>
    </main>
  );
}
