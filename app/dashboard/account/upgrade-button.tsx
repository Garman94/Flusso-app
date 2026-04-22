"use client";

// Builds the Lemon Squeezy checkout URL with the user's Supabase ID in custom_data,
// which is required for the webhook to identify which profile to upgrade.
export function UpgradeButton({ userId, checkoutUrl }: { userId: string; checkoutUrl: string }) {
  function handleClick() {
    const url = new URL(checkoutUrl);
    url.searchParams.set("checkout[custom][user_id]", userId);
    window.location.href = url.toString();
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 w-fit transition-colors"
    >
      Passa a Premium
    </button>
  );
}
