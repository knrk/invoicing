import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, mono, style, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "w-full px-3 py-2.5 text-sm text-text bg-surface border border-border rounded-lg shadow-sm",
          "placeholder:text-muted outline-none transition-colors",
          "focus:border-primary focus:ring-2 focus:ring-primary/20",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        style={mono ? { fontFamily: "var(--font-mono)", ...style } : style}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
