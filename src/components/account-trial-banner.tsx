import { whatsappLink } from "@/lib/commercial";
import type { TrialAccess } from "@/server/account-trial";

export function AccountTrialBanner({ trial }: { trial?: TrialAccess }) {
  if (!trial || (!trial.ended && trial.daysLeft > 7)) return null;
  const days = trial.daysLeft === 1 ? "1 dia" : `${trial.daysLeft} dias`;
  const quota = trial.remaining === 1 ? "Resta 1 dia de futebol." : `Restam ${trial.remaining} dias de futebol.`;
  return <aside className="account-trial-banner" aria-label="Status do teste grátis">
    <div><strong>{trial.ended ? "Seu teste grátis acabou" : `Seu teste termina em ${days}`}</strong>
      <span>{trial.ended ? "Consulte seu histórico ou assine para continuar jogando." : trial.remaining ? quota : "Você pode concluir o futebol de hoje."}</span></div>
    {trial.ended && <a className="button button-primary button-small" href={whatsappLink("Olá! Fiz o teste do Rankaê e agora quero assinar o plano.")} target="_blank" rel="noreferrer">Assinar</a>}
  </aside>;
}
