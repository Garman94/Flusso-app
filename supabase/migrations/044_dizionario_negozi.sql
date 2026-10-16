-- Migration 044: dizionario condiviso dei negozi per la categorizzazione automatica.
-- Una parola (normalizzata come lib/categorize.ts → normalizeText: minuscolo, senza accenti e
-- punteggiatura) → il nome di una categoria predefinita. Vale per tutti gli utenti, dopo le loro
-- regole personali e prima delle parole chiave scritte nel codice (KEYWORDS). Si gestisce da
-- Admin → "Dizionario condiviso", anche approvando le parole che più utenti hanno già insegnato
-- a Flusso con "Ricorda". Contiene solo nomi di negozi e marchi, nessun dato degli utenti.
-- Lettura per gli utenti collegati; scrittura solo dal server (azioni admin con service role).
-- Rollback: supabase/rollback/044_dizionario_negozi_down.sql

create table if not exists public.merchant_dictionary (
  id            uuid primary key default gen_random_uuid(),
  keyword       text not null unique
                check (keyword = lower(keyword) and char_length(keyword) between 2 and 60),
  category_name text not null,
  source        text not null default 'admin' check (source in ('base', 'utenti', 'admin')),
  created_at    timestamptz not null default now()
);

alter table public.merchant_dictionary enable row level security;

drop policy if exists "Signed-in users can read the merchant dictionary" on public.merchant_dictionary;
create policy "Signed-in users can read the merchant dictionary"
  on public.merchant_dictionary
  for select
  to authenticated
  using (true);

