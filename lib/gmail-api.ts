// Čistý server-only modul pro Gmail: OAuth (authorization code + refresh) a REST
// volání přes fetch. Bez balíku `googleapis`. Sdílený mezi route handlery a
// server actions (proto NENÍ "use server" — vyváží i ne-async helpery).

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

export class GmailAuthError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Chybí proměnná prostředí: ${name}`)
  return value
}

export function buildAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) {
    throw new Error(`Výměna kódu selhala: ${await res.text()}`)
  }
  return (await res.json()) as TokenResponse
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) {
    // invalid_grant = odvolaný / expirovaný refresh token → nutné znovu připojit.
    throw new GmailAuthError(`Obnovení tokenu selhalo: ${await res.text()}`)
  }
  const data = (await res.json()) as TokenResponse
  return data.access_token
}

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Gmail API ${path} → ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}

export async function getProfileEmail(accessToken: string): Promise<string> {
  const data = await gmailGet<{ emailAddress: string }>(accessToken, "/profile")
  return data.emailAddress
}

export interface GmailLabel {
  id: string
  name: string
  type: string
}

export interface GmailStatus {
  connected: boolean
  email: string | null
  labelId: string | null
  labelName: string | null
  lastSyncAt: string | null
}

export interface GmailSyncResult {
  imported: number
  skipped: number
  errors: string[]
  needsReconnect?: boolean
  error?: string
}

export async function listLabels(accessToken: string): Promise<GmailLabel[]> {
  const data = await gmailGet<{ labels: GmailLabel[] }>(accessToken, "/labels")
  return data.labels ?? []
}

// Vrátí ID zpráv v daném labelu (stránkuje, s horním limitem kvůli zátěži).
// `query` je volitelný Gmail search dotaz (např. "after:2026/01/01").
export async function listMessageIds(
  accessToken: string,
  labelId: string,
  query = "",
  maxMessages = 200
): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ labelIds: labelId, maxResults: "100" })
    if (query) params.set("q", query)
    if (pageToken) params.set("pageToken", pageToken)
    const data = await gmailGet<{
      messages?: { id: string }[]
      nextPageToken?: string
    }>(accessToken, `/messages?${params.toString()}`)
    for (const m of data.messages ?? []) ids.push(m.id)
    pageToken = data.nextPageToken
  } while (pageToken && ids.length < maxMessages)
  return ids.slice(0, maxMessages)
}

interface MessagePart {
  filename?: string
  mimeType?: string
  body?: { attachmentId?: string; size?: number }
  parts?: MessagePart[]
}

export interface GmailMessage {
  id: string
  internalDate?: string
  payload?: {
    headers?: { name: string; value: string }[]
    parts?: MessagePart[]
    filename?: string
    mimeType?: string
    body?: { attachmentId?: string }
  }
}

export interface PdfAttachment {
  attachmentId: string
  filename: string
}

export async function getMessage(accessToken: string, id: string): Promise<GmailMessage> {
  return gmailGet<GmailMessage>(accessToken, `/messages/${id}?format=full`)
}

function isPdfPart(part: MessagePart): boolean {
  const byMime = part.mimeType === "application/pdf"
  const byName = (part.filename ?? "").toLowerCase().endsWith(".pdf")
  return Boolean(part.body?.attachmentId) && (byMime || byName)
}

// Rekurzivně projde části zprávy a vrátí PDF přílohy.
export function extractPdfAttachments(message: GmailMessage): PdfAttachment[] {
  const out: PdfAttachment[] = []
  const walk = (part: MessagePart | undefined) => {
    if (!part) return
    if (isPdfPart(part) && part.body?.attachmentId) {
      out.push({ attachmentId: part.body.attachmentId, filename: part.filename || "faktura.pdf" })
    }
    for (const child of part.parts ?? []) walk(child)
  }
  walk(message.payload)
  return out
}

export function getHeader(message: GmailMessage, name: string): string {
  const headers = message.payload?.headers ?? []
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
}

// Vrátí obsah přílohy jako standardní base64 (Gmail vrací base64url).
export async function getAttachmentBase64(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<string> {
  const data = await gmailGet<{ data: string }>(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`
  )
  return Buffer.from(data.data, "base64url").toString("base64")
}
