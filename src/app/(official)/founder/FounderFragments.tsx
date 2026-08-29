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
      sizes: "(max-width: 900px) calc(100vw - 34px), 25vw"
    },
    {
      key: "microfluidic",
      src: `${assetRoot}/microfluidic-1920.webp`,
      srcSet: `${assetRoot}/microfluidic-640.webp 640w, ${assetRoot}/microfluidic-1280.webp 1280w, ${assetRoot}/microfluidic-1920.webp 1920w`,
      width: 1920,
      height: 1280,
      alt: "研究開発に用いられる精密なマイクロ流体デバイス",
      role: "research",
      sizes: "(max-width: 900px) 46vw, 17vw"
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
      alt: "花の咲く木立で木にもたれるYuto Matsui",
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
    },
    {
      key: "yuto-703",
      src: `${assetRoot}/yuto-703-1044.webp`,
      srcSet: `${assetRoot}/yuto-703-640.webp 640w, ${assetRoot}/yuto-703-1044.webp 1044w`,
      width: 1044,
      height: 1566,
      alt: "雨の中、傘を差して車を見つめるYuto Matsui",
      role: "atmosphere",
      tone: "warm",
      sizes: "(max-width: 900px) calc(100vw - 34px), 17vw"
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
      sizes: "(max-width: 900px) calc(100vw - 34px), 25vw"
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
      alt: "霧に包まれたリフト乗り場に立つYuto Matsui",
      role: "atmosphere",
      sizes: "(max-width: 900px) 46vw, 42vw"
    },
    {
      key: "silicon-wafer",
      src: `${assetRoot}/silicon-wafer-1920.webp`,
      srcSet: `${assetRoot}/silicon-wafer-640.webp 640w, ${assetRoot}/silicon-wafer-1280.webp 1280w, ${assetRoot}/silicon-wafer-1920.webp 1920w`,
      width: 1920,
      height: 1278,
      alt: "成膜装置の前で保持されるシリコンウェハー",
      role: "engineering",
      tone: "warm",
      sizes: "(max-width: 900px) 62vw, 42vw"
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
      alt: "松の木のそばに立つYuto Matsui",
      role: "atmosphere",
      sizes: "(max-width: 900px) calc(100vw - 34px), 58vw"
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
      sizes: "(max-width: 900px) calc(100vw - 34px), 33vw"
    }
  ]
] as const;

const fragmentPhotos = fragmentSpreads.flat();
const mobileFragmentRows = [
  fragmentPhotos.filter((_, index) => index % 2 === 0),
  fragmentPhotos.filter((_, index) => index % 2 === 1)
] as const;

