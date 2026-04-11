import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Registrazione completata!
              </CardTitle>
              <CardDescription>Controlla la tua email per confermare</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Ti abbiamo inviato un&apos;email di conferma. Clicca sul link nell&apos;email per attivare il tuo account.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
