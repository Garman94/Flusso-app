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

**Email del lunedì** (migration 052): ogni invio è una riga di `email_sends` (`user_id`, `kind` = `weekly`, `period_key` = lunedì della settimana), mai il contenuto. I link dell'email hanno `?da=email-lunedi`: arrivando da lì si registra `email_clicked` (`kind`, `path`; al massimo uno all'ora per tipo). Accendere o spegnere l'email da Account registra `email_pref_changed` (`kind`, `on`); chi si disiscrive dal link dell'email si vede da `profiles.email_weekly = false`.

**Email del mese** (dal 7/12): stesse regole, con `kind` = `monthly`, `period_key` = inizio del periodo riepilogato, link con `?da=email-mese` e preferenza `profiles.email_monthly`. Il giro di ogni giorno (log di Vercel, «email del mese») conta anche chi era nei primi giorni del periodo nuovo ma non l'ha ricevuta, e perché (`notReady`: `few` meno di 3 movimenti, `incomplete` mancano gli ultimi giorni, `starts-late` cominciano a metà).

**Notifiche push** (migration 053): chi le accende ha una riga per dispositivo in `push_subscriptions` (`device` = solo il tipo, `last_ok_at` = ultimo invio riuscito); spegnendole o uscendo dall'account la riga sparisce; se il permesso lo toglie il browser, sparisce al primo invio che fallisce. Eventi: `push_enabled` (`device`), `push_disabled`, `push_permission` (`result`: `denied` o `default`, cioè chi ha detto di no alla richiesta del browser), `push_failed` (`device`), `push_test` (`ok`). La notifica del lunedì è una riga di `email_sends` con `kind` = `push_weekly`; il link ha `?da=push-lunedi` e arrivando da lì si registra `push_clicked` (`kind`, `path`). Il giro del lunedì (log di Vercel, «giro del lunedì») dà `push`: persone e dispositivi raggiunti, dispositivi tolti (`gone`), errori.

**Chi torna** (dal 16/11) si legge in Admin, senza SQL: la card conta chi ha aperto Flusso almeno 7 giorni dopo l'iscrizione (obiettivo 40%) e le persone attive negli ultimi 7 giorni e in ogni settimana. Toglie admin e demo, e chi aveva già passato la settimana dopo l'iscrizione prima della prima visita registrata (un suo ritorno di allora non risulterebbe). Calcoli in `lib/retention.ts`.

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
                                   and e.created_at >= u.created_at + interval '7 days'))                           as tornati_dopo_7_giorni
from u;
```

## Email del lunedì: mandate, cliccate, spente

```sql
-- per settimana: email mandate e persone che hanno cliccato un link entro 7 giorni
select s.period_key as settimana, count(*) as mandate,
       count(*) filter (where exists (
         select 1 from events e where e.user_id = s.user_id and e.name = 'email_clicked'
           and e.props->>'kind' = 'email-lunedi'
           and e.created_at >= s.sent_at and e.created_at < s.sent_at + interval '7 days')) as cliccate
from email_sends s where s.kind = 'weekly'
group by 1 order by 1 desc;

-- quanti l'hanno spenta
select count(*) filter (where not email_weekly) as spenta, count(*) as profili from profiles;
```

## Notifiche: accese, cliccate, rifiutate

```sql
-- persone e dispositivi con le notifiche accese, per tipo
select device, count(*) as dispositivi, count(distinct user_id) as persone
from push_subscriptions group by 1 order by 2 desc;

-- per settimana: notifiche mandate e persone che l'hanno toccata entro 2 giorni
select s.period_key as settimana, count(*) as mandate,
       count(*) filter (where exists (
         select 1 from events e where e.user_id = s.user_id and e.name = 'push_clicked'
           and e.created_at >= s.sent_at and e.created_at < s.sent_at + interval '2 days')) as toccate
from email_sends s where s.kind = 'push_weekly'
group by 1 order by 1 desc;

-- chi prova ad accenderle e come va
select name, props->>'device' as dispositivo, props->>'result' as risposta, count(*)
from events where name in ('push_enabled', 'push_permission', 'push_failed', 'push_disabled')
group by 1, 2, 3 order by 1, 4 desc;
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