-- Partenza: marchi italiani che le parole chiave del codice non conoscono ancora.
insert into public.merchant_dictionary (keyword, category_name, source) values
  -- Alimentari
  ('eurospar', 'Alimentari', 'base'), ('interspar', 'Alimentari', 'base'), ('spar', 'Alimentari', 'base'),
  ('carrefour express', 'Alimentari', 'base'), ('ipercoop', 'Alimentari', 'base'), ('coop alleanza', 'Alimentari', 'base'),
  ('unes', 'Alimentari', 'base'), ('u2 supermercato', 'Alimentari', 'base'), ('basko', 'Alimentari', 'base'),
  ('deco', 'Alimentari', 'base'), ('sisa', 'Alimentari', 'base'), ('prix', 'Alimentari', 'base'),
  ('tuodi', 'Alimentari', 'base'), ('in s mercato', 'Alimentari', 'base'), ('ins mercato', 'Alimentari', 'base'),
  ('ard discount', 'Alimentari', 'base'), ('dpiu', 'Alimentari', 'base'), ('iper la grande i', 'Alimentari', 'base'),
  ('rossetto', 'Alimentari', 'base'), ('pescheria', 'Alimentari', 'base'), ('fruttivendolo', 'Alimentari', 'base'),
  ('forno', 'Alimentari', 'base'), ('salumeria', 'Alimentari', 'base'), ('enoteca', 'Alimentari', 'base'),
  ('cortilia', 'Alimentari', 'base'), ('everli', 'Alimentari', 'base'), ('esselunga a casa', 'Alimentari', 'base'),
  ('iperal', 'Alimentari', 'base'), ('md', 'Alimentari', 'base'), ('tosano', 'Alimentari', 'base'),
  ('maxisconto', 'Alimentari', 'base'), ('cadoro', 'Alimentari', 'base'), ('ali supermercati', 'Alimentari', 'base'),
  ('panorama', 'Alimentari', 'base'), ('emisfero', 'Alimentari', 'base'), ('sole 365', 'Alimentari', 'base'),
  ('supermercati', 'Alimentari', 'base'),
  -- Ristoranti
  ('rossopomodoro', 'Ristoranti', 'base'), ('la piadineria', 'Ristoranti', 'base'), ('piadineria', 'Ristoranti', 'base'),
  ('temakinho', 'Ristoranti', 'base'), ('wagamama', 'Ristoranti', 'base'), ('poke house', 'Ristoranti', 'base'),
  ('pokeria', 'Ristoranti', 'base'), ('cioccolatitaliani', 'Ristoranti', 'base'), ('grom', 'Ristoranti', 'base'),
  ('venchi', 'Ristoranti', 'base'), ('caffetteria', 'Ristoranti', 'base'), ('vineria', 'Ristoranti', 'base'),
  ('rosticceria', 'Ristoranti', 'base'), ('friggitoria', 'Ristoranti', 'base'), ('hamburgeria', 'Ristoranti', 'base'),
  ('thefork', 'Ristoranti', 'base'), ('the fork', 'Ristoranti', 'base'), ('domino s', 'Ristoranti', 'base'),
  ('five guys', 'Ristoranti', 'base'), ('alice pizza', 'Ristoranti', 'base'), ('cigierre', 'Ristoranti', 'base'),
  ('mensa', 'Ristoranti', 'base'), ('self service', 'Ristoranti', 'base'), ('ristorazione', 'Ristoranti', 'base'),
  -- Trasporti
  ('agip', 'Trasporti', 'base'), ('erg', 'Trasporti', 'base'), ('totalerg', 'Trasporti', 'base'),
  ('beyfin', 'Trasporti', 'base'), ('costantin', 'Trasporti', 'base'), ('unipolmove', 'Trasporti', 'base'),
  ('unipol move', 'Trasporti', 'base'), ('mooney go', 'Trasporti', 'base'), ('bip go', 'Trasporti', 'base'),
  ('share now', 'Trasporti', 'base'), ('zity', 'Trasporti', 'base'), ('cooltra', 'Trasporti', 'base'),
  ('atac', 'Trasporti', 'base'), ('cotral', 'Trasporti', 'base'), ('amat', 'Trasporti', 'base'),
  ('anm', 'Trasporti', 'base'), ('tper', 'Trasporti', 'base'), ('busitalia', 'Trasporti', 'base'),
  ('frecciarossa', 'Trasporti', 'base'), ('autostrade per l italia', 'Trasporti', 'base'), ('pedaggio', 'Trasporti', 'base'),
  ('saba', 'Trasporti', 'base'), ('apcoa', 'Trasporti', 'base'), ('mycicero', 'Trasporti', 'base'),
  ('tagliando', 'Trasporti', 'base'), ('carrozzeria', 'Trasporti', 'base'), ('autolavaggio', 'Trasporti', 'base'),
  -- Viaggi
  ('trivago', 'Viaggi', 'base'), ('edreams', 'Viaggi', 'base'), ('lastminute', 'Viaggi', 'base'),
  ('volagratis', 'Viaggi', 'base'), ('tui', 'Viaggi', 'base'), ('costa crociere', 'Viaggi', 'base'),
  ('msc crociere', 'Viaggi', 'base'), ('grandi navi veloci', 'Viaggi', 'base'), ('gnv', 'Viaggi', 'base'),
  ('moby', 'Viaggi', 'base'), ('tirrenia', 'Viaggi', 'base'), ('corsica ferries', 'Viaggi', 'base'),
  ('blablacar', 'Viaggi', 'base'), ('klm', 'Viaggi', 'base'), ('air france', 'Viaggi', 'base'),
  ('british airways', 'Viaggi', 'base'), ('emirates', 'Viaggi', 'base'), ('turkish airlines', 'Viaggi', 'base'),
  ('agoda', 'Viaggi', 'base'), ('hotels com', 'Viaggi', 'base'), ('vrbo', 'Viaggi', 'base'),
  ('b b', 'Viaggi', 'base'), ('agriturismo', 'Viaggi', 'base'), ('campeggio', 'Viaggi', 'base'),
  -- Salute
  ('lloyds farmacia', 'Salute', 'base'), ('dr max', 'Salute', 'base'), ('farmacie comunali', 'Salute', 'base'),
  ('amplifon', 'Salute', 'base'), ('vision ottica', 'Salute', 'base'), ('grandvision', 'Salute', 'base'),
  ('synlab', 'Salute', 'base'), ('centro diagnostico', 'Salute', 'base'), ('santagostino', 'Salute', 'base'),
  ('dentalpro', 'Salute', 'base'), ('vitaldent', 'Salute', 'base'), ('humanitas', 'Salute', 'base'),
  ('auxologico', 'Salute', 'base'), ('erboristeria', 'Salute', 'base'), ('sanitaria', 'Salute', 'base'),
  -- Abbigliamento
  ('benetton', 'Abbigliamento', 'base'), ('sisley', 'Abbigliamento', 'base'), ('guess', 'Abbigliamento', 'base'),
  ('levi s', 'Abbigliamento', 'base'), ('timberland', 'Abbigliamento', 'base'),
  ('vans', 'Abbigliamento', 'base'), ('converse', 'Abbigliamento', 'base'), ('skechers', 'Abbigliamento', 'base'),
  ('pittarello', 'Abbigliamento', 'base'), ('bata', 'Abbigliamento', 'base'), ('scarpe scarpe', 'Abbigliamento', 'base'),
  ('deichmann', 'Abbigliamento', 'base'), ('upim', 'Abbigliamento', 'base'), ('coin', 'Abbigliamento', 'base'),
  ('kiabi', 'Abbigliamento', 'base'), ('promod', 'Abbigliamento', 'base'),
  ('oysho', 'Abbigliamento', 'base'), ('massimo dutti', 'Abbigliamento', 'base'), ('liu jo', 'Abbigliamento', 'base'),
  ('superdry', 'Abbigliamento', 'base'), ('the north face', 'Abbigliamento', 'base'), ('lacoste', 'Abbigliamento', 'base'),
  ('pittarosso', 'Abbigliamento', 'base'), ('alcott', 'Abbigliamento', 'base'), ('carpisa', 'Abbigliamento', 'base'),
  -- Shopping
  ('amazon', 'Shopping', 'base'), ('amazon marketplace', 'Shopping', 'base'), ('amzn', 'Shopping', 'base'),
  ('ebay', 'Shopping', 'base'), ('aliexpress', 'Shopping', 'base'), ('temu', 'Shopping', 'base'),
  ('vinted', 'Shopping', 'base'), ('wallapop', 'Shopping', 'base'), ('etsy', 'Shopping', 'base'),
  ('kiko', 'Shopping', 'base'),
  ('sephora', 'Shopping', 'base'), ('douglas', 'Shopping', 'base'), ('pinalli', 'Shopping', 'base'),
  ('profumeria', 'Shopping', 'base'), ('tabaccheria', 'Shopping', 'base'), ('tabacchi', 'Shopping', 'base'),
  ('edicola', 'Shopping', 'base'), ('fioraio', 'Shopping', 'base'), ('gioielleria', 'Shopping', 'base'),
  -- Intrattenimento
  ('apple tv', 'Intrattenimento', 'base'), ('paramount', 'Intrattenimento', 'base'), ('infinity', 'Intrattenimento', 'base'),
  ('timvision', 'Intrattenimento', 'base'), ('mediaset', 'Intrattenimento', 'base'), ('crunchyroll', 'Intrattenimento', 'base'),
  ('deezer', 'Intrattenimento', 'base'), ('tidal', 'Intrattenimento', 'base'), ('ticketmaster', 'Intrattenimento', 'base'),
  ('dice fm', 'Intrattenimento', 'base'), ('gardaland', 'Intrattenimento', 'base'), ('mirabilandia', 'Intrattenimento', 'base'),
  ('acquario', 'Intrattenimento', 'base'), ('bowling', 'Intrattenimento', 'base'), ('luna park', 'Intrattenimento', 'base'),
  -- Hobby
  ('lego', 'Hobby', 'base'), ('epic games', 'Hobby', 'base'), ('riot games', 'Hobby', 'base'),
  ('battle net', 'Hobby', 'base'), ('blizzard', 'Hobby', 'base'), ('ubisoft', 'Hobby', 'base'),
  ('humble bundle', 'Hobby', 'base'), ('gog com', 'Hobby', 'base'), ('funko', 'Hobby', 'base'),
  ('nintendo eshop', 'Hobby', 'base'), ('playstation network', 'Hobby', 'base'), ('feltrinelli', 'Hobby', 'base'),
  -- Tecnologia
  ('back market', 'Tecnologia', 'base'), ('comet', 'Tecnologia', 'base'), ('expert', 'Tecnologia', 'base'),
  ('google one', 'Tecnologia', 'base'), ('github', 'Tecnologia', 'base'),
  ('canva', 'Tecnologia', 'base'), ('nordvpn', 'Tecnologia', 'base'), ('expressvpn', 'Tecnologia', 'base'),
  ('surfshark', 'Tecnologia', 'base'), ('1password', 'Tecnologia', 'base'), ('microsoft 365', 'Tecnologia', 'base'),
  ('office 365', 'Tecnologia', 'base'), ('anthropic', 'Tecnologia', 'base'), ('claude ai', 'Tecnologia', 'base'),
  -- Casa
  ('brico io', 'Casa', 'base'), ('bricocenter', 'Casa', 'base'), ('self italia', 'Casa', 'base'),
  ('jysk', 'Casa', 'base'), ('chateau d ax', 'Casa', 'base'), ('poltronesofa', 'Casa', 'base'),
  ('scavolini', 'Casa', 'base'), ('dyson', 'Casa', 'base'), ('folletto', 'Casa', 'base'),
  ('vorwerk', 'Casa', 'base'), ('risparmio casa', 'Casa', 'base'), ('caddy s', 'Casa', 'base'),
  ('ferramenta', 'Casa', 'base'), ('arredamento', 'Casa', 'base'), ('pulizie', 'Casa', 'base'),
  -- Bollette
  ('nen', 'Bollette', 'base'), ('octopus', 'Bollette', 'base'), ('axpo', 'Bollette', 'base'),
  ('green network', 'Bollette', 'base'), ('nwg energia', 'Bollette', 'base'), ('enel energia', 'Bollette', 'base'),
  ('illumia', 'Bollette', 'base'), ('iberdrola', 'Bollette', 'base'), ('engie', 'Bollette', 'base'),
  ('e on energia', 'Bollette', 'base'), ('enegan', 'Bollette', 'base'), ('octopus energy', 'Bollette', 'base'),
  ('pulsee', 'Bollette', 'base'), ('wekiwi', 'Bollette', 'base'), ('dolomiti energia', 'Bollette', 'base'),
  ('estra', 'Bollette', 'base'), ('agsm', 'Bollette', 'base'), ('aim energy', 'Bollette', 'base'),
  ('acea energia', 'Bollette', 'base'), ('hera comm', 'Bollette', 'base'), ('iren mercato', 'Bollette', 'base'),
  ('a2a energia', 'Bollette', 'base'), ('servizio elettrico nazionale', 'Bollette', 'base'), ('linkem', 'Bollette', 'base'),
  ('eolo', 'Bollette', 'base'), ('tiscali', 'Bollette', 'base'), ('sky wifi', 'Bollette', 'base'),
  ('spusu', 'Bollette', 'base'), ('coopvoce', 'Bollette', 'base'), ('lycamobile', 'Bollette', 'base'),
  ('acquedotto', 'Bollette', 'base'), ('smat', 'Bollette', 'base'), ('mm spa', 'Bollette', 'base'),
  ('abbanoa', 'Bollette', 'base'), ('publiacqua', 'Bollette', 'base'), ('acquedotto pugliese', 'Bollette', 'base'),
  -- Assicurazioni
  ('prima assicurazioni', 'Assicurazioni', 'base'), ('prima it', 'Assicurazioni', 'base'), ('conte it', 'Assicurazioni', 'base'),
  ('quixa', 'Assicurazioni', 'base'), ('zurich connect', 'Assicurazioni', 'base'), ('helvetia', 'Assicurazioni', 'base'),
  ('cattolica assicurazioni', 'Assicurazioni', 'base'), ('sara assicurazioni', 'Assicurazioni', 'base'), ('vittoria assicurazioni', 'Assicurazioni', 'base'),
  ('groupama', 'Assicurazioni', 'base'), ('itas', 'Assicurazioni', 'base'), ('poste assicura', 'Assicurazioni', 'base'),
  ('postevita', 'Assicurazioni', 'base'), ('unisalute', 'Assicurazioni', 'base'), ('facile it', 'Assicurazioni', 'base'),
  -- Palestra
  ('fitactive', 'Palestra', 'base'), ('fit active', 'Palestra', 'base'), ('getfit', 'Palestra', 'base'),
  ('jetfit', 'Palestra', 'base'), ('planet fitness', 'Palestra', 'base'), ('palestre', 'Palestra', 'base'),
  ('centro sportivo', 'Palestra', 'base'), ('playtomic', 'Palestra', 'base'), ('arti marziali', 'Palestra', 'base'),
  -- Istruzione
  ('duolingo', 'Istruzione', 'base'), ('babbel', 'Istruzione', 'base'), ('masterclass', 'Istruzione', 'base'),
  ('linkedin learning', 'Istruzione', 'base'), ('skillshare', 'Istruzione', 'base'), ('zanichelli', 'Istruzione', 'base'),
  ('giunti al punto', 'Istruzione', 'base'), ('ibs it', 'Istruzione', 'base'), ('libraccio', 'Istruzione', 'base'),
  ('cartoleria', 'Istruzione', 'base'), ('doposcuola', 'Istruzione', 'base'), ('ripetizioni', 'Istruzione', 'base')
