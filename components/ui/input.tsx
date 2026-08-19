import * as React from "react"
import { cn } from "@/lib/utils"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, mono, style, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "w-full px-3 py-2.5 text-sm text-text bg-surface border border-border rounded-lg shadow-sm hover:shadow-[0px_3px_0px_0px_rgba(0,0,0,0.7)]",
          "placeholder:text-muted outline-none transition-[color,box-shadow]",
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
