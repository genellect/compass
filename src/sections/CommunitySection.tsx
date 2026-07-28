import { Disclosure } from "../components/Disclosure";

export function CommunitySection() {
  return (
    <>
<section id="community" className="section community-section" aria-labelledby="community-title">
      <div className="container community-panel">
        <div className="section-heading" data-reveal>
          <p className="section-label">Community / コミュニティ</p>
          <h2 id="community-title">共に学び、共に成長する。</h2>
          <p>
  COMPASSでは、学年や研究室を越えて、学びたい人が気軽につながれるコミュニティを、これから少しずつ形にしていきたいと考えています。
  研究や進路、日々の学びについて語り合える場をつくり、新しい出会いや成長のきっかけを育てていくことを目指します。
</p>
        </div>

        <div id="activities" className="community-activity-grid" data-reveal>
          <article className="community-activity-card">
            <span>Connect &amp; Gather</span>
            <h3>交流イベント</h3>
            <p>
              交流会や食事会、ときには探究活動なども楽しみながら、学年や学部、研究室を越えたつながりを広げます。参加は自由。それぞれのペースで、気軽に交流できるコミュニティを目指しています。
            </p>
          </article>

          <article className="community-activity-card">
            <span>Skill Workshops</span>
            <h3>ワークショップ</h3>
            <p>実践的な学びを通して、新しい知識やスキルを身につけます。</p>
            <Disclosure id="community-workshop-topics" className="community-list-disclosure" label="今後扱っていきたいテーマ" preserveMobileContent>
            <div className="community-list-block">
              <p>今後扱っていきたいテーマ</p>
              <ul>
                <li>英語学習・資格試験対策</li>
                <li>AI活用・生成AIリテラシー</li>
                <li>生命科学・研究入門</li>
                <li>プレゼンテーション・伝える力</li>
                <li>対話力・ファシリテーション</li>
                <li>プログラミング（JavaScript / Python）</li>
                <li>Webデザイン（HTML / CSS）</li>
              </ul>
            </div>
            </Disclosure>
          </article>
           <article className="community-activity-card">
        <span>Build COMPASS</span>
        <h3>COMPASS運営</h3>
        <p>
          COMPASSの活動は、まだ発展途上です。
          教育活動、イベント、情報発信、資料制作などを、これから一緒に形にしてくださる運営メンバーを募集しています。
        </p>
        <Disclosure id="community-operations-topics" className="community-list-disclosure" label="今後取り組んでいきたい活動" preserveMobileContent>
        <div className="community-list-block">
          <p>今後取り組んでいきたい活動</p>
          <ul>
            <li>教育イベント・ワークショップ企画</li>
            <li>SNS発信・広報活動</li>
            <li>教材・学習資料の制作</li>
            <li>Web・ソフトウェア開発</li>
            <li>システム設計・データ分析</li>
            <li>デザイン・動画制作</li>
            <li>教員・協力者との連携・調整</li>
            <li>プロジェクトの立案・運営</li>
          </ul>
        </div>
        </Disclosure>
      </article>
        </div>

        <div className="community-invitation" data-reveal>
          <p className="community-invitation-lead">COMPASSは、自由参加型のコミュニティです。</p>
          <p>
  白金キャンパスを主な拠点に、学生同士が気軽につながり、学び合えるコミュニティを目指しています。
  まだ始まったばかりだからこそ、一緒にアイデアを出し合いながら、このコミュニティを育てていける仲間を募集しています。
  参加頻度や関わり方に決まりはありません。経験や特別なスキルも必要ありません。
  「ちょっと参加してみたい」「誰かと話してみたい」という気持ちがあれば、それだけで十分です。
</p>
          <Disclosure id="community-member-details" className="community-details" label="運営メンバーの募集について">
            <div className="community-details-body">
              <p>
                COMPASSは、まだ立ち上げ段階にある学生コミュニティです。
                資料提供、交流イベント、ワークショップなどを通して、学生にとって本当に役立つ活動を少しずつ形にしていく仲間を募集しています。
              </p>
              <p>
                関わり方に決まった形はありません。まずはイベントに参加する、興味のある企画に少し協力する、継続的に運営に関わるなど、それぞれのペースで無理なく参加できます。
              </p>
              <p>
                経験や特別なスキルは必要ありません。英語、AI、生命科学、研究、進路選択、教育活動などに関心がある方の参加を歓迎します。
              </p>
              <p>
                なお、運営メンバーの活動は現在、学生主体のボランティアとして行っています。将来的に活動規模や運営体制が発展した場合には、必要に応じて謝礼等を検討する可能性があります。
              </p>
            </div>
          </Disclosure>

          <a className="button button-primary community-join-button" href="/community/join/">
            コミュニティに参加する
          </a>
        </div>
      </div>
    </section>
    </>
  );
}
