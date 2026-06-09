# Guía de pruebas — Scopus + ORCID

WoS está pendiente de aprobación de Clarivate, así que esta guía cubre **Scopus** (con tu API key) y **ORCID** (no necesita key).

---

## 🚨 Paso único: configurar `.env` con tu Scopus API key

1. En la raíz del proyecto (al lado de `package.json`) creá el archivo `.env` copiando `.env.example`:

   ```bash
   cp .env.example .env
   ```

2. Abrí `.env` y pegá tu Scopus API key en la línea `SCOPUS_API_KEY=`:

   ```env
   SCOPUS_API_KEY=tu_key_aqui_sin_comillas
   ```

3. Dejá `WOS_API_KEY=` **vacío** (la WoS sigue pendiente). Los endpoints de WoS te van a dar 500 con mensaje claro hasta que la tengas.

4. **Opcional pero recomendado**: descargá el CSV de Scimago y guardalo como `data/scimago_journal_rank.csv`. Sin esto, las publicaciones se guardan pero con `quartile: null`.

   - Link: https://www.scimagojr.com/journalrank.php
   - Botón "Download data" arriba a la derecha

---

## ▶️ Arrancar el sistema

```bash
docker compose up -d        # PostgreSQL + MongoDB
npm install                 # por si hay cambios en package.json
npm run start:dev           # backend
```

En los logs deberías ver una de estas dos líneas (según si pusiste el CSV o no):

```
[Nest] LOG [SjrResolverService] SJR Resolver ready — 32847 ISSN entries indexed   ← CSV cargado OK
[Nest] WARN [SjrResolverService] Scimago CSV not found at /home/.../scimago...    ← sin CSV, sistema funciona pero sin cuartiles
```

Y al final:
```
[Nest] LOG [Bootstrap] API listening on http://localhost:3000
```

---

## ✅ Tests recomendados (en orden)

### Test 1 — ORCID por ID directo (no requiere nada)

Es el más simple, no toca la base de datos ni necesita keys. Sirve para confirmar que tu backend responde:

```bash
curl http://localhost:3000/scraper/orcid/by-id/0000-0002-1825-0097
```

Deberías ver JSON con publicaciones de Josiah Carberry (un investigador ficticio que ORCID usa de ejemplo). Si esto funciona, ORCID está OK.

### Test 2 — ORCID por nombre

```bash
curl "http://localhost:3000/scraper/orcid/academic?name=Patricio%20Ramirez"
```

Deberías ver el primer "Patricio Ramirez" que ORCID encuentre con sus publicaciones.

### Test 3 — Scopus: smoke test (validar tu API key sin tocar BD)

Esto es lo más importante de hacer apenas configures la key. **No necesita haber subido el Excel** — sirve para confirmar que la API key funciona.

```bash
curl http://localhost:3000/scopus-fetcher/test/57221263468
```

(`57221263468` es un Scopus Author ID de ejemplo; reemplazá por uno real de los del Excel)

**Si responde con `fetched: 0` o lista vacía**: la key funciona pero ese autor no tiene papers o el ID es incorrecto. Probá con otro.

**Si responde con error 503 "Could not reach the Scopus API"**: ver troubleshooting más abajo.

### Test 4 — Subir el Excel (si no lo hiciste)

```bash
curl -X POST http://localhost:3000/upload/excel \
  -F "file=@samples/Investigacion-EIC-act_Dic2025_sp-2.xlsx;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
```

Deberías ver `{ "researchersCreated": 10, "profilesCreated": 20, ... }`.

### Test 5 — Sincronizar UN solo investigador de Scopus

Primero obtené un profileId de Scopus:

```bash
curl http://localhost:3000/researchers
```

Buscá en la respuesta un `profile` con `"code": "SCOPUS"` y copiá su `id`.

Después:

```bash
curl -X POST http://localhost:3000/scopus-fetcher/sync/<PROFILE_ID>
```

Respuesta esperada:

```json
{
  "profileId": "...",
  "externalId": "57221263468",
  "fullName": "Patricio Ramirez",
  "fetched": 47,
  "stored": 47,
  "withQuartile": 41,    ← si tenés el CSV de Scimago
  "errors": []
}
```

### Test 6 — Ver las publicaciones guardadas

```bash
curl http://localhost:3000/publication-details
```

### Test 7 — Sincronizar TODOS los investigadores de Scopus

Cuando los tests 5 y 6 funcionen para un investigador, hacé el sync masivo:

```bash
curl -X POST http://localhost:3000/scopus-fetcher/sync
```

---

## 🔍 Troubleshooting

### Error 500: "SCOPUS_API_KEY is not configured"

- El `.env` no existe, o existe pero no tiene la línea `SCOPUS_API_KEY=...`
- Hiciste `npm run start:dev` antes de crear el `.env` → reiniciá el backend

### Error 503: "Could not reach the Scopus API"

Casi siempre es uno de estos:

1. **API key inválida**. Probala directamente sin pasar por tu backend:

   ```bash
   curl -H "X-ELS-APIKey: TU_KEY" \
     "https://api.elsevier.com/content/search/scopus?query=AU-ID(57221263468)&count=2"
   ```

   Si esto también falla, el problema es la key (o que la registraste fuera de la red UCN).

2. **Rate limit**. Si hiciste muchas llamadas en pocos segundos. Esperá 1 minuto y reintentá.

3. **Fuera de red institucional**. Las pruebas iniciales conviene hacerlas en UCN o por VPN.

### `withQuartile: 0` aunque hay publicaciones

El CSV de Scimago no está cargado o tiene formato distinto al esperado.
Revisá los logs al arrancar: tiene que decir `SJR Resolver ready — N entries indexed`.

Si dice `Scimago CSV not found`, bajalo del paso 4.

### "Profile X is not a SCOPUS profile"

Estás pasando un profileId que pertenece a un perfil WoS, no Scopus. Buscá otro en `/researchers` con `platform.code: "SCOPUS"`.

---

## 📡 Resumen de endpoints disponibles

| Método | Endpoint | Necesita Excel cargado? | Necesita API key? |
|--------|----------|-------------------------|-------------------|
| GET | `/scraper/orcid/by-id/:orcidId` | ❌ No | ❌ No |
| GET | `/scraper/orcid/academic?name=X` | ❌ No | ❌ No |
| GET | `/scopus-fetcher/test/:authorId` | ❌ No | ✅ SCOPUS_API_KEY |
| POST | `/scopus-fetcher/sync/:profileId` | ✅ Sí | ✅ SCOPUS_API_KEY |
| POST | `/scopus-fetcher/sync` | ✅ Sí | ✅ SCOPUS_API_KEY |
| GET | `/publication-details` | (luego del sync) | — |
| GET | `/publication-details/researcher/:id` | (luego del sync) | — |

Los endpoints de `/wos-fetcher/*` también existen pero darán error hasta que apruebe Clarivate y agregues `WOS_API_KEY` en `.env`.
