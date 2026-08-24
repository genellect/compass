import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow: string;
  title: ReactNode;
  lead?: string;
  align?: "left" | "center";
};

export function SectionHeader({ eyebrow, title, lead, align = "left" }: SectionHeaderProps) {
  return (
    <header className={`section-header section-header--${align}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </header>
  );
}
