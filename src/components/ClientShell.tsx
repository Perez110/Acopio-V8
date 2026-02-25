'use client';

import { createContext, useContext, useState } from 'react';
import type { ConfiguracionEmpresa } from '@/app/configuracion/actions';
import Sidebar from './Sidebar';

const ConfigEmpresaContext = createContext<ConfiguracionEmpresa | null>(null);

export function useConfigEmpresa() {
  return useContext(ConfigEmpresaContext);
}

interface Props {
  children: React.ReactNode;
  configEmpresa: ConfiguracionEmpresa | null;
}

export default function ClientShell({ children, configEmpresa }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ConfigEmpresaContext.Provider value={configEmpresa}>
      <div className="flex h-screen overflow-hidden bg-slate-100">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </ConfigEmpresaContext.Provider>
  );
}

