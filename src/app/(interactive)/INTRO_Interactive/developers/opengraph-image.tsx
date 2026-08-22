import { ImageResponse } from "next/og";

export const alt = "COMPASS Interactive — Architecture, Security & Engineering";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          color: "#f5fbfd",
          background: "linear-gradient(135deg, #050d18 0%, #071827 58%, #0a2134 100%)",
          padding: "72px 78px"
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 560,
            height: 560,
            right: -110,
            top: 22,
            display: "flex",
            border: "1px solid rgba(112,225,244,.26)",
            borderRadius: "50%"
          }}
        />
        <div
          style={{
            width: 640,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#70e1f4", fontSize: 22, fontWeight: 800, letterSpacing: ".12em" }}>
              COMPASS INTERACTIVE
            </span>
            <h1 style={{ margin: "42px 0 0", fontSize: 67, lineHeight: 1.04, letterSpacing: "-.055em" }}>
              One real-time foundation for the entire lecture.
            </h1>
          </div>
          <div style={{ display: "flex", gap: 18, color: "rgba(229,244,248,.7)", fontSize: 18 }}>
            <span>ARCHITECTURE</span><span>/</span><span>SECURITY</span><span>/</span><span>ENGINEERING</span>
          </div>
        </div>
        <div
          style={{
            marginLeft: "auto",
            width: 340,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 16
          }}
        >
          {[
            ["REACT UI", "STUDENT / EDUCATOR"],
            ["POSTGRESQL / RLS", "STATE / AUTHORIZATION"],
            ["EDGE / PRIVATE R2", "AI / MATERIAL DELIVERY"],
            [".NET BRIDGE", "POWERPOINT / X86 + X64"]
          ].map(([runtime, role]) => (
            <div
              key={runtime}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "15px 18px",
                border: "1px solid rgba(151,224,237,.2)",
                borderRadius: 9,
                background: "rgba(6,20,31,.74)"
              }}
            >
              <strong style={{ color: "#edf9fb", fontSize: 20 }}>{runtime}</strong>
              <span style={{ marginTop: 5, color: "#87f0bf", fontSize: 12, letterSpacing: ".08em" }}>{role}</span>
            </div>
          ))}
          <span style={{ alignSelf: "flex-end", color: "rgba(224,241,245,.58)", fontSize: 15 }}>
            main@eb12b48c
          </span>
        </div>
      </div>
    ),
    size
  );
}
