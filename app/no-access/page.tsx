import { logout } from "@/lib/auth"
import { Button } from "@/components/ui/button"

export default function NoAccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md text-center bg-surface rounded-card shadow-card p-10">
        <h1 className="text-xl font-bold text-text" style={{ fontFamily: "var(--font-heading)" }}>
          Nemáte přístup
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Váš účet zatím nemá přiřazenou roli. Požádejte správce o přidělení přístupu.
        </p>
        <form action={logout} className="mt-6">
          <Button type="submit" variant="outline" size="lg" className="w-full">
            Odhlásit se
          </Button>
        </form>
      </div>
    </div>
  )
}
