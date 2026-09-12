import { type ComponentPropsWithoutRef } from "react";
import Image from "next/image";
import styles from "./portfolio-depth.module.css";

type Props = ComponentPropsWithoutRef<"article"> & {
  depth: "expertise" | "experience" | "photo";
  editorial?: boolean;
};

/** Text remains in ordinary document flow, outside the decorative 3D scene. */
export function DepthCard({ depth, editorial = false, children, ...props }: Props) {
  return <article {...props} data-depth-card={depth} data-depth-editorial={editorial || undefined}>
    {children}
  </article>;
}

/** A static render of a real 3D model; independent of photo/text paint order. */
export function ExpertiseModel({ kind, language }: { kind: "bio" | "ai" | "education"; language: "ja" | "en" }) {
  return <div className={styles.model} data-expertise-model={kind} aria-hidden="true">
    <Image src={`/images/founder-portfolio/models/${language}-${kind}.webp`} alt="" width={560} height={420} loading="eager" decoding="sync" />
  </div>;
}

export function DepthVisual({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className={(className ?? "") + " " + styles.frame} data-depth-visual>
    <span className={styles.geometry} data-depth-geometry aria-hidden="true">
      {(["back", "left", "right", "top", "bottom"] as const).map(face =>
        <span key={face} className={styles.face} data-depth-face={face} />)}
    </span>
    <div className={styles.surface} data-depth-surface>{children}</div>
  </div>;
}
