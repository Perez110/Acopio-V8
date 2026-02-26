import { getConfiguracion, submitConfiguracionForm } from '@/app/configuracion/actions';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionGeneralPage() {
  const config = await getConfiguracion();

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Ajustes Generales</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configuración global de marca: nombre de la empresa y logotipo.
        </p>
      </div>

      <div className="max-w-xl rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <form action={submitConfiguracionForm} className="space-y-6">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Nombre de la Empresa
            </label>
            <input
              type="text"
              name="nombre_empresa"
              defaultValue={config?.nombre_empresa ?? ''}
              placeholder="Ej: Acopio San Rafael"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              Este nombre se usará en el header de la app y en los PDFs.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Logo de la Empresa
            </label>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
                {config?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={config.logo_url}
                    alt={config.nombre_empresa ?? 'Logo empresa'}
                    className="h-14 w-14 rounded-lg object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400">Sin logo</span>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  name="logo"
                  accept="image/*"
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Formato recomendado: PNG o SVG con fondo transparente. Tamaño sugerido aprox. 200×200 px.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
            >
              Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