function FragmentSignalField() {
  return (
    <svg
      className={styles.fragmentSignalField}
      data-fragment-ambient="signal-field"
      viewBox="0 0 1440 3600"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="fragment-signal-cool" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#45a7bb" />
          <stop offset="0.52" stopColor="#477fae" />
          <stop offset="1" stopColor="#5f759f" />
        </linearGradient>
        <linearGradient id="fragment-signal-warm" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d0a76d" />
          <stop offset="0.58" stopColor="#97a68a" />
          <stop offset="1" stopColor="#54a0ae" />
        </linearGradient>
        <pattern id="fragment-field-grid" width="72" height="72" patternUnits="userSpaceOnUse">
          <path d="M72 0H0V72" fill="none" stroke="#7392a7" strokeWidth="0.7" />
          <circle cx="0" cy="0" r="2.2" fill="#7392a7" />
        </pattern>
      </defs>

      <rect className={styles.fragmentFieldGrid} width="1440" height="3600" fill="url(#fragment-field-grid)" />
      <g className={styles.fragmentFieldDrift}>
        <path className={styles.fragmentFieldPath} d="M-90 310C250 110 460 620 770 390S1200 40 1530 300" />
        <path className={styles.fragmentFieldSignal} pathLength="100" d="M-90 310C250 110 460 620 770 390S1200 40 1530 300" />

        <path className={styles.fragmentFieldPath} d="M1540 950C1180 730 1010 1230 660 1060S150 760-100 1140" />
        <path className={styles.fragmentFieldSignalWarm} pathLength="100" d="M1540 950C1180 730 1010 1230 660 1060S150 760-100 1140" />

        <path className={styles.fragmentFieldPath} d="M-120 1730C250 1480 530 2070 850 1810S1210 1510 1540 1880" />
        <path className={styles.fragmentFieldSignal} pathLength="100" d="M-120 1730C250 1480 530 2070 850 1810S1210 1510 1540 1880" />

        <path className={styles.fragmentFieldPath} d="M1510 2660C1210 2380 990 2910 660 2710S200 2380-120 2800" />
        <path className={styles.fragmentFieldSignalWarm} pathLength="100" d="M1510 2660C1210 2380 990 2910 660 2710S200 2380-120 2800" />

        <g className={styles.fragmentFieldNodes}>
          <circle cx="180" cy="242" r="11" />
          <circle cx="768" cy="390" r="17" />
          <circle cx="1240" cy="176" r="9" />
          <circle cx="1186" cy="898" r="14" />
          <circle cx="658" cy="1060" r="20" />
          <circle cx="224" cy="1012" r="10" />
          <circle cx="298" cy="1660" r="13" />
          <circle cx="852" cy="1810" r="19" />
          <circle cx="1274" cy="1688" r="9" />
          <circle cx="1160" cy="2560" r="16" />
          <circle cx="660" cy="2710" r="21" />
          <circle cx="184" cy="2654" r="10" />
        </g>
      </g>
    </svg>
  );
}

function FragmentMobileReel() {
  return (
    <div className={styles.fragmentMobileReel} aria-label="FRAGMENTS photo reel">
      {mobileFragmentRows.map((row, rowIndex) => (
        <div key={rowIndex} className={styles.fragmentReelViewport}>
          <div className={styles.fragmentReelTrack} data-reel-row={rowIndex + 1}>
            {[false, true].map((duplicate) => (
              <div
                key={duplicate ? "duplicate" : "primary"}
                className={styles.fragmentReelGroup}
                aria-hidden={duplicate || undefined}
              >
                {row.map((photo) => (
                  <figure
                    key={`${photo.key}-${duplicate ? "duplicate" : "primary"}`}
                    className={styles.fragmentReelPhoto}
                    data-reel-slot={photo.key}
                    data-reel-role={photo.role}
                    data-tone={photo.tone}
                    style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
                  >
                    <picture className={styles.fragmentReelPicture}>
                      <source
                        type="image/webp"
                        srcSet={photo.srcSet}
                        sizes="(max-width: 640px) 54vw, (max-width: 900px) 38vw, 1px"
                      />
                      <Image
                        className={styles.fragmentReelImage}
                        src={photo.src}
                        alt={duplicate ? "" : photo.alt}
                        width={photo.width}
                        height={photo.height}
                        sizes="(max-width: 640px) 54vw, (max-width: 900px) 38vw, 1px"
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
      ))}
    </div>
  );
}

export function FounderFragments() {
  return (
    <section id="fragments" className={styles.fragments} aria-labelledby="fragments-title">
      <FragmentSignalField />
      <div className={styles.sectionShell}>
        <header className={styles.fragmentsHeader}>
          <h2 id="fragments-title">FRAGMENTS</h2>
          <div className={styles.fragmentSequence} aria-hidden="true">
            {fragmentSpreads.map((_, index) => <span key={index} />)}
          </div>
        </header>

        <div className={styles.fragmentsEssay}>
          {fragmentSpreads.map((spread, spreadIndex) => (
            <div
              key={spreadIndex}
              className={styles.fragmentSpread}
              data-spread={spreadIndex + 1}
            >
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

        <FragmentMobileReel />
      </div>
    </section>
  );
}
