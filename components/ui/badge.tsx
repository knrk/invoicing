import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "bg-subtle text-text border border-border",
        blue: "bg-blue-50 text-blue-700",
        green: "bg-green-50 text-green-700",
        orange: "bg-orange-50 text-orange-700",
        red: "bg-red-50 text-red-700",
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

export { Badge, badgeVariants }
