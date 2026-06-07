import { cn } from "@/shared/lib/cn";

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className={cn("grid shrink-0 place-items-center", compact ? "h-12 w-12" : "h-16 w-full")}>
        <img
          className={cn("object-contain", compact ? "h-11 w-11" : "h-14 w-full")}
          src={compact ? "/brand/logo.png" : "/brand/logo-horizontal.png"}
          alt="Zestora"
        />
      </span>
    </div>
  );
}
