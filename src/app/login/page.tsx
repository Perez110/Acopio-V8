import { getConfiguracionParaLogin } from '@/app/configuracion/actions';
import LoginForm from './LoginForm';

const NOMBRE_SISTEMA_FALLBACK = 'Sistema de Gestión';

// Siempre obtener nombre/logo actualizados (no cachear esta página)
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const config = await getConfiguracionParaLogin();
  const nombreSistema =
    (config?.nombre_empresa?.trim()) || NOMBRE_SISTEMA_FALLBACK;
  const logoUrl = config?.logo_url?.trim() || null;

  return (
    <LoginForm nombreSistema={nombreSistema} logoUrl={logoUrl} />
  );
}
