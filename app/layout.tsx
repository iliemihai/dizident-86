import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dizident 86',
  description: 'An audio-first pixel game set in Bucharest, winter 1987.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
