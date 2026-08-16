# Ancla

App personal para consultar y editar el plan de alimentación y la rutina de gym desde el teléfono. Vite + React + Cloudflare Workers (KV, Workers AI).

## Arranque local

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Abre la URL que imprima Vite. En el teléfono, usa la IP de la red local.

Cambia `APP_PASSWORD` y `SESSION_SECRET` en `.dev.vars`. No subas ese archivo.

## Sin internet

1. Entra una vez con conexión.
2. En el iPhone: Compartir → **Añadir a pantalla de inicio**.
3. La app guarda el plan en el teléfono. Si no hay red, muestra esa copia.

Guardar cambios sí necesita internet. Al salir se borra la copia local.

## Producción

1. `npx wrangler kv namespace create PLAN_KV` y pega el `id` en `wrangler.jsonc`.
2. `npx wrangler secret put APP_PASSWORD`
3. `npx wrangler secret put SESSION_SECRET`
4. `npm run deploy`
