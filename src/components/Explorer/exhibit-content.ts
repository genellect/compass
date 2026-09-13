import type { SectionId } from '../Habitat/scene-config';

/** Selected, verbatim production copy. The full articles and disclosure states
 * stay on the normal website. A contract test compares these with source copy. */
export const exhibits: Record<SectionId, { label: string; title: string; body: string; href: string; cta: string }> = {
  top: { label: 'COMPASS', title: 'Don’t Just Learn. Build What’s Next.', body: '北里大学薬学部から、学び・研究・未来をつなぐ。', href: '/#top', cta: 'COMPASS' },
  vision: { label: 'Vision', title: '学びを、意思決定の力へ。', body: 'COMPASSは、学生が学びを自らの選択と挑戦に変えられる、新しい教育体験を目指しています。', href: '/#vision', cta: 'Vision' },
  experience: { label: 'Experience', title: '次の1歩は、ここから始まる。', body: 'COMPASSは、WebシステムとAIを基盤に、資料、ワークショップ、共創の機会を一つにつなぎます。学生の「知りたい」「やってみたい」を、次の行動へ届けます。', href: '/#experience', cta: 'COMPASS Experience' },
  technology: { label: 'Interactive', title: 'LET EVERYTHING MOVE.', body: 'あなたが飲み込んだその疑問を、誰かも同じように抱えているかもしれない。', href: '/INTRO_Interactive/', cta: '未来の講義を、いま体験。' },
  resources: { label: 'Library', title: '知らなかった未来に、出会う。', body: '未来戦略ライブラリは、学生生活の「次に知りたい」を、一つの場所につなぎます。', href: '/future-strategy-library/', cta: 'まだ知らない世界を見る' },
  manifesto: { label: 'Manifesto', title: '観客席から見ているには、この時代は面白すぎる。', body: 'AI時代の学生へ贈る、COMPASSからの招待状。', href: '/messages/', cta: 'ストーリーを読む' },
  community: { label: 'Community', title: '面白い大学生活は、待っていても始まらない。', body: 'COMPASSは、白金キャンパスを拠点に、学生の「やってみたい」を、仲間と形にするコミュニティです。', href: '/community/join/', cta: 'コミュニティに参加する' },
  founder: { label: 'Founder', title: '面白そうなので、始めました。', body: '思いついたら、まずつくる。分野が違えば、つないでみる。一人で足りなければ、人を巻き込む。', href: 'https://yuto-matsui.com/', cta: 'Web Portfolio' },
  contact: { label: 'Contact', title: 'ご意見・ご質問を歓迎しています。', body: '学生の方も、教員・教育関係者の方も、所属を問わずお問い合わせいただけます。活動や資料についてのご質問、ご意見、ご相談、連携のご提案まで、お気軽にお寄せください。', href: '/contact/', cta: 'お問い合わせフォームを開く' },
};
