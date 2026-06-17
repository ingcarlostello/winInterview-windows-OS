# Plan de Implementación: Sistema de Tiers (Lite / Pro / Ultra)

## Contexto

La aplicación necesita un sistema de feature gating y quotas para monetizar por tiers. El backend es la autoridad absoluta; Zustand es caché de UI; Rust actúa como guardián de atajos del SO. Por ahora usaremos un `PlanRepository` in-memory (DB real en fase posterior). No hay auth implementada; el `plan_id` se pasa como query param.

## Respuestas resueltas

- **Cuota excedida**: Permitir terminar la respuesta actual del LLM y luego bloquear con mensaje de upgrade
- **Modo invisible**: `contentProtected` toggle (Ctrl+Shift+B) = Ultra only. **Modo fantasma**: `ghostMode` click-through (Ctrl+Shift+G) = Ultra only
- **Reset de cuotas**: Mes calendario
- **Capturas**: Se cuentan cada vez que el usuario presiona el botón o Ctrl+Shift+C. Lite: 2/mes, Pro: 8/mes, Ultra: 40/mes. Análisis igual.
- **Feature "simultaneous_captures"**: Lite = 1 imagen en grid, Pro/Ultra = hasta 4 imágenes en grid
- **Tracking**: PlanGate in-memory por conexión (sin DB por ahora)
- **Tests**: No incluir setup de testing, solo la lógica

---

## Capa 1: Definición Canónica de Planes (Backend)

### [NEW] `backend/src/backend/tiers.py`

Módulo de constantes con enums y dataclasses:

- `PlanId(StrEnum)`: `LITE`, `PRO`, `ULTRA`
- `Feature(StrEnum)`: `CUSTOM_PROMPTS`, `SIMULTANEOUS_CAPTURES`, `SIMULTANEOUS_ANALYSIS`, `KEYBOARD_SHORTCUTS`, `INVISIBLE_MODE`, `GHOST_MODE`
- `Quota(StrEnum)`: `TRANSCRIPTION_SECONDS`, `SCREEN_CAPTURES`, `SCREEN_ANALYSES`
- `PlanDefinition` (frozen dataclass): `id`, `name`, `price_usd`, `features: frozenset[Feature]`, `quotas: dict[Quota, int]`
- `PLANS` dict con las 3 definiciones según tabla TIERS.md
- Funciones puras: `get_plan()`, `has_feature()`, `get_quota_limit()`

**Decisiones**: `frozenset` para O(1) lookups, `StrEnum` para serialización JSON directa, `dataclass(frozen=True)` para inmutabilidad.

---

## Capa 2: Gating y Quotas en Backend (FastAPI)

### [NEW] `backend/src/backend/plan_gate.py`

Clase `PlanGate` con excepciones custom:

- `FeatureBlockedError(feature, plan_id)` - el plan no incluye la feature
- `QuotaExceededError(quota, plan_id, used, limit)` - cuota excedida
- `PlanGate.__init__(plan_id, usage=None)` - usage tracking in-memory
- `require_feature(feature)` - lanza `FeatureBlockedError` si no disponible
- `can_use_feature(feature)` - bool sin excepción
- `consume_quota(quota, amount=1)` - incrementa uso, lanza `QuotaExceededError` si excede, retorna remaining
- `get_remaining(quota)` - remaining sin modificar
- `get_usage_summary()` - dict con used/limit/remaining por quota
- `get_plan_info()` - dict completo para enviar al frontend (plan_id, plan_name, features, quotas)

### [MODIFY] `backend/src/backend/ws/message_types.py`

Agregar:
- `WsMessageType`: `PLAN_INFO = "plan_info"`, `QUOTA_UPDATE = "quota_update"`
- `WsStatus`: `QUOTA_EXCEEDED = "quota_exceeded"`, `FEATURE_BLOCKED = "feature_blocked"`

### [MODIFY] `backend/src/backend/ws/session.py`

Integrar `PlanGate` en `AgentSession` y `DialogCoordinator`:

**AgentSession**:
- `__init__` recibe `plan_gate: PlanGate` como parámetro
- `start()`: después de CONNECTED, envía `plan_info` vía `WsMessageType.PLAN_INFO`
- `_handle_set_prompt`: llama `plan_gate.require_feature(Feature.CUSTOM_PROMPTS)` antes de permitir. Si falla, envía error y retorna
- `_handle_clear_prompt`: mismo gate

