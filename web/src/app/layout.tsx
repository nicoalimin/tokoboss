import type { Metadata } from 'next';
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
      <body>{children}</body>
    </html>
  );
}
