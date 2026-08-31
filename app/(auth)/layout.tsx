export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="auth-scene flex flex-col items-center justify-center gap-5 p-4">{children}</div>
}
