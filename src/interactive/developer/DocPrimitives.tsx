import type { ReactNode } from "react";
import styles from "./engineering-docs.module.css";

export const REVISION = "634cd8682ea07eaf23aabfd8a647422a49295030";
const SOURCE = `https://github.com/genellect/compass-interactive/blob/${REVISION}/`;

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className={styles.section}><h2>{title}</h2>{children}</section>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

export function SourceLinks({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  return <aside className={styles.sources} aria-label="この説明の実装根拠"><p>実装を読む</p><ul>{items.map(([label, path]) =>
    <li key={path}><a href={`${SOURCE}${path}`} target="_blank" rel="noopener noreferrer">{label}<span aria-hidden="true"> ↗</span></a><span className={styles.sourcePath}>{path}</span></li>
  )}</ul></aside>;
}

export function Flow({ title, steps, note }: { title: string; steps: ReadonlyArray<readonly [string, string]>; note?: string }) {
  return <figure className={styles.flow}><figcaption>{title}</figcaption><ol className={styles.flowSteps}>{steps.map(([heading, text]) =>
    <li key={heading}><strong>{heading}</strong><span>{text}</span></li>
  )}</ol>{note && <p className={styles.figureNote}>{note}</p>}</figure>;
}

export function Table({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return <div className={styles.tableWrap}><table><thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map((row, i) =>
    <tr key={i}>{row.map((cell, j) => j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>)}</tr>
  )}</tbody></table></div>;
}
