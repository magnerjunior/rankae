export default function Loading() {
  return (
    <main className="page workspace-loading" aria-busy="true">
      <p className="workspace-loading-label" role="status">Carregando a próxima tela…</p>
      <div className="workspace-loading-panel" aria-hidden="true"><span /><span /><span /></div>
    </main>
  );
}
