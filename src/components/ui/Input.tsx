import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...rest }, ref) => (
    <input
      ref={ref}
      className={`h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand ${className}`}
      {...rest}
    />
  )
);
Input.displayName = "Input";
