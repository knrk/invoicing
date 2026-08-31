import { ReceiptText } from "lucide-react"
import LoginForm from "@/components/auth/LoginForm"

export default function LoginPage() {
  return (
    <div className="auth-card w-full max-w-4xl grid md:grid-cols-2 gap-2 p-2">
      {/* Left panel — white, glass sphere. Hidden on mobile */}
      <div className="auth-hero hidden md:flex flex-col justify-between p-9 min-h-[560px]">
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

        <div className="relative z-0 flex justify-center py-6">
          <div className="auth-orb-wrap">
            <div className="auth-orb-img" />
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="auth-title text-[1.7rem] leading-tight font-extrabold">Chytrá fakturace</h1>
          <p className="auth-muted mt-2 text-sm max-w-xs">
            Vydané i přijaté faktury, souhrnné hlášení a evidence kontaktů — na jednom
            místě, přehledně a rychle.
          </p>
        </div>

        {/* static, full-width frosted glass band covering the lower half of the panel */}
        <div className="auth-orb-glass" />
        {/* SVG "dissolve" filter — organic liquid edge for the glass band */}
        <svg width="0" height="0" aria-hidden="true" className="absolute">
          <filter id="glassDissolve" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.02"
              numOctaves={2}
              seed={7}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={16}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
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
