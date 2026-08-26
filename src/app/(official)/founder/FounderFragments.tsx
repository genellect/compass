import Image from "next/image";
import styles from "./founder.module.css";

type FragmentPhoto = {
  key: string;
  src: string;
  srcSet: string;
  width: number;
  height: number;
  alt: string;
  role: "anchor" | "research" | "engineering" | "atmosphere" | "closing";
  crop?: "anchor" | "lab" | "pipette" | "code-window";
  tone?: "warm" | "lift" | "tech";
  sizes: string;
};

const assetRoot = "/images/founder-portfolio/fragments";

const fragmentSpreads: readonly (readonly FragmentPhoto[])[] = [
  [
    {
      key: "yuto-696",
      src: `${assetRoot}/yuto-696-1566.webp`,
      srcSet: `${assetRoot}/yuto-696-640.webp 640w, ${assetRoot}/yuto-696-1566.webp 1566w`,
      width: 1566,
      height: 1044,
      alt: "ライトアップされた階段に腰掛けるYuto Matsui",
      role: "anchor",
      crop: "anchor",
      tone: "warm",
      sizes: "(max-width: 900px) calc(100vw - 34px), 66vw"
    },
    {
      key: "dna-automation",
      src: `${assetRoot}/dna-automation-1920.webp`,
      srcSet: `${assetRoot}/dna-automation-640.webp 640w, ${assetRoot}/dna-automation-1280.webp 1280w, ${assetRoot}/dna-automation-1920.webp 1920w`,
      width: 1920,
      height: 1280,
      alt: "DNA試料を自動処理するリキッドハンドリング装置",
      role: "research",
      sizes: "(max-width: 900px) 46vw, 33vw"
    },
    {
      key: "yuto-706",
      src: `${assetRoot}/yuto-706-1044.webp`,
      srcSet: `${assetRoot}/yuto-706-640.webp 640w, ${assetRoot}/yuto-706-1044.webp 1044w`,
      width: 1044,
      height: 1566,
      alt: "夜の都市を背景に立つYuto Matsui",
      role: "atmosphere",
      tone: "warm",
      sizes: "(max-width: 900px) 46vw, 25vw"
    },
    {
      key: "code-terminal",
      src: `${assetRoot}/code-terminal-1920.webp`,
      srcSet: `${assetRoot}/code-terminal-640.webp 640w, ${assetRoot}/code-terminal-1280.webp 1280w, ${assetRoot}/code-terminal-1920.webp 1920w`,
      width: 1920,
      height: 1280,
      alt: "コードエディターとターミナルを表示した開発画面",
      role: "engineering",
      tone: "tech",
      sizes: "(max-width: 900px) calc(100vw - 34px), 50vw"
    }
  ],
  [
    {
      key: "yuto-701",
      src: `${assetRoot}/yuto-701-1108.webp`,
      srcSet: `${assetRoot}/yuto-701-640.webp 640w, ${assetRoot}/yuto-701-1108.webp 1108w`,
      width: 1108,
      height: 1477,
      alt: "顕微鏡画像をモニターで確認するYuto Matsui",
      role: "research",
      crop: "lab",
      sizes: "(max-width: 900px) 46vw, 17vw"
    },
    {
      key: "pipette",
      src: `${assetRoot}/pipette-1920.webp`,
      srcSet: `${assetRoot}/pipette-640.webp 640w, ${assetRoot}/pipette-1280.webp 1280w, ${assetRoot}/pipette-1920.webp 1920w`,
      width: 1920,
      height: 2658,
      alt: "手袋を着けた手で試料を分注するピペット操作",
      role: "research",
      crop: "pipette",
      sizes: "(max-width: 900px) 46vw, 25vw"
    },
    {
      key: "yuto-698",
      src: `${assetRoot}/yuto-698-1566.webp`,
      srcSet: `${assetRoot}/yuto-698-640.webp 640w, ${assetRoot}/yuto-698-1566.webp 1566w`,
      width: 1566,
      height: 1044,
      alt: "松の木のそばに立つYuto Matsui",
      role: "anchor",
      crop: "anchor",
      tone: "lift",
      sizes: "(max-width: 900px) calc(100vw - 34px), 58vw"
    },
    {
      key: "code-data",
      src: `${assetRoot}/code-data-1920.webp`,
      srcSet: `${assetRoot}/code-data-640.webp 640w, ${assetRoot}/code-data-1280.webp 1280w, ${assetRoot}/code-data-1920.webp 1920w`,
      width: 1920,
      height: 1278,
      alt: "開発環境とパフォーマンス分析チャートを表示したノートPC",
      role: "engineering",
      tone: "tech",
      sizes: "(max-width: 900px) calc(100vw - 34px), 58vw"
    }
  ],
  [
    {
      key: "code-window",
      src: `${assetRoot}/code-window-1920.webp`,
      srcSet: `${assetRoot}/code-window-640.webp 640w, ${assetRoot}/code-window-1280.webp 1280w, ${assetRoot}/code-window-1920.webp 1920w`,
      width: 1920,
      height: 3413,
      alt: "窓辺の自然光に置かれたコード表示中のノートPC",
      role: "engineering",
      crop: "code-window",
      sizes: "(max-width: 900px) 46vw, 25vw"
    },
    {
      key: "yuto-695",
      src: `${assetRoot}/yuto-695-1566.webp`,
      srcSet: `${assetRoot}/yuto-695-640.webp 640w, ${assetRoot}/yuto-695-1566.webp 1566w`,
      width: 1566,
      height: 1044,
      alt: "横浜港と橋を背景に立つYuto Matsui",
      role: "atmosphere",
      sizes: "(max-width: 900px) 46vw, 42vw"
    },
    {
      key: "servers",
      src: `${assetRoot}/servers-1920.webp`,
      srcSet: `${assetRoot}/servers-640.webp 640w, ${assetRoot}/servers-1280.webp 1280w, ${assetRoot}/servers-1920.webp 1920w`,
      width: 1920,
      height: 1280,
      alt: "データセンターに並ぶサーバーラック",
      role: "engineering",
      tone: "tech",
      sizes: "(max-width: 900px) 46vw, 33vw"
    },
    {
      key: "yuto-707",
      src: `${assetRoot}/yuto-707-1477.webp`,
      srcSet: `${assetRoot}/yuto-707-640.webp 640w, ${assetRoot}/yuto-707-1477.webp 1477w`,
      width: 1477,
      height: 1108,
      alt: "夜の横浜駅周辺に広がる都市建築",
      role: "atmosphere",
      sizes: "(max-width: 900px) 46vw, 42vw"
    }
  ],
  [
    {
      key: "yuto-697",
      src: `${assetRoot}/yuto-697-1044.webp`,
      srcSet: `${assetRoot}/yuto-697-640.webp 640w, ${assetRoot}/yuto-697-1044.webp 1044w`,
      width: 1044,
      height: 1566,
      alt: "提灯の下に座るYuto Matsui",
      role: "atmosphere",
      tone: "warm",
      sizes: "(max-width: 900px) 46vw, 25vw"
    },
    {
      key: "yuto-700",
      src: `${assetRoot}/yuto-700-1477.webp`,
      srcSet: `${assetRoot}/yuto-700-640.webp 640w, ${assetRoot}/yuto-700-1477.webp 1477w`,
      width: 1477,
      height: 1108,
      alt: "青空の下に連なる山々と富士山",
      role: "atmosphere",
      sizes: "(max-width: 900px) 46vw, 58vw"
    },
    {
      key: "yuto-699",
      src: `${assetRoot}/yuto-699-1044.webp`,
      srcSet: `${assetRoot}/yuto-699-640.webp 640w, ${assetRoot}/yuto-699-1044.webp 1044w`,
      width: 1044,
      height: 1566,
      alt: "曲線的な建築のカフェテラスに座るYuto Matsui",
      role: "atmosphere",
      tone: "warm",
      sizes: "(max-width: 900px) 46vw, 25vw"
    },
    {
      key: "yuto-704",
      src: `${assetRoot}/yuto-704-1372.webp`,
      srcSet: `${assetRoot}/yuto-704-640.webp 640w, ${assetRoot}/yuto-704-1372.webp 1372w`,
      width: 1372,
      height: 1192,
      alt: "松の木を背景に横を向くYuto Matsui",
      role: "closing",
      sizes: "(max-width: 900px) 74vw, 33vw"
    }
  ]
] as const;

