import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "bg-subtle text-text border border-border",
        blue: "bg-[light-dark(#dce7f4,#20303d)] text-[light-dark(#3f6c99,#a7c8e8)]",
        green: "bg-[light-dark(#dcefe1,#1c3227)] text-[light-dark(#2f7a54,#8ed3a6)]",
        orange: "bg-warning-bg text-warning-text border border-warning-border",
        red: "bg-[light-dark(#f6dedd,#3a2223)] text-[light-dark(#b3423b,#e8aaa6)]",
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
