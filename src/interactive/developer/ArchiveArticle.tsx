import Link from "next/link";
import { Section } from "./DocPrimitives";

export function ArchiveArticle() {
  return <>
    <Section id="judges" title="審査員の方へ">
      <p>8月時点のアーカイブをご覧になりたい場合は、<Link href="/INTRO_Interactive/developers/archive/2026-08/">こちらをご参照ください</Link>。</p>
    </Section>
    <Section id="production" title="現行本番ページ">
      <p><a href="https://compass-official.pages.dev/INTRO_Interactive/developers/" target="_blank" rel="noopener noreferrer">現在公開している開発者向けページを見る ↗</a></p>
    </Section>
  </>;
}
