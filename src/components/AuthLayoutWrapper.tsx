'use client';

import { usePathname } from 'next/navigation';
import ClientShell from '@/components/ClientShell';
import type { ConfiguracionEmpresa } from '@/app/configuracion/actions';

interface Props {
  children: React.ReactNode;
  configEmpresa: ConfiguracionEmpresa | null;
}

export default function AuthLayoutWrapper({ children, configEmpresa }: Props) {
  const pathname = usePathname();
  if (pathname === '/login' || pathname === '/set-password') {
    return <>{children}</>;
  }
  return <ClientShell configEmpresa={configEmpresa}>{children}</ClientShell>;
}
