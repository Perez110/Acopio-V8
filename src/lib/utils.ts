const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return currencyFormatter.format(value);
}

export function formatNumber(num: number | null | undefined): string {
  const value = Number(num ?? 0);
  return numberFormatter.format(value);
}

