# Research Publications Backend

Backend en **NestJS + TypeScript** para gestionar investigadores y sus publicaciones por año, con **doble base de datos** (PostgreSQL + MongoDB).

## ¿Qué hace este avance?

1. Recibe un archivo Excel con la estructura `NOMBRE | WOS_ID | publicaciones por año WOS | TOTAL | SCOPUS_ID | publicaciones por año SCOPUS | TOTAL`.
2. Lo parsea, normaliza y persiste en **PostgreSQL** separado en tablas (`researchers`, `platforms`, `researcher_profiles`, `publications`).
3. Guarda un registro de auditoría con las filas crudas en **MongoDB** (colección `import_records`).
4. Expone endpoints REST listos para consumir desde el frontend, incluyendo agregaciones para gráficos.

## Arquitectura

```
src/
├── main.ts                          ← bootstrap (CORS, ValidationPipe, filtro global)
├── app.module.ts                    ← raíz: ConfigModule + Postgres + Mongo + features
├── config/
│   ├── postgres.config.ts           ← factory TypeORM (PostgreSQL)
│   └── mongo.config.ts              ← factory Mongoose (MongoDB)
├── common/
│   └── filters/all-exceptions.filter.ts
└── modules/
    ├── researchers/                 ← persona (firstName, lastName)
    ├── platforms/                   ← catálogo (WOS, SCOPUS, …)
    ├── researcher-profiles/         ← researcher × platform + externalId
    ├── publications/                ← contador por (profile, year)
    ├── imports/                     ← MongoDB: auditoría de importaciones
    ├── excel/                       ← parser + orquestador
    ├── upload/                      ← endpoint multipart
    └── statistics/                  ← agregaciones para gráficos
```

Cada módulo respeta **responsabilidad única**: el `ExcelService` no toca repositorios; los servicios de dominio no saben de Excel; el de estadísticas sólo hace SELECTs.

## Modelo de datos (PostgreSQL)

| Tabla                  | Campos clave                                         |
| ---------------------- | ---------------------------------------------------- |
| `researchers`          | `id`, `firstName`, `lastName`                        |
| `platforms`            | `id`, `code` (WOS, SCOPUS), `name`                   |
| `researcher_profiles`  | `id`, `researcherId`, `platformId`, `externalId` (única por par) |
| `publications`         | `id`, `profileId`, `year`, `count` (única por par)   |

La unicidad `(profile, year)` hace que las importaciones sean **idempotentes**: subir el mismo Excel dos veces no duplica datos, sólo actualiza los contadores.

## Modelo de datos (MongoDB)

Colección `import_records`:
- `originalFileName`, `sheetName`
- `rawRows` — todas las filas tal como vinieron del Excel
- `summary` — contadores de creados/actualizados
- `status` — `success` | `partial` | `failed`
- `errorMessages` — errores por fila

## Endpoints

| Método | Ruta                                       | Descripción                                              |
| ------ | ------------------------------------------ | -------------------------------------------------------- |
| POST   | `/upload/excel`                            | Sube el Excel (`multipart/form-data`, campo `file`).     |
| GET    | `/researchers`                             | Lista investigadores con perfiles y publicaciones.       |
| GET    | `/researchers/:id`                         | Detalle de un investigador.                              |
| POST   | `/researchers`                             | Crea un investigador manualmente.                        |
| GET    | `/platforms`                               | Catálogo de plataformas.                                 |
| POST   | `/researcher-profiles`                     | Adjunta un perfil de plataforma a un investigador.       |
| GET    | `/researcher-profiles`                     | Lista todos los perfiles.                                |
| GET    | `/imports`                                 | Auditoría de importaciones recientes.                    |
| GET    | `/imports/:id`                             | Detalle de una importación.                              |
| GET    | `/statistics/yearly-per-researcher`        | Para gráfico: publicaciones por año por investigador.    |
| GET    | `/statistics/researcher-series`            | Para gráfico: una curva por plataforma + TOTAL.          |
| GET    | `/statistics/global-yearly`                | Para gráfico: totales globales por año.                  |

## Cómo correrlo

```bash
# 1. instalar dependencias
npm install

# 2. configurar variables de entorno
cp .env.example .env

# 3. levantar PostgreSQL y MongoDB (locales o por docker)
# 4. ejecutar
npm run start:dev
```

## Cómo importar el Excel

```bash
curl -X POST http://localhost:3000/upload/excel \
  -F "file=@InvestigacionEICact_Dic2025_sp.xlsx"
```

Respuesta:
```json
{
  "importId": "65f...",
  "summary": {
    "researchersCreated": 10,
    "researchersUpdated": 0,
    "profilesCreated": 20,
    "publicationsUpserted": 120
  },
  "errors": []
}
```

## Próximos pasos sugeridos

- Agregar autenticación (JWT / guards) — la base ya está lista con NestJS.
- Migraciones TypeORM en lugar de `synchronize`.
- Tests unitarios sobre `ExcelService.parseSheet()` (es función pura, fácil de testear con buffers fixture).
- Endpoint para exportar de vuelta a Excel (puedes usar la skill `xlsx` desde el frontend o duplicar el patrón con `exceljs`).
