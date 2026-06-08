import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export type NoticeTone = "success" | "warning" | "error" | "info";

export interface Notice {
  tone: NoticeTone;
  message: string;
}

interface NoticeToastProps {
  notice: Notice;
  onClose: () => void;
  durationMs?: number;
}

const toneStyles: Record<NoticeTone, string> = {
  success: "border-brand-fresh/40 bg-white text-brand-forest",
  warning: "border-brand-orange/40 bg-white text-brand-espresso",
  error: "border-destructive/40 bg-white text-destructive",
  info: "border-brand-forest/20 bg-white text-brand-espresso",
};

const toneIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
  info: Info,
};

export function NoticeToast({ notice, onClose, durationMs = 3500 }: NoticeToastProps) {
  const Icon = toneIcons[notice.tone];

  useEffect(() => {
    const timeoutId = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs, notice, onClose]);

  return (
    <div
      className={cn(
        "fixed right-4 top-4 z-50 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold shadow-xl",
        "sm:max-w-md",
        toneStyles[notice.tone],
      )}
      role="status"
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0">{notice.message}</span>
      <button className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-brand-cream" onClick={onClose} aria-label="Close notification">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
