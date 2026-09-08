import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const WIDTH = 1200;
const HEIGHT = 630;
const BRAND = "#287BFF";
const BACKGROUND = "#080B12";

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export default function handler(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const title = truncate(searchParams.get("title") || "SyncBlaze", 80);
  const subtitle = truncate(searchParams.get("subtitle") || "", 140);
  const avatar = searchParams.get("avatar") || "";
  const initial = title.trim().charAt(0).toUpperCase() || "S";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: BACKGROUND,
          color: "#F5F7FA",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: BRAND,
            }}
          />
          <span style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "-0.02em" }}>SyncBlaze</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px", maxWidth: "1000px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            {avatar ? (
              <img
                src={avatar}
                width={96}
                height={96}
                style={{ borderRadius: "50%", objectFit: "cover", border: `3px solid ${BRAND}` }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "96px",
                  height: "96px",
                  borderRadius: "50%",
                  background: BRAND,
                  fontSize: "44px",
                  fontWeight: 700,
                }}
              >
                {initial}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "56px", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                {title}
              </span>
              {subtitle ? (
                <span style={{ fontSize: "28px", color: "#9AA4B2" }}>{subtitle}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", fontSize: "22px", color: "#9AA4B2" }}>
          {new URL(origin).hostname}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  );
}