on conflict (keyword) do nothing;

-- Nomi comuni di tipi di negozio, quando non c'è il marchio ("FARMACIA SAN MARCO"). Solo parole
-- che indicano un tipo di negozio e non compaiono dentro altre parole o nei testi delle banche:
-- niente "market", "discount", "sport", "distributore" (pompa di benzina o macchinetta del caffè?).
insert into public.merchant_dictionary (keyword, category_name, source) values
  ('panetteria', 'Alimentari', 'base'), ('gastronomia', 'Alimentari', 'base'), ('frutteria', 'Alimentari', 'base'),
  ('latteria', 'Alimentari', 'base'), ('ipermercato', 'Alimentari', 'base'), ('minimarket', 'Alimentari', 'base'),
  ('caseificio', 'Alimentari', 'base'), ('drogheria', 'Alimentari', 'base'), ('macellaio', 'Alimentari', 'base'),
  ('birrificio', 'Ristoranti', 'base'), ('braceria', 'Ristoranti', 'base'), ('steakhouse', 'Ristoranti', 'base'),
  ('ramen', 'Ristoranti', 'base'), ('bistrot', 'Ristoranti', 'base'), ('taverna', 'Ristoranti', 'base'),
  ('locanda', 'Ristoranti', 'base'), ('sushi', 'Ristoranti', 'base'),
  ('meccanico', 'Trasporti', 'base'), ('elettrauto', 'Trasporti', 'base'), ('autoricambi', 'Trasporti', 'base'),
  ('stazione di servizio', 'Trasporti', 'base'), ('lavaggio auto', 'Trasporti', 'base'), ('autofficina', 'Trasporti', 'base'),
  ('ortopedia', 'Salute', 'base'), ('oculista', 'Salute', 'base'), ('psicolog', 'Salute', 'base'),
  ('logopedista', 'Salute', 'base'), ('osteopata', 'Salute', 'base'), ('analisi cliniche', 'Salute', 'base'),
  ('radiologia', 'Salute', 'base'), ('ecografia', 'Salute', 'base'), ('dermatolog', 'Salute', 'base'),
  ('parrucchiere', 'Salute', 'base'), ('barbiere', 'Salute', 'base'), ('estetista', 'Salute', 'base'),
  ('centro estetico', 'Salute', 'base'), ('sartoria', 'Abbigliamento', 'base'), ('calzoleria', 'Abbigliamento', 'base'),
  ('lavanderia', 'Abbigliamento', 'base'), ('tintoria', 'Abbigliamento', 'base'), ('calzature', 'Abbigliamento', 'base'),
  ('casalinghi', 'Casa', 'base'), ('mobilificio', 'Casa', 'base'), ('elettrodomestici', 'Casa', 'base'),
  ('vivaio', 'Casa', 'base'), ('giardinaggio', 'Casa', 'base'), ('tappezzeria', 'Casa', 'base'),
  ('traslochi', 'Casa', 'base'), ('termoidraulica', 'Casa', 'base'), ('serramenti', 'Casa', 'base'),
  ('giocattoli', 'Hobby', 'base'), ('fumetteria', 'Hobby', 'base'), ('strumenti musicali', 'Hobby', 'base'),
  ('merceria', 'Shopping', 'base'), ('bigiotteria', 'Shopping', 'base'), ('outlet', 'Shopping', 'base'),
  ('centro commerciale', 'Shopping', 'base'), ('cartolibreria', 'Istruzione', 'base'), ('autoscuola', 'Istruzione', 'base'),
  ('scuola guida', 'Istruzione', 'base'), ('parco divertimenti', 'Intrattenimento', 'base'), ('escape room', 'Intrattenimento', 'base'),
  ('karaoke', 'Intrattenimento', 'base'), ('ostello', 'Viaggi', 'base'), ('affittacamere', 'Viaggi', 'base')
on conflict (keyword) do nothing;
