import { ReceiptText } from "lucide-react"
import LoginForm from "@/components/auth/LoginForm"

export default function LoginPage() {
  return (
    <div className="auth-card w-full max-w-4xl grid md:grid-cols-2 gap-2 p-2">
      {/* Left panel — white, glass sphere. Hidden on mobile */}
      <div className="auth-hero hidden md:flex flex-col justify-between p-9 min-h-[560px]">
        <span className="auth-hero-word">FAKTURACE</span>

        <div className="relative z-10 flex items-center gap-2.5">
          <div className="auth-logo-badge w-9 h-9 flex items-center justify-center">
            <ReceiptText className="w-5 h-5 text-white" />
          </div>
          <span
            className="text-lg font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-heading), sans-serif" }}
          >
            Fakturace
          </span>
        </div>

        <div className="relative z-10 flex justify-center py-6">
          <div className="auth-orb-wrap">
            <div className="auth-orb" />
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="auth-title text-[1.7rem] leading-tight font-extrabold">Chytrá fakturace</h1>
          <p className="auth-muted mt-2 text-sm max-w-xs">
            Vydané i přijaté faktury, souhrnné hlášení a evidence kontaktů — na jednom
            místě, přehledně a rychle.
          </p>
        </div>
      </div>

      {/* Right panel — grey-tinted form */}
      <div className="auth-form-panel px-7 py-9 sm:px-10 sm:py-11 flex flex-col justify-center">
        <h2 className="auth-title text-[1.6rem] font-extrabold">Vítejte zpět</h2>
        <p className="auth-subtitle mt-1 text-sm">Přihlaste se pro přístup do aplikace</p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
