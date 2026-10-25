/**
 * Desktop habitat stop between Resources and Community, formerly the Manifesto.
 * The `#manifesto` anchor is kept because the habitat tour measures it to place the
 * authored camera stop; the room it frames now invites visitors into /3d/.
 * Mobile has no walkable scene, so mobile-habitat.module.css hides this section.
 */
export function PlatformEntrySection() {
  return (
    <section
      id="manifesto"
      className="section v4-manifesto v4-platform-entry"
      aria-labelledby="platform-entry-title"
    >
      <div className="container v4-manifesto__frame" data-reveal>
        <div className="v4-manifesto__copy">
          <p className="v4-manifesto__label">COMPASS PLATFORM</p>
          <h2 id="platform-entry-title">この空間を、歩いてみる。</h2>
          <div className="v4-manifesto__declaration">
            <p>スクロールで巡ってきた部屋を、自分のペースで歩けます。</p>
          </div>
          <a className="v4-manifesto__cta" href="/3d/">
            <span>3D空間に入る</span>
            <i aria-hidden="true">→</i>
          </a>
        </div>
      </div>
    </section>
  );
}
