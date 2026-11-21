import LoginForm from "@/components/auth/LoginForm"
import ThemeToggle from "@/components/auth/ThemeToggle"

export default function LoginPage() {
  return (
    <main className="relative w-full max-w-[400px]">
      <ThemeToggle />
      <div className="auth-card rounded-[40px] [corner-shape:squircle] px-9 pb-9 pt-10">
        <h1 className="font-heading text-[1.75rem] font-extrabold leading-tight tracking-[-0.025em]">
          Přihlášení
        </h1>
        <p className="mt-2 text-[15px] leading-normal text-[var(--auth-muted)]">
          Pokračujte do aplikace Fakturace.
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
      <p className="mt-6 text-center text-[13px] text-[var(--auth-muted)]">
        Nemáte přístup? Požádejte administrátora.
      </p>
    </main>
  )
}
