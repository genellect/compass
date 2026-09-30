import styles from "./security-access.module.css";

export function SecurityAccessModel() {
  return <figure className={styles.identityModel} aria-label="学生・教員・管理者のアクセス経路">

<div className={styles.identityRoutes}>
<div className={styles.routeColumnLabels} aria-hidden="true"><span>利用者</span><span>認証</span><span>認可</span><span>操作範囲</span></div>
<div className={`${styles.identityLane}`}>
<div className={styles.identityActor}><strong>学生</strong><span>匿名参加</span></div>
<div className={styles.identityLogin}><span className={styles.mobileRouteLabel}>認証</span><strong>Anonymous Auth</strong><small>QR・講義コードから参加</small></div>
<div className={styles.identityPolicy}><span className={styles.mobileRouteLabel}>認可</span><strong>RLS / RPC</strong><small>講義への参加関係<br />投稿・回答の所有権</small></div>
<div className={styles.identityScope}><span className={styles.mobileRouteLabel}>操作範囲</span><strong>参加講義</strong><small>公開内容の閲覧<br />自分の投稿・回答</small></div>
</div>
<div className={styles.staffLanes}>
<div className={`${styles.identityActor} ${styles.instructorActor}`}><strong>教員</strong><code>instructor</code></div>
<div className={`${styles.identityLogin} ${styles.staffLogin}`}><span className={styles.staffSharedLabel}>教員・管理者の認証</span><strong>Google OAuth＋TOTP</strong><small>二段階認証（2FA）</small><span className={styles.sessionBinding}>Google ID・環境への所属を照合し、<br />管理セッションを発行</span></div>
<div className={`${styles.identityPolicy} ${styles.instructorPolicy}`}><span className={styles.mobileRouteLabel}>教員の認可</span><strong>Edge Functions → DB</strong><small>instructorロール<br />講義所有権</small></div>
<div className={`${styles.identityScope} ${styles.instructorScope}`}><span className={styles.mobileRouteLabel}>操作範囲</span><strong>自分の講義</strong><small>講義操作・資料管理<br />許可されたAIの実行</small></div>
<div className={`${styles.identityActor} ${styles.ownerActor}`}><strong>管理者</strong><code>owner</code></div>
<div className={`${styles.identityPolicy} ${styles.ownerPolicy}`}><span className={styles.mobileRouteLabel}>管理者の認可</span><strong>Edge Functions → DB</strong><small>ownerロール<br />操作別ポリシー</small></div>
<div className={`${styles.identityScope} ${styles.ownerScope}`}><span className={styles.mobileRouteLabel}>操作範囲</span><strong>自分の講義・運用管理</strong><small>教員・権限・AI利用条件<br />セッション失効・緊急停止</small></div>
</div>
</div>
<div className={styles.identityBoundary}><strong>認証情報の独立</strong><span>学生用と教員・管理者用の認証クライアント・保存領域は独立している。</span></div>
</figure>;
}
