import { ReceiptText, ShieldCheck } from "lucide-react"
import LoginForm from "@/components/auth/LoginForm"

export default function LoginPage() {
  return (
    <>
      <div className="auth-card w-full max-w-4xl grid md:grid-cols-2 gap-2 p-2">
        {/* Left hero — hidden on mobile */}
        <div className="auth-hero hidden md:flex flex-col justify-between p-9 text-white min-h-[560px]">
          <span className="auth-hero-word">FAKTURACE</span>

          <div className="relative z-10 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <ReceiptText className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Fakturace</span>
          </div>

          <div className="relative z-10 flex justify-center py-4">
            <div className="auth-orb" />
          </div>

          <div className="relative z-10">
            <h1
              className="text-[1.7rem] leading-tight font-extrabold"
              style={{ fontFamily: "var(--font-heading), sans-serif" }}
            >
              Chytrá fakturace
            </h1>
            <p className="mt-2 text-sm text-white/85 max-w-xs">
              Vydané i přijaté faktury, souhrnné hlášení a evidence kontaktů — na jednom
              místě, přehledně a rychle.
            </p>
          </div>
        </div>

        {/* Right — form */}
        <div className="px-7 py-9 sm:px-10 sm:py-11 flex flex-col justify-center">
          <h2 className="auth-title text-[1.6rem] font-extrabold">Vítejte zpět</h2>
          <p className="auth-subtitle mt-1 text-sm">Přihlaste se pro přístup do aplikace</p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </div>

      <div className="auth-badge auth-muted flex items-center gap-2.5 px-4 py-2.5 text-xs">
        <ShieldCheck className="w-4 h-4 text-[#7c5cff]" />
        Zabezpečené přihlášení přes Supabase Auth
      </div>
    </>
  )
}
