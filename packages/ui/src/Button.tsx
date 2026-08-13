import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-bright focus-visible:outline-accent disabled:bg-accent/40",
  secondary:
    "bg-raised text-ink hover:bg-line focus-visible:outline-line disabled:bg-raised/40",
  danger: "bg-accent-deep text-white hover:bg-accent focus-visible:outline-accent-deep disabled:bg-accent-deep/40",
  ghost: "bg-transparent text-ink hover:bg-raised disabled:text-faint",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  full = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
    "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70",
    variantClasses[variant],
    sizeClasses[size],
    full ? "w-full" : "",
    className,
  ].join(" ");

  return <button type={type} className={classes} {...props} />;
}
