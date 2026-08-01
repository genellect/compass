export function ManifestoSection() {
  return (
    <section id="manifesto" className="section v4-manifesto" aria-labelledby="manifesto-title">
      <div className="container v4-manifesto__frame" data-reveal>
        <div className="v4-manifesto__constellation" aria-hidden="true">
          <span /><span /><span /><span /><span /><span />
        </div>

        <div className="v4-manifesto__copy">
          <p className="v4-manifesto__label">MANIFESTO</p>
          <h2 id="manifesto-title">
            <span className="v4-manifesto__title-line"><span>観客席から</span><span>見ているには、</span></span>
            <span className="v4-manifesto__title-line"><span>この時代は</span><span>面白すぎる。</span></span>
          </h2>
          <div className="v4-manifesto__declaration">
            <p>AIに仕事を奪われる？</p>
            <p>私は先に、AIを部下にしました。</p>
            <p className="v4-manifesto__invitation"><span>AI時代の学生へ贈る、</span><span>COMPASSからの招待状。</span></p>
          </div>
          <a className="v4-manifesto__cta" href="/messages/">
            <span>ストーリーを読む</span>
            <i aria-hidden="true">↗</i>
          </a>
        </div>

        <p className="v4-manifesto__folio" aria-hidden="true">
          <span>12 CHAPTERS</span>
          <span>ONE DECISION</span>
        </p>
      </div>
    </section>
  );
}
