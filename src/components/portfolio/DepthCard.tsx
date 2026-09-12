import { type ComponentPropsWithoutRef } from "react";
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

export function DepthVisual({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className={(className ?? "") + " " + styles.frame} data-depth-visual>
    <span className={styles.geometry} data-depth-geometry aria-hidden="true">
      {(["back", "left", "right", "top", "bottom"] as const).map(face =>
        <span key={face} className={styles.face} data-depth-face={face} />)}
    </span>
    <div className={styles.surface} data-depth-surface>{children}</div>
  </div>;
}
