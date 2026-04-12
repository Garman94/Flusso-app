# Add-on: Modulo di Contatto

Form di contatto con invio email via Resend. Manda una notifica all'admin e una conferma all'utente.

---

## File inclusi

```
addons/contact/files/
  components/contact-form.tsx          → components/contact-form.tsx
  app/api/contact/route.ts             → app/api/contact/route.ts
```

Nessuna migration SQL necessaria.

---

## Passaggi

### 1. Copia i file

```
components/contact-form.tsx  →  components/contact-form.tsx
app/api/contact/route.ts     →  app/api/contact/route.ts
```

### 2. Crea la pagina di contatto

```bash
mkdir -p app/contact
```

Crea `app/contact/page.tsx`:

```tsx
import { ContactForm } from "@/components/contact-form";

export const metadata = {
  title: "Contattaci",
  description: "Inviaci un messaggio, ti risponderemo presto.",
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Contattaci</h1>
        <p className="text-muted-foreground mt-2">
          Hai domande? Scrivici e ti risponderemo entro 24 ore.
        </p>
      </div>
      <ContactForm />
    </div>
  );
}
```

### 3. (Opzionale) Aggiungi il link in navbar

In `lib/config.ts`, aggiungi alla navigazione:

```ts
{ label: "Contatti", href: "/contact" }
```

### 4. Variabili d'ambiente

Usa quelle già presenti:
- `RESEND_API_KEY` ✅
- `RESEND_FROM_EMAIL` ✅
- `ADMIN_EMAILS` ✅ (il messaggio arriva alla prima email in lista)

---

## Come funziona

1. Utente compila nome, email, messaggio → submit
2. API valida i campi (max 2000 caratteri)
3. Resend invia notifica all'admin (`ADMIN_EMAILS`)
4. Resend invia conferma all'utente
5. Form mostra stato "Messaggio inviato!"

---

## Personalizzazione

| Cosa | Dove |
|---|---|
| Destinatario admin | `ADMIN_EMAILS` in `.env.local` |
| Template email admin | `app/api/contact/route.ts` → primo `resend.emails.send` |
| Template email conferma | `app/api/contact/route.ts` → secondo `resend.emails.send` |
| Limite caratteri | `maxLength` nel textarea + validazione nell'API |
| Campi aggiuntivi | Aggiungi input nel form + validazione nell'API |