**DialogCoordinator**:
- `handle_transcription`: después de recibir la transcripción, llama `plan_gate.consume_quota(Quota.TRANSCRIPTION_SECONDS, estimated_seconds)`. Si excede cuota, termina la respuesta actual del LLM y luego emite status `QUOTA_EXCEEDED` con mensaje de upgrade, y pausa la sesión.
- Para estimar segundos: medir duración real de la transcripción (texto / ~3 palabras por segundo como estimación simple, o usar el timestamp de inicio/fin del audio).

### [MODIFY] `backend/src/backend/ws/handler.py`

Crear `PlanGate` al inicio de la conexión WebSocket e inyectarlo en `AgentSession`:

```diff
+from backend.plan_gate import PlanGate
+from backend.tiers import PlanId

 async def websocket_endpoint(...) -> None:
     session_id = str(uuid.uuid4())[:8]
+    # TODO: obtener plan_id del usuario autenticado (DB lookup)
+    # Por ahora: header X-Plan-Id o default "lite"
+    plan_id_str = websocket.query_params.get("plan", "lite")
+    plan_id = PlanId(plan_id_str)
+    plan_gate = PlanGate(plan_id=plan_id)
     
     session = AgentSession(
         ...,
+        plan_gate=plan_gate,
     )
```

### [MODIFY] `backend/src/backend/routers/screens.py`

Gate de capturas y análisis:
- Leer `plan` de query params
- Crear `PlanGate` independiente
- Validar `Quota.SCREEN_ANALYSES` antes de procesar
- Validar `Feature.SIMULTANEOUS_ANALYSIS` si `len(images) > 1`
- Enviar error JSON si falla

---

## Capa 3: Frontend - Store, Hook y UI Condicional

### [NEW] `src/stores/slices/planSlice.ts`

Slice de Zustand para plan info:

- Tipos: `PlanId`, `FeatureFlags`, `QuotaInfo`, `PlanInfo`, `PlanSlice`
- Estado: `planInfo: PlanInfo | null`
- Acciones: `setPlanInfo(info)`, `updateQuota(quotaKey, info)`, `hasFeature(feature)`, `getQuota(quotaKey)`
- Default: plan Lite con todas las features en false

### [MODIFY] `src/stores/interview.ts`

- Importar e integrar `createPlanSlice`
- Agregar `PlanSlice` a `RootState`

### [NEW] `src/hooks/useFeatureGate.ts`

Dos hooks:
- `useFeatureGate(feature)` - retorna `{ allowed, planName }`
- `useQuotaInfo(quotaKey)` - retorna `{ used, limit, remaining, exceeded, planName }`

### [MODIFY] `src/constants/ws.ts`

Agregar a `WS_MESSAGE_TYPE`: `PLAN_INFO`, `QUOTA_UPDATE`
Agregar a `WS_STATUS`: `QUOTA_EXCEEDED`, `FEATURE_BLOCKED`

### [MODIFY] `src/hooks/useWebSocket.ts`

- En `onmessage` handler, agregar cases para `PLAN_INFO` (llama `setPlanInfo`) y `QUOTA_UPDATE` (llama `updateQuota`)
- En status handler, agregar cases para `QUOTA_EXCEEDED` y `FEATURE_BLOCKED` (setError con mensaje)
- Agregar `plan` query param a la URL del WebSocket (leer del store)

### [MODIFY] Componentes UI

| Componente | Cambio |
|---|---|
| `PromptEditor.tsx` | Deshabilitar si `!useFeatureGate("custom_prompts").allowed`. Mostrar badge "Pro" como upsell |
| `Controls.tsx` | Deshabilitar/ocultar toggle de content protection si `!useFeatureGate("invisible_mode").allowed` |
| `StatusBar.tsx` | Ocultar badge ghost mode si `!useFeatureGate("ghost_mode").allowed`. Ocultar badge content protection si `!useFeatureGate("invisible_mode").allowed` |
| `ScreenPanel.tsx` | Limitar grid a 1 imagen si `!useFeatureGate("simultaneous_captures").allowed`. Mostrar quota remaining en botón de captura. Bloquear captura si quota exceeded |
| `Overlay.tsx` | No emitir eventos de ghost mode si feature no disponible. Llamar `update_plan_permissions` de Tauri al recibir plan_info |

