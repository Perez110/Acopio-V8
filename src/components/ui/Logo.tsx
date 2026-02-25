import { useConfigEmpresa } from '@/components/ClientShell';

interface Props {
  /** En modo colapsado solo se muestra el ícono */
  collapsed?: boolean;
}

export default function Logo({ collapsed = false }: Props) {
  const config = useConfigEmpresa();
  const nombre = config?.nombre_empresa || 'Acopio';
  const logoUrl = config?.logo_url || null;

  const PRIMARY = '#0d5c4c';

  return (
    <div className="flex items-center gap-2.5">
      {/* Logo dinámico: imagen configurada o ícono por defecto */}
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={nombre}
            className="h-7 w-7 rounded-md object-contain"
          />
        ) : (
          <span className="text-xs font-bold text-emerald-700">AC</span>
        )}
      </div>

      {/* Wordmark: visible cuando el sidebar está expandido */}
      <div
        className={`overflow-hidden transition-all duration-300 ${
          collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100'
        }`}
      >
        <p
          className="whitespace-nowrap text-sm font-bold leading-tight"
          style={{ color: PRIMARY }}
        >
          {nombre}
        </p>
        <p className="whitespace-nowrap text-[10px] leading-tight text-slate-400">
          Sistema de gestión
        </p>
      </div>
    </div>
  );
}

