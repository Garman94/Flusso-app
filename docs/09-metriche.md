# 09 — Metriche: cosa fanno davvero gli utenti

Flusso registra pochi eventi d'uso **first-party** nella tabella `events` (migration 035), senza servizi esterni.
Regola: **mai importi né descrizioni dei movimenti** nei `props`. La demo (`NEXT_PUBLIC_DEMO_EMAIL`) non viene tracciata.

Eventi: `app_open` (max 1 ogni 6 ore), `page_view` (max 1 ogni 30 min per pagina), `onboarding_completed`,
`checklist_click`, `import_opened`, `import_failed` (`reason`: `empty`, `columns_not_found`, `no_valid_rows`,
`read_error`, `insert_error`), `import_map_saved`, `import_completed`, `screenshot_import_completed`,
`smart_locked_viewed`, `upgrade_clicked`, `feedback_sent`.

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
