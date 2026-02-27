import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import AuthLayoutWrapper from '@/components/AuthLayoutWrapper';
import { getConfiguracion } from '@/app/configuracion/actions';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Sistema Acopio',
  description: 'Sistema de gestión integral para acopio de fruta',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await getConfiguracion();

  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthLayoutWrapper configEmpresa={config}>{children}</AuthLayoutWrapper>
      </body>
    </html>
  );
}

