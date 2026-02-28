import { getConfiguracionParaLogin } from '@/app/configuracion/actions';
import SetPasswordForm from './SetPasswordForm';

const NOMBRE_SISTEMA_FALLBACK = 'Sistema de Gestión';

export const dynamic = 'force-dynamic';

export default async function SetPasswordPage() {
  const config = await getConfiguracionParaLogin();
  const nombreSistema = (config?.nombre_empresa?.trim()) || NOMBRE_SISTEMA_FALLBACK;
  const logoUrl = config?.logo_url?.trim() || null;

  return (
    <SetPasswordForm nombreSistema={nombreSistema} logoUrl={logoUrl} />
  );
}
