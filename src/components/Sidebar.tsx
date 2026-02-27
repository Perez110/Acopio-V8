'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import {
  Leaf,
  BarChart2,
  Package,
  Users,
  ArrowRightLeft,
  Landmark,
  Database,
  Tag,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  FileBarChart,
  ScrollText,
  Truck,
  TrendingDown,
  FileText,
  LayoutDashboard,
  Settings,
} from 'lucide-react';
import Logo from '@/components/ui/Logo';

// ── Estructura de navegación agrupada ────────────────────────────────────────
const GROUPS = [
  {
    id: 'general',
    label: 'General',
    items: [
      { href: '/', label: 'Panel Principal', icon: LayoutDashboard },
    ],
  },
  {
    id: 'logistica',
    label: 'Logística',
    items: [
      { href: '/movimiento', label: 'Movimiento de Fruta', icon: Leaf },
      { href: '/inventario', label: 'Inventario', icon: BarChart2 },
      { href: '/envases', label: 'Envases / Bines', icon: Package },
    ],
  },
  {
    id: 'tesoreria',
    label: 'Tesorería',
    items: [
      { href: '/cuentas-corrientes', label: 'Cuentas Corrientes', icon: Users },
      { href: '/cobros-pagos', label: 'Cobros y Pagos', icon: ArrowRightLeft },
      { href: '/cheques', label: 'Cartera de Cheques', icon: FileText },
      { href: '/cajas-bancos', label: 'Cajas y Bancos', icon: Landmark },
      { href: '/fleteros', label: 'Liquidación Fleteros', icon: Truck },
    ],
  },
  {
    id: 'analisis',
    label: 'Análisis',
    items: [
      { href: '/informes', label: 'Informes', icon: FileBarChart },
      { href: '/perdidas', label: 'Análisis de Pérdidas', icon: TrendingDown },
      { href: '/historial', label: 'Historial', icon: ScrollText },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    items: [
      { href: '/maestros', label: 'Maestros', icon: Database },
      { href: '/productos-precios', label: 'Productos y Precios', icon: Tag },
      { href: '/configuracion/general', label: 'Ajustes Generales', icon: Settings },
    ],
  },
] as const;

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }

  return (
    <aside
      className={`relative flex h-screen flex-col border-r border-slate-100 bg-white shadow-sm transition-all duration-300 ease-in-out ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* ── Cabecera: Logo + botón colapsar ───────────────────────────────── */}
      <div
        className={`flex h-14 flex-shrink-0 items-center border-b border-slate-100 ${
          collapsed ? 'justify-center px-3' : 'justify-between px-4'
        }`}
      >
        <Logo collapsed={collapsed} />

        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className={`rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 ${
            collapsed
              ? 'absolute -right-3.5 top-4 z-10 border border-slate-200 bg-white shadow-sm'
              : 'ml-1'
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* ── Navegación ────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2">
        {GROUPS.map((group, gi) => (
          <div key={group.id} className={gi > 0 ? 'mt-3' : ''}>
            {/* Encabezado del grupo */}
            <div
              className={`overflow-hidden transition-all duration-300 ${
                collapsed ? 'max-h-0 opacity-0' : 'max-h-8 opacity-100'
              }`}
            >
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {group.label}
              </p>
            </div>

            {/* Separador en modo colapsado */}
            {collapsed && gi > 0 && (
              <div className="mx-3 mb-2 h-px bg-slate-100" />
            )}

            <ul>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={collapsed ? label : undefined}
                      className={`group relative flex items-center transition-all duration-150 ${
                        collapsed ? 'justify-center px-3 py-2.5' : 'gap-3 py-2 pl-3 pr-3'
                      } ${
                        active
                          ? 'border-l-2 border-[#0d5c4c] bg-[#ecfdf5] text-[#0d5c4c]'
                          : 'border-l-2 border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 flex-shrink-0 transition-colors ${
                          active
                            ? 'text-[#0d5c4c]'
                            : 'text-slate-400 group-hover:text-slate-500'
                        }`}
                      />

                      {/* Label — oculto al colapsar */}
                      <span
                        className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-300 ${
                          collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100'
                        }`}
                      >
                        {label}
                      </span>

                      {/* Indicador activo en modo colapsado */}
                      {active && collapsed && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#0d5c4c]" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Pie: versión / logout ──────────────────────────────────────────── */}
      <div
        className={`flex-shrink-0 border-t border-slate-100 ${
          collapsed ? 'flex justify-center px-3 py-3' : 'px-4 py-3'
        }`}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={handleLogout}
            title="Cerrar Sesión"
            className="rounded-lg p-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <LogOut className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Sistema Acopio v1.0</p>
            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar Sesión"
              className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
