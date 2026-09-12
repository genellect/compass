import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL('https://compass-official.pages.dev'),
  title: 'COMPASS — 3D',
  description: 'COMPASSの施設を歩き、Interactive、Library、Communityへ。',
  alternates: { canonical: '/3d/' },
  icons: { icon: '/images/compass-mark.svg?v=20260713' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#101e24' };
export default function SpatialLayout({ children }: { children: ReactNode }) {
  return <html lang="ja"><body style={{ margin: 0, background: '#101e24' }}>{children}</body></html>;
}
