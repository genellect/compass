import type { ReactNode } from "react";
import styles from "./engineering-docs.module.css";

export const REVISION = "634cd8682ea07eaf23aabfd8a647422a49295030";
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className={styles.section}><h2>{title}</h2>{children}</section>;
}
export function Note({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}
export function SourceLinks({ items, revision = REVISION }: { items: ReadonlyArray<readonly [string, string]>; revision?: string }) {
  const source = `https://github.com/genellect/compass-interactive/blob/${revision}/`;
  return <details className={styles.sources}><summary>実装参照 <span>{items.length}件</span></summary><ul>{items.map(([label, path]) =>
    <li key={path}><a href={`${source}${path}`} target="_blank" rel="noopener noreferrer">{label} ↗</a><code>{path}</code></li>
  )}</ul></details>;
}
export function Flow({ title, steps, note }: { title: string; steps: ReadonlyArray<readonly [string, string]>; note?: string }) {
  return <figure className={styles.flow}><figcaption>{title}</figcaption><ol className={styles.flowSteps}>{steps.map(([heading, text]) =>
    <li key={heading}><strong>{heading}</strong><span>{text}</span></li>
  )}</ol>{note && <p className={styles.figureNote}>{note}</p>}</figure>;
}
export function Table({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={`${columns.join("・")}の表`}><table><thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map((row, i) =>
    <tr key={i}>{row.map((cell, j) => j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>)}</tr>
  )}</tbody></table></div>;
}
