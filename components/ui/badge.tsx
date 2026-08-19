import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "bg-subtle text-text border border-border",
        blue: "bg-[light-dark(#cfe4f5,#22323f)] text-text",
        green: "bg-[light-dark(#c9ebd3,#1e3a29)] text-text",
        orange: "bg-warning-bg text-warning-text border border-warning-border",
        red: "bg-[light-dark(#f3c9d6,#3a2230)] text-text",
        destructive: "bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge }
