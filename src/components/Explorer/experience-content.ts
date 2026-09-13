import { materials } from '../../app/(official)/future-strategy-library/content';
import { heroLectureMock } from '../../interactive/content/interactiveContent';

// Data only: no independent site's component, stylesheet or application is imported.
export const libraryItems = materials;
export const questionExamples = heroLectureMock.questions;
export const chapterIds = ['between-science-and-development', 'humans-make-the-bet', 'skills-for-the-future'] as const;
export const founderStory = [
  { label: 'From a tool to COMPASS', text: 'この考えを最初に形にしたのが、現在のCOMPASS Platformにつながる開発です。当初は、学生向け資料を共有するGoogle Driveの招待や名簿管理を自動化する小さな仕組みでした。その後、学生支援団体COMPASSの設立、大学講義支援システムCOMPASS Interactiveの開発へと対象を広げてきました。' },
  { label: 'The interface', text: '私が目指しているのは、研究者として生命科学の課題を理解し、エンジニアとして、その解決を支えるシステムを実装することです。一人の研究成果だけでなく、多くの研究者の生産性や研究体験を改善することで、より大きなスケールで生命科学に貢献することを目指しています。' },
  { label: 'Future', text: '生命科学研究、ソフトウェア開発、大学教育、英語学習。扱う領域は異なりますが、根底にある考え方は共通しています。', closing: '人が持つ能力や知識を、より大きな成果につなげる仕組みをつくること。' },
] as const;

export const activityItems = [
  { label: '学びを動かす', name: 'Technology', title: '学びの壁を、仕組みで越える。', text: 'WebシステムとAIを活用し、学生の疑問や反応が届き、次の学びにつながる体験をつくります。', room: 'technology' },
  { label: '未来を知る', name: 'Resources', title: '知らなかった未来に、出会う。', text: '英語、AI、研究室選び、大学院進学、キャリア形成まで、未来を考えるための知識と戦略を届けます。', room: 'resources' },
  { label: '実際に試す', name: 'Workshops', title: 'やってみたいを、最初の一歩へ。', text: '英語、AIリテラシー、生命科学を中心に、講義、講演、ワークショップを企画・実施します。', room: 'community' },
  { label: '一緒につくる', name: 'Community', title: 'ひとりでは見えない、新しい場所へ。', text: '白金キャンパスを主な拠点に、学生同士が気軽につながり、新しい学びや挑戦を一緒に形にするコミュニティです。', room: 'community' },
] as const;

export const communityCopy = {
  introduction: 'ふと思いついた企画を、休み時間に誰かと話してみる。\nアイデアを出し合い、デザインや映像をつくり、実際のイベントやサービスとして学生に届ける。',
  paragraphs: [
    '教育イベントやワークショップの企画・運営、SNSでの情報発信、教材や資料の制作、広報、デザイン、写真・動画制作、Webシステム開発。\n興味のある活動に加わることも、自分のアイデアから新しい企画を始めることもできます。',
    '完全な初心者からでも大丈夫です。\n投稿やイベントのアイデアを考えるところから始めて、デザイン、動画制作、Web開発まで、興味に合わせて一から挑戦できます。',
    '最初は「少し面白そう」だけでも、やがて本格的な映像や、実際に学生が使うWebサービスまでつくれるようになる。\n仲間と楽しみながら、自分でも驚くような作品や経験を増やしていけます。',
    '一人では思いつかなかったことが、会話の中で生まれる。\n一人では形にできなかったことが、仲間となら形になる。',
    '大学生活に、予定されていなかった挑戦と出会いを。',
  ],
};
