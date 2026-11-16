export default function Loading() {
  return (
    <main className="page workspace-loading" aria-busy="true">
      <span className="workspace-loading-mark" aria-hidden="true" />
      <p className="workspace-loading-label" role="status">Carregando a próxima tela…</p>
      <div className="workspace-loading-panel" aria-hidden="true"><span /><span /><span /></div>
    </main>
  );
}
