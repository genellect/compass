import { ImageResponse } from "next/og";

export const alt = "COMPASS Interactive — System architecture and engineering";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", color: "#202b38", padding: "64px 76px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 27 }}><span style={{ color: "#245ca4" }}>C /</span><span>COMPASS Interactive</span></div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 82, fontSize: 64, lineHeight: 1.14, letterSpacing: "-0.035em" }}><span>System architecture</span><span>and engineering</span></div>
      <div style={{ display: "flex", marginTop: "auto", borderTop: "1px solid #dfe5ea", paddingTop: 26, color: "#5a6775", fontSize: 21 }}>Lecture state · AI execution · Document delivery · Authorization</div>
    </div>, size
  );
}
