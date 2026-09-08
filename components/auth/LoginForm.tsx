"use client"

import { useState } from "react"
import { Eye, EyeOff, Lock, Mail } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError("Nesprávný e-mail nebo heslo.")
      setLoading(false)
      return
    }
    window.location.assign("/")
  }

  async function handleGoogleLogin() {
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError("Přihlášení přes Google se nezdařilo.")
      setLoading(false)
    }
    // On success the browser is redirected to Google.
  }

  return (
    <form onSubmit={handlePasswordLogin} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="email" className="auth-label block">
          E-mail
        </label>
        <div className="relative">
          <Mail className="auth-icon absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" />
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vy@example.com"
            className="auth-input"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="auth-label block">
          Heslo
        </label>
        <div className="relative">
          <Lock className="auth-icon absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="auth-input"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="auth-icon absolute right-3.5 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity"
            aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p className="auth-error text-sm font-medium" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="auth-btn-primary w-full h-11 text-sm font-semibold flex items-center justify-center"
      >
        {loading ? "Přihlašuji…" : "Přihlásit se"}
      </button>

      <div className="flex items-center gap-3 text-xs auth-muted">
        <span className="auth-divider-line flex-1 h-px" />
        nebo pokračovat přes
        <span className="auth-divider-line flex-1 h-px" />
      </div>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading}
        className="auth-btn-google w-full h-11 text-sm font-semibold flex items-center justify-center gap-2.5"
      >
        <GoogleIcon />
        Google
      </button>
    </form>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}
