# Quickstart: Rol de Administrador y Panel de Métricas de la Plataforma

**Feature**: `11-admin-panel` | **Plan**: [plan.md](./plan.md) | **Contrato**:
[contracts/admin.openapi.yaml](./contracts/admin.openapi.yaml) | **Modelo**:
[data-model.md](./data-model.md)

Guía de validación de punta a punta. No contiene implementación.

## Prerrequisitos

PostgreSQL y Redis levantados, y las migraciones al día:

```bash
cd back && npx mikro-orm migration:up
```

Definir en `back/.env`, que no se versiona, `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` (mínimo 8
caracteres) y, si se quiere, `ADMIN_SEED_USERNAME`.

## Tests automatizados

```bash
cd back
npm run test:e2e -- admin credits
npm test -- admin-period
npm run lint

cd ../front
npm test
npm run build
npm run lint
```

## Escenarios manuales

| # | Acción | Esperado |
|---|---|---|
| M1 | `npm run seed:admin` en `back/` | Informa que creó la cuenta; no muestra la contraseña. |
| M2 | Repetir M1 | Informa que no hubo cambios. |
| M3 | Correrlo sin credenciales | Falla con un mensaje claro y no crea nada. |
| M4 | Reiniciar el backend y consultar el saldo del administrador | Sigue en 0. |
| M5 | Registrar una cuenta en la web | Queda como usuario común; no ve el acceso al panel. |
| M6 | Iniciar sesión como administrador | Ve «Admin» en el encabezado y entra a `/admin`. |
| M7 | Abrir `/admin` con una cuenta común | Vuelve a la home. |
| M8 | Pedir `GET /admin/metrics` sin sesión, con sesión común y solo con `x-api-key` | 401, 403 y 401, sin métricas. |
| M9 | Elegir «7 días», «Todo» y un rango | Cambian las métricas de período; las de estado y las conciliaciones no. |
| M10 | Elegir un rango invertido | Mensaje claro, sin pedido al servidor. |
| M11 | Apretar «Actualizar» tras una venta | La venta aparece y cambia la hora del cálculo. |
| M12 | Quitar el rol en la base y recargar `/admin` | El pedido devuelve 403. |
| M13 | Ver el panel en un ancho de teléfono | Sin desplazamiento horizontal de la página. |