function FragmentAmbientGraphic({ variant }: { variant: number }) {
  return (
    <svg
      className={styles.fragmentAmbient}
      data-fragment-ambient={variant}
      viewBox="0 0 520 220"
      aria-hidden="true"
      focusable="false"
    >
      <g className={styles.fragmentAmbientDrift}>
        <g className={styles.fragmentAmbientHelix}>
          <path d="M18 68C74 20 132 116 189 68S303 20 360 68s114 48 142 4" />
          <path d="M18 72c56 48 114-48 171 0s114 48 171 0 114-48 142-4" />
          <path d="M51 48v44M98 45v50M145 49v42M214 47v47M262 45v50M309 49v42M378 48v44M426 46v48M474 51v38" />
        </g>

        <g className={styles.fragmentAmbientCircuit}>
          <path d="M20 176h70v-38h72v27h61v-58h71v21h69V80h132" />
          <path d="M90 176v22h96M294 128v48h92M363 80V52h72" />
          <circle cx="20" cy="176" r="4" />
          <circle cx="90" cy="138" r="4" />
          <circle cx="162" cy="165" r="4" />
          <circle cx="223" cy="107" r="4" />
          <circle cx="294" cy="128" r="4" />
          <circle cx="363" cy="80" r="4" />
          <circle cx="495" cy="80" r="4" />
        </g>

        <g className={styles.fragmentAmbientCell} transform="translate(432 152)">
          <circle r="31" />
          <circle r="18" />
          <circle cx="-8" cy="-5" r="3" />
          <circle cx="9" cy="7" r="2" />
          <path d="M-22 11c9-7 15-8 24-4s14 2 21-3" />
        </g>
      </g>
    </svg>
  );
}

export function FounderFragments() {
  return (
    <section id="fragments" className={styles.fragments} aria-labelledby="fragments-title">
      <div className={styles.sectionShell}>
        <header className={styles.fragmentsHeader}>
          <h2 id="fragments-title">FRAGMENTS</h2>
        </header>

        <div className={styles.fragmentsEssay}>
          {fragmentSpreads.map((spread, spreadIndex) => (
            <div
              key={spreadIndex}
              className={styles.fragmentSpread}
              data-spread={spreadIndex + 1}
            >
              <FragmentAmbientGraphic variant={spreadIndex + 1} />
              {spread.map((photo) => (
                <figure
                  key={photo.key}
                  className={styles.fragmentPhoto}
                  data-slot={photo.key}
                  data-role={photo.role}
                  data-crop={photo.crop}
                  data-tone={photo.tone}
                >
                  <picture className={styles.fragmentPicture}>
                    <source type="image/webp" srcSet={photo.srcSet} sizes={photo.sizes} />
                    <Image
                      className={styles.fragmentImage}
                      src={photo.src}
                      alt={photo.alt}
                      width={photo.width}
                      height={photo.height}
                      sizes={photo.sizes}
                      loading="lazy"
                      decoding="async"
                    />
                  </picture>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
