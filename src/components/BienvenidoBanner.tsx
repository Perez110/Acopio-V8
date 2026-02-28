'use client';

import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';

interface Props {
  show: boolean;
}

export default function BienvenidoBanner({ show }: Props) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const t = setTimeout(() => {
      window.history.replaceState(null, '', window.location.pathname);
      setVisible(false);
    }, 5000);
    return () => clearTimeout(t);
  }, [show]);

  if (!visible) return null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
      <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
      <p className="font-medium">Bienvenido. Tu contraseña fue configurada correctamente.</p>
    </div>
  );
}
