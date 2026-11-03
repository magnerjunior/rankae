# Carga da Fase 4

Scripts k6 preparados para staging com seed fictícia. Eles recusam `TARGET_ENV` diferente de `staging`; o perfil de 1000 VUs exige `ACK_COSTS=approved`.

Perfis HTTP: `baseline`, `100` e `1000`. Realtime mede conexão e inscrição real no canal `portal:<slug>`. Escritas usam no máximo três tokens temporários de organizadores e registram somente marcadores `LOAD-STAGING` em uma partida descartável.

Exemplo seguro, após criar staging e aprovar quota:

```powershell
$env:TARGET_ENV='staging'
$env:TARGET_BASE_URL='https://staging.example.test'
$env:PUBLIC_RANKA_SLUG='carga-ficticia'
$env:LOAD_PROFILE='100'
k6 run tests/load/portal-http.k6.js
```

Não versionar tokens, chaves ou resultados com identificadores. Guarde os JSON em `artifacts/`, que permanece fora do Git. O teste de 1000 VUs não foi executado no projeto de produção.
