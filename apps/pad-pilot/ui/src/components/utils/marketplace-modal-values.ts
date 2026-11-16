
export const formatPrice = (priceCents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    currency: currency.toUpperCase(),
    style: "currency",
  }).format(priceCents / 100);
export const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : "Not published");
export const formatFileSize = (value: number | null) => (value == null ? "Unavailable" : `${(value / 1024).toFixed(1)} KB`);
