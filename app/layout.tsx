import './globals.css';
import type { Metadata } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'] });
const sans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = { title: 'Hiring Dashboard', description: 'AI-assisted PM / SPM candidate screening' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
