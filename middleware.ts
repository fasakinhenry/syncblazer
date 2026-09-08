import { next } from "@vercel/edge";

export const config = {
  matcher: ["/n/:token", "/u/:userId"],
};

const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:4000/api";

// Link-unfurlers (Slack, Discord, Twitter/X, iMessage, WhatsApp, etc.) never
// execute JS, so this SPA's real per-page content is invisible to them
// unless we intercept their request specifically and hand back static,
// server-rendered meta tags. Everyone else (real browsers) is untouched.
const BOT_UA = /bot|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|embedly|quora link preview|showyoubot|outbrain|w3c_validator|redditbot|applebot|skypeuripreview|nuzzel|vkshare|iframely|opengraph/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToPlainText(markdown: string, max: number): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/[#*_>`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

function renderShell(input: { pageTitle: string; description: string; image: string; url: string }): Response {
  const { pageTitle, description, image, url } = input;
  const title = escapeHtml(pageTitle);
  const desc = escapeHtml(description);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<meta name="description" content="${desc}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="SyncBlaze" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${desc}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
</head>
<body>
<p>${desc}</p>
<a href="${escapeHtml(url)}">Open in SyncBlaze</a>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { success: boolean; data: T };
    return body.success ? body.data : null;
  } catch {
    return null;
  }
}

export default async function middleware(request: Request) {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua)) return next();

  const url = new URL(request.url);
  const ogBase = `${url.origin}/api/og`;

  const noteMatch = url.pathname.match(/^\/n\/([^/]+)$/);
  if (noteMatch) {
    const token = noteMatch[1];
    const data = await fetchJson<{ note: { title: string; content: string }; owner: { name: string; avatarUrl?: string } | null }>(
      `/notes/shared/${token}`
    );
    if (!data) return next();
    const pageTitle = `${data.note.title || "Untitled note"} — SyncBlaze`;
    const description = markdownToPlainText(data.note.content || "", 160) || "A note shared on SyncBlaze.";
    const image = `${ogBase}?title=${encodeURIComponent(data.note.title || "Untitled note")}&subtitle=${encodeURIComponent(
      data.owner ? `Shared by ${data.owner.name}` : "Shared on SyncBlaze"
    )}&avatar=${encodeURIComponent(data.owner?.avatarUrl || "")}`;
    return renderShell({ pageTitle, description, image, url: url.toString() });
  }

  const profileMatch = url.pathname.match(/^\/u\/([^/]+)$/);
  if (profileMatch) {
    const userId = profileMatch[1];
    const data = await fetchJson<{ user: { name: string; avatarUrl?: string } }>(`/users/${userId}`);
    if (!data) return next();
    const pageTitle = `${data.user.name} on SyncBlaze`;
    const description = `${data.user.name} is on SyncBlaze.`;
    const image = `${ogBase}?title=${encodeURIComponent(data.user.name)}&subtitle=${encodeURIComponent("On SyncBlaze")}&avatar=${encodeURIComponent(
      data.user.avatarUrl || ""
    )}`;
    return renderShell({ pageTitle, description, image, url: url.toString() });
  }

  return next();
}
