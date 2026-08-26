import { links } from "../content/interactiveContent";
import { ProductFilm } from "../components/ui/ProductFilm";
import { Reveal } from "../components/ui/Reveal";

export function MobileLectureStatus() {
  return (
    <section id="experience" className="experience-section" aria-labelledby="experience-title">
      <div className="section__inner experience-section__inner">
        <Reveal className="experience-copy">
          <p className="eyebrow">3 MINUTE EXPERIENCE</p>
          <h2 id="experience-title">講義はもう、<br />聞くだけじゃない。</h2>
          <p className="experience-lead">
            資料が動く。問いが届く。みんなの声が重なる。AIがその瞬間の学びを整理する。
            これまで分断されていた体験が、ひとつの講義空間でつながります。
          </p>
          <ol className="experience-steps">
            <li><span>01</span><strong>資料と同期</strong><small>講義と同じページが手元に届く</small></li>
            <li><span>02</span><strong>その場で参加</strong><small>投票と匿名質問で反応できる</small></li>
            <li><span>03</span><strong>AIで深める</strong><small>字幕と5分要約が理解をつなぐ</small></li>
          </ol>
          <a className="experience-inline-cta" data-cta-location="experience-demo" href={links.demo}>実際の講義を3分で体験 <span aria-hidden="true">→</span></a>
        </Reveal>
        <Reveal className="experience-preview" delay={120}>
          <ProductFilm />
          <p className="experience-preview__caption"><span aria-hidden="true" /> 実際の講義で動作するCOMPASS Interactive</p>
        </Reveal>
      </div>
    </section>
  );
}
