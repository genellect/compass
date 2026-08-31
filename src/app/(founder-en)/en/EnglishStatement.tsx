"use client";

import { useState } from "react";
import { statementParagraphs } from "./content";
import styles from "./english-founder.module.css";

export function EnglishStatement() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.statementText}>
      <div className={styles.statementOpening}>
        {statementParagraphs.slice(0, 3).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>

      <div
        id="english-statement-continuation"
        className={styles.statementContinuation}
        data-expanded={expanded}
        hidden={!expanded}
      >
        {statementParagraphs.slice(3).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>

      <button
        type="button"
        className={styles.disclosureButton}
        aria-expanded={expanded}
        aria-controls="english-statement-continuation"
        onClick={() => setExpanded((current) => !current)}
      >
        <span>{expanded ? "Close statement" : "Read the full statement"}</span>
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
    </div>
  );
}

