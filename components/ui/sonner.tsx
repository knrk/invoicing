"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-surface group-[.toaster]:text-text group-[.toaster]:border-border group-[.toaster]:shadow-card",
          description: "group-[.toast]:text-text-secondary",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-subtle group-[.toast]:text-text-secondary",
          error: "group-[.toaster]:bg-surface group-[.toaster]:text-danger group-[.toaster]:border-danger/30",
          success: "group-[.toaster]:text-text",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
