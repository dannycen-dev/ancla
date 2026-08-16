type SyncBannerProps = {
  fromCache: boolean;
  pending: boolean;
};

export function SyncBanner({ fromCache, pending }: SyncBannerProps) {
  if (pending) {
    return <p className="banner">Hay cambios en este teléfono. Se suben solos al volver la red.</p>;
  }
  if (fromCache) {
    return <p className="banner">Sin conexión. Mostrando la última versión guardada en este teléfono.</p>;
  }
  return null;
}
