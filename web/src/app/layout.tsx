import type { Metadata } from 'next';
import { AppNav } from '@/components/nav/AppNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'TokoBoss',
  description: 'Inventory-first ERP for Indonesian MSMEs',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>
        {children}
        <AppNav />
      </body>
    </html>
  );
}