Cada componente bloqueado muestra un indicador visual (badge con nombre del plan mínimo requerido) como upsell.

### [MODIFY] `src/i18n/translations.ts`

Agregar keys para mensajes de quota/gating:
- `quotaExceeded`, `featureBlocked`, `upgradeToPro`, `upgradeToUltra`, `capturesRemaining`, `analysesRemaining`, `transcriptionRemaining`, `planBadge`

---

## Capa 4: Tauri/Rust - Gating de Shortcuts

### [MODIFY] `src-tauri/src/lib.rs`

Agregar 3 nuevos `AtomicBool` estáticos:
- `SHORTCUTS_ENABLED` (default `false`) - para Ctrl+Shift+C y Ctrl+Shift+P
- `INVISIBLE_MODE_ENABLED` (default `false`) - para Ctrl+Shift+B
- `GHOST_MODE_ENABLED` (default `false`) - para Ctrl+Shift+G

Nuevo comando Tauri:
- `update_plan_permissions(shortcuts_enabled, invisible_mode_enabled, ghost_mode_enabled)` - actualiza los 3 flags

En cada shortcut handler, agregar check del flag correspondiente antes de ejecutar. Si no habilitado, ignorar silenciosamente.

El frontend invoca `update_plan_permissions` al recibir `PLAN_INFO` del backend.

---

## Orden de implementación

1. **Backend Capa 1**: `tiers.py` (sin dependencias)
2. **Backend Capa 2**: `plan_gate.py` + `message_types.py` (depende de Capa 1)
3. **Backend Capa 2**: `session.py` + `handler.py` + `screens.py` (depende de Capa 2)
4. **Frontend Capa 3**: `planSlice.ts` + `interview.ts` + `ws.ts` (independiente del backend para types)
5. **Frontend Capa 3**: `useFeatureGate.ts` + `useWebSocket.ts` (depende de slice)
6. **Frontend Capa 3**: Componentes UI (depende de hooks)
7. **Frontend Capa 3**: `translations.ts` (i18n keys)
8. **Tauri Capa 4**: `lib.rs` (independiente, se integra al final)

---

## Verificación

### Manual
1. Conectar con `?plan=lite` → PromptEditor deshabilitado, shortcuts no responden, solo 1 captura, 2 capturas max/mes
2. Conectar con `?plan=pro` → PromptEditor funciona, shortcuts activos, ghost mode bloqueado, 8 capturas/mes
3. Conectar con `?plan=ultra` → todo habilitado, 40 capturas/mes
4. Agotar quota de capturas (2 para Lite) → mensaje de error y bloqueo
5. Verificar que `plan_info` llega al frontend en el primer mensaje WS
6. Verificar que `update_plan_permissions` se llama en Rust y los shortcuts se bloquean

### Build
```bash
npm run build        # tsc -b + vite build (verifica tipos)
npm run lint         # eslint
cd src-tauri && cargo check  # verifica Rust
```

---

## Archivos afectados (13 archivos)

| Capa | Archivo | Acción |
|---|---|---|
| Backend | `backend/src/backend/tiers.py` | NEW |
| Backend | `backend/src/backend/plan_gate.py` | NEW |
| Backend | `backend/src/backend/ws/session.py` | MODIFY |
| Backend | `backend/src/backend/ws/handler.py` | MODIFY |
| Backend | `backend/src/backend/routers/screens.py` | MODIFY |
| Backend | `backend/src/backend/ws/message_types.py` | MODIFY |
| Frontend | `src/stores/slices/planSlice.ts` | NEW |
| Frontend | `src/stores/interview.ts` | MODIFY |
| Frontend | `src/hooks/useFeatureGate.ts` | NEW |
| Frontend | `src/constants/ws.ts` | MODIFY |
| Frontend | `src/hooks/useWebSocket.ts` | MODIFY |
| Frontend | `src/components/*.tsx` (5 archivos) + `src/i18n/translations.ts` | MODIFY |
| Tauri | `src-tauri/src/lib.rs` | MODIFY |
