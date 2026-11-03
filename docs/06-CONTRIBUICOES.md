# Contribuições do ranka

## Escopo
Cada sessão possui contribuição configurável em centavos de BRL (exemplo R$ 5,00), `enabled`, `amount_cents`, `default_block_unpaid=false`.
- Registrar pago/pendente/dispensado por participante, com quem marcou, hora e observação opcional.
- Selecionar vários e marcar pago em lote; `Marcar todos como pagos` exige confirmação com quantidade e valor.
- Selecionar indivíduo, desfazer marcação, marcar isento; não tratar mera ausência de pagamento como ausência da pelada.
- Caso organizador ative `block_unpaid`, mostrar aviso e impedir apenas ações de formação conforme regra explícita, com override do proprietário/mesário e auditoria.
- Mostrar contagem pagos, pendentes e total esperado/recebido baseado em registros; pagamentos presenciais não são cobrança online.
- Mudança do preço depois de confirmações: definir política (`snapshot` individual na sessão); nunca reprecificar pagamentos históricos inadvertidamente.
- Dados financeiros visíveis apenas para organizadores autorizados, **não** no portal público.
- Não implementar Pix/checkout real nas fases 1–4.
