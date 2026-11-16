# 09 — Metriche: cosa fanno davvero gli utenti

Flusso registra pochi eventi d'uso **first-party** nella tabella `events` (migration 035), senza servizi esterni.
Regola: **mai importi né descrizioni dei movimenti** nei `props`. La demo (`NEXT_PUBLIC_DEMO_EMAIL`) non viene tracciata.

Eventi: `app_open` (max 1 ogni 6 ore), `page_view` (max 1 ogni 30 min per pagina), `onboarding_completed`,
`checklist_click`, `import_opened`, `import_failed` (`reason`: `empty`, `columns_not_found`, `no_valid_rows`,
`read_error`, `insert_error`), `import_map_saved`, `import_completed`, `screenshot_import_completed`,
`smart_locked_viewed`, `upgrade_clicked`, `feedback_sent`, `bank_guide_opened` (`bank`: quale banca guardano nella guida dell'import), `fuel_vehicle_added`, `fuel_refuel_added` (`from_bank`: partito da un movimento della banca), `fuel_routine_added`, `account_created`, `account_checked` (`ok`: il saldo tornava con la banca), `transaction_edited` (`fields`: i nomi dei campi cambiati nel pannello di modifica del movimento, tra `category_id`, `amount`, `date`, `description`, `member_id`, `account_id`, `notes`; mai i valori).
I codici usati da chi prova Flusso si contano in `coupon_codes.uses` e `coupon_redemptions` (migration 046).

**Foto e PDF letti dall'AI** (`lib/read-failure.ts`): `screenshot_extracted` (`rows`, `kind` `pdf`/`image`, `size` a fasce, `secs`, `encrypted` per i PDF) e `screenshot_failed` (stessi campi più `reason`). Dal 16/11 `reason` dice il motivo vero:
- dal browser: `wrong_type`, `too_big`, `decode` (`heic`: foto dell'iPhone), `bad_response` (funzione scaduta o richiesta troppo grande: guarda `secs`), `network`, `server_crash`, `unknown`, `save`;
- dal server: `not_premium`, `not_active` (chiave mancante), `too_big`, `daily_limit`, `api_auth`, `api_credit` (credito Anthropic finito), `api_rate`, `api_overloaded`, `api_bad_request` (es. PDF protetto: guarda `encrypted`), `api_timeout`, `api_network`, `api_other`, `empty_reply`, `not_json`, `truncated`, `rows_unreadable`, `no_rows`.

Prima del 16/11 tutti gli errori del server erano `reason = server` ed `exception` voleva dire un errore qualsiasi nel browser: quei numeri non dicono il perché. `screenshot_extract` (senza "ed") lo scrive il server prima di ogni chiamata all'AI: serve al limite di 20 al giorno e conta anche i tentativi falliti.

Dal 17/10: `import_completed` e `screenshot_import_completed` prima si perdevano spesso (la pagina si ricaricava prima che partisse l'evento): i conteggi precedenti sono più bassi del vero; per gli import vecchi conta le righe di `transactions` con `source` = `excel`/`import` per giorno. `onboarding_completed` prima era sempre 0 perché nessuno arrivava a `/onboarding`.

`auth.users.last_sign_in_at` **non** dice chi torna: non si aggiorna finché la sessione resta valida. Usa `app_open`.

Le query vanno lanciate da Supabase → SQL Editor (nessuna policy di lettura per gli utenti).

## Imbuto: iscrizione → primo import → ritorno

```sql
with u as (select id, created_at from auth.users where email <> 'demo@flussoapp.it')
select
  count(*)                                                                             as iscritti,
  count(*) filter (where exists (select 1 from events e where e.user_id = u.id and e.name = 'onboarding_completed')) as onboarding,
  count(*) filter (where exists (select 1 from transactions t where t.user_id = u.id)) as con_transazioni,
  count(*) filter (where exists (select 1 from events e where e.user_id = u.id and e.name = 'import_completed'))      as import_riusciti,
  count(*) filter (where exists (select 1 from events e where e.user_id = u.id and e.name = 'app_open'
                                   and e.created_at > u.created_at + interval '6 days'))                            as tornati_dopo_7_giorni
from u;
```

## Perché falliscono gli import

```sql
select props->>'reason' as motivo, count(*) as volte, count(distinct user_id) as utenti
from events where name = 'import_failed'
group by 1 order by 2 desc;
```

## Perché falliscono le letture di foto e PDF

```sql
-- ogni tentativo, il più recente in alto (utente ridotto a 8 caratteri)
select created_at::timestamp(0) as quando, substr(user_id::text, 1, 8) as utente, name,
       props->>'reason' as motivo, props->>'kind' as tipo, props->>'size' as dimensione,
       props->>'secs' as secondi, props->>'encrypted' as protetto, props->>'rows' as righe
from events
where name in ('screenshot_failed', 'screenshot_extracted', 'screenshot_extract', 'screenshot_import_completed')
  and user_id not in (select id from auth.users where email = 'demo@flussoapp.it')
order by created_at desc
limit 200;

-- riassunto per motivo
select props->>'kind' as tipo, coalesce(props->>'reason', 'riuscita') as motivo,
       count(*) as volte, count(distinct user_id) as utenti
from events where name in ('screenshot_failed', 'screenshot_extracted')
group by 1, 2 order by 3 desc;
```

## Attività per utente (senza email)

```sql
select
  substr(p.id::text, 1, 8) as utente, p.plan, p.trial_ends_at::date as prova_fino_al,
  u.created_at::date as iscritto,
  (select max(e.created_at)::date from events e where e.user_id = p.id and e.name = 'app_open') as ultimo_uso,
  (select count(*) from transactions t where t.user_id = p.id) as transazioni,
  (select count(*) from events e where e.user_id = p.id and e.name = 'import_completed') as import_ok
from profiles p join auth.users u on u.id = p.id
order by ultimo_uso desc nulls last;
```
