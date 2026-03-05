import { Syne, JetBrains_Mono } from 'next/font/google';
import '../styles/globals.css';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata = {
  title: 'Discord Channel Exporter',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
