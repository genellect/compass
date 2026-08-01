import type { CSSProperties } from "react";
import styles from "../future-strategy-library.module.css";

const gridCells = Array.from({ length: 24 }, (_, index) => ({
  x: 48 + (index % 6) * 68,
  y: 350 + Math.floor(index / 6) * 48
}));

const layers = [
  { number: "01", label: "EXAM", x: 300, y: 290, width: 230, accent: "#66e6ef" },
  { number: "02", label: "ENGLISH", x: 354, y: 246, width: 244, accent: "#e7bc5d" },
  { number: "03", label: "AI", x: 414, y: 204, width: 224, accent: "#9587ff" },
  { number: "04", label: "LAB", x: 468, y: 162, width: 238, accent: "#77dfc6" },
  { number: "05", label: "GRADUATE", x: 526, y: 120, width: 226, accent: "#77dfc6" },
  { number: "06", label: "CAREER", x: 582, y: 78, width: 218, accent: "#77dfc6" }
] as const;

export function KnowledgeHorizonGraphic() {
  return (
    <div className={styles.knowledgeGraphic} aria-hidden="true">
      <svg className={styles.knowledgeDesktop} viewBox="0 0 860 600" focusable="false">
        <defs>
          <linearGradient id="fsl-horizon-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#66e6ef" stopOpacity="0.08" />
            <stop offset="0.48" stopColor="#66e6ef" stopOpacity="0.92" />
            <stop offset="1" stopColor="#b6fff1" stopOpacity="0.32" />
          </linearGradient>
          <linearGradient id="fsl-layer-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="1" stopColor="#66e6ef" stopOpacity="0.025" />
          </linearGradient>
          <filter id="fsl-signal-glow" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <clipPath id="fsl-scan-clip"><rect x="268" y="55" width="548" height="352" rx="18" /></clipPath>
        </defs>

        <g className={styles.graphicFrame}>
          <path d="M27 32h90M27 32v58M833 32h-90M833 32v58M27 568h90M27 568v-58M833 568h-90M833 568v-58" />
          <text x="30" y="22">FSL / KNOWLEDGE HORIZON</text>
          <text x="830" y="22" textAnchor="end">COORDINATES 01—06</text>
        </g>

        <g className={styles.curriculumMatrix}>
          {gridCells.map((cell, index) => (
            <rect key={index} x={cell.x} y={cell.y} width="58" height="36" rx="2" />
          ))}
          <text x="48" y="338">CURRICULUM / CURRENT COORDINATES</text>
          <text x="57" y="372">LECTURE</text>
          <text x="193" y="420">EXAM</text>
          <text x="329" y="468">LAB</text>
        </g>

        <g className={styles.domainRails}>
          <path d="M48 540H420" />
          <path d="M48 526H480" />
          <path d="M48 512H540" />
          <path d="M48 498H600" />
          <text x="612" y="501">RESEARCH &amp; CAREER</text>
          <text x="552" y="515">AI LITERACY</text>
          <text x="492" y="529">ENGLISH</text>
          <text x="432" y="543">PHARMACY</text>
        </g>

        <g className={styles.documentLayers}>
          {layers.map((layer, index) => (
            <g key={layer.number} className={styles.documentLayer} style={{ "--layer-delay": `${index * 55}ms` } as CSSProperties}>
              <rect x={layer.x} y={layer.y} width={layer.width} height="112" rx="8" fill="url(#fsl-layer-fill)" />
              <line x1={layer.x + 18} y1={layer.y + 29} x2={layer.x + layer.width - 18} y2={layer.y + 29} stroke={layer.accent} />
              <line x1={layer.x + 18} y1={layer.y + 58} x2={layer.x + layer.width * 0.67} y2={layer.y + 58} />
              <line x1={layer.x + 18} y1={layer.y + 76} x2={layer.x + layer.width * 0.47} y2={layer.y + 76} />
              <text x={layer.x + 18} y={layer.y + 21}>{layer.number} / {layer.label}</text>
              <path d={`M${layer.x + layer.width - 30} ${layer.y + 16}h14v14`} stroke={layer.accent} />
            </g>
          ))}
        </g>

        <g className={styles.horizonGroup}>
          <path className={styles.horizonHalo} d="M38 475C195 460 345 414 470 350S690 217 826 118" />
          <path className={styles.horizonLine} d="M38 475C195 460 345 414 470 350S690 217 826 118" />
          <text x="76" y="463">SYLLABUS</text>
          <text x="740" y="102">BEYOND / NEXT</text>
        </g>

        <g className={styles.futureCoordinates}>
          <g transform="translate(620 282)"><circle r="5" /><circle r="15" /><text x="22" y="4">PRACTICE</text></g>
          <g transform="translate(689 224)"><circle r="5" /><circle r="15" /><text x="22" y="4">RESEARCH</text></g>
          <g transform="translate(747 169)"><circle r="5" /><circle r="15" /><text x="22" y="4">GRADUATE</text></g>
          <g transform="translate(798 126)"><circle r="5" /><circle r="15" /><text x="-18" y="-22" textAnchor="end">CAREER</text></g>
        </g>

        <g clipPath="url(#fsl-scan-clip)">
          <line className={styles.readerSignal} x1="280" y1="46" x2="280" y2="423" />
          <circle className={styles.readerSignalPoint} cx="280" cy="356" r="4" filter="url(#fsl-signal-glow)" />
        </g>
      </svg>

      <svg className={styles.knowledgeMobile} viewBox="0 0 360 302" focusable="false">
        <defs>
          <linearGradient id="fsl-mobile-line" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#66e6ef" stopOpacity="0.2" />
            <stop offset="0.5" stopColor="#66e6ef" stopOpacity="0.95" />
            <stop offset="1" stopColor="#b6fff1" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        <g className={styles.mobileFrame}>
          <path d="M12 18h48M12 18v38M348 18h-48M348 18v38M12 284h48M12 284v-38M348 284h-48M348 284v-38" />
          <text x="18" y="12">KNOWLEDGE WINDOW</text>
          <text x="342" y="12" textAnchor="end">01—06</text>
        </g>
        <g className={styles.mobileRails}>
          <path d="M36 62V256" />
          <path d="M46 62V256" />
          <path d="M56 62V256" />
          <path d="M66 62V256" />
          <text x="30" y="275">4 DOMAIN RAILS</text>
        </g>
        <path className={styles.mobileHorizon} d="M52 260C94 220 104 161 155 128S262 103 326 46" />
        <g className={styles.mobileTopics}>
          <g transform="translate(74 235)"><circle r="4" /><text x="16" y="-3">01 EXAM</text><text x="16" y="12">試験対策</text></g>
          <g transform="translate(99 199)"><circle r="4" /><text x="16" y="-3">02 ENGLISH</text><text x="16" y="12">英語</text></g>
          <g transform="translate(125 163)"><circle r="4" /><text x="16" y="-3">03 AI</text><text x="16" y="12">AI活用</text></g>
          <g transform="translate(169 123)"><circle r="4" /><text x="16" y="-3">04 LAB</text><text x="16" y="12">研究室</text></g>
          <g transform="translate(229 96)"><circle r="4" /><text x="16" y="-3">05 GRADUATE</text><text x="16" y="12">大学院</text></g>
          <g transform="translate(296 63)"><circle r="4" /><text x="-16" y="-3" textAnchor="end">06 CAREER</text><text x="-16" y="12" textAnchor="end">キャリア</text></g>
        </g>
        <line className={styles.mobileScan} x1="151" y1="38" x2="151" y2="268" />
      </svg>
    </div>
  );
}
