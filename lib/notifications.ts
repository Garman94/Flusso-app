// ============================================================
// Notifiche sviluppatore (admin_notifications).
// ============================================================

export type NotificationType = "info" | "tip" | "warning" | "feedback_request";

export type AdminNotification = {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  target_plan: "all" | "free" | "premium" | "founder";
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  cta_text: string | null;
  cta_url: string | null;
};

export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  info: "ℹ️",
  tip: "💡",
  warning: "⚠️",
  feedback_request: "📣",
};
