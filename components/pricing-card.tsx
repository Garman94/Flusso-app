import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

type PricingPlan = {
  label: string;
  price: number;
  annualPrice?: number;
  description: string;
  features: readonly string[];
  cta: string;
  href: string;
  highlighted?: boolean;
};

function formatPrice(price: number): string {
  return price.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function PricingCard({ plan }: { plan: PricingPlan }) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-8 gap-6",
        plan.highlighted
          ? "border-primary shadow-lg shadow-primary/10 bg-primary/5"
          : "bg-card",
      )}
    >
      {plan.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
            Più popolare
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">{plan.label}</h3>
        <div className="flex items-baseline gap-1">
          {plan.price === 0 ? (
            <span className="text-4xl font-bold">Gratis</span>
          ) : (
            <>
              <span className="text-4xl font-bold">€{formatPrice(plan.price)}</span>
              <span className="text-muted-foreground text-sm">
                {plan.label === "Founder" ? "una tantum" : "/mese"}
              </span>
            </>
          )}
        </div>
        {plan.annualPrice && (
          <p className="text-xs text-primary font-medium">
            o €{plan.annualPrice}/anno — risparmia 35%
          </p>
        )}
        {plan.price > 0 && (
          <p className="text-xs text-muted-foreground">IVA inclusa</p>
        )}
        <p className="text-sm text-muted-foreground">{plan.description}</p>
      </div>

      {/* CTA */}
      <Button
        asChild
        variant={plan.highlighted ? "default" : "outline"}
        className="w-full"
      >
        <Link href={plan.href}>{plan.cta}</Link>
      </Button>

      {/* Features */}
      <ul className="flex flex-col gap-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm">
            <svg
              className="h-4 w-4 text-primary shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}
