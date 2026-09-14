import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'AsistentePro | Asistente IA Omnicanal para Clínicas y Consultorios en México',
  description: 'Recepcionista con Inteligencia Artificial que contesta llamadas telefónicas en México (+52) y mensajes en WhatsApp, Instagram y Messenger 24/7.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={plusJakartaSans.variable}>
      <body className="font-sans antialiased min-h-screen bg-slate-50 text-slate-900 selection:bg-teal-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
