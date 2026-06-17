# Plan de Corrección: Sistema de Tiers - Problemas Reportados

## Problemas identificados

1. **Capturas ilimitadas en Lite**: El botón permite más de 2 capturas
2. **Contador invisible sin conexión**: El contador de capturas no se muestra hasta conectar
3. **Sin icono de plan**: No hay indicador visual del plan actual
4. **Análisis ilimitado en Lite**: Permite analizar más de 2 imágenes
5. **Modo invisible activo en Lite**: Content protection está activo cuando no debería
6. **Prompt en captura sin gating**: El prompt de análisis de pantalla no está bloqueado en Lite

## Causas raíz

- `planInfo` es `null` hasta que el backend envía `PLAN_INFO` vía WebSocket
- `useQuotaInfo()` retorna `exceeded: false` cuando no hay `planInfo`
- `canCaptureScreen()` en `screenSlice.ts` solo verifica `length < 4`, ignora el plan
- `contentProtected` está inicializado en `true` por defecto
- `ScreenPanel` no verifica `custom_prompts` feature

## Soluciones

### 1. Asumir Lite por defecto (problemas 1, 2, 4)

**Archivo: `src/stores/slices/planSlice.ts`**
- Exportar `DEFAULT_PLAN_INFO` para uso externo
- Modificar `hasFeature()` y `getQuota()` para usar default cuando `planInfo` es `null`

**Archivo: `src/hooks/useFeatureGate.ts`**
- Ya usa `DEFAULT_PLAN_INFO` como fallback, verificar que funcione correctamente

**Archivo: `src/stores/slices/screenSlice.ts`**
- Modificar `canCaptureScreen()` para verificar:
  - `planInfo` del store (o default Lite)
  - Quota de `screen_captures` restante
  - Feature `simultaneous_captures` para límite de grid (1 vs 4)

### 2. Icono del plan (problema 3)

**Archivo: `src/components/StatusBar.tsx`**
- Agregar badge con icono de plan (ej: `Crown` de lucide-react)
- Mostrar nombre del plan (Lite/Pro/Ultra) con color distintivo
- Posición: junto al theme toggle o language selector

**Archivo: `src/i18n/translations.ts`**
- Agregar keys: `planLite`, `planPro`, `planUltra`

### 3. Desactivar content protection automáticamente (problema 5)

**Archivo: `src/hooks/useWebSocket.ts`**
- Al recibir `PLAN_INFO`, si `features.invisible_mode === false`:
  - Llamar `invoke("toggle_content_protected")` si `contentProtected === true`
  - Actualizar store con `setContentProtected(false)`

**Archivo: `src/components/Overlay.tsx`**
- Agregar `useEffect` que observe `planInfo.features.invisible_mode`
- Si cambia a `false` y `contentProtected === true`, desactivar automáticamente

### 4. Bloquear prompt en ScreenPanel (problema 6)

**Archivo: `src/components/ScreenPanel.tsx`**
- Importar `useFeatureGate`
- Verificar `canUseCustomPrompts = useFeatureGate("custom_prompts").allowed`
- Si `!canUseCustomPrompts`:
  - Deshabilitar textarea (readonly o disabled)
  - Mostrar badge "Pro" junto al label
  - Deshabilitar botón "Analizar" si no hay feature

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/stores/slices/planSlice.ts` | Exportar `DEFAULT_PLAN_INFO` |
| `src/stores/slices/screenSlice.ts` | Modificar `canCaptureScreen()` para usar plan |
| `src/components/StatusBar.tsx` | Agregar badge de plan con icono |
| `src/components/ScreenPanel.tsx` | Agregar gating para prompt |
| `src/components/Overlay.tsx` | Desactivar content protection si plan no lo permite |
| `src/hooks/useWebSocket.ts` | Desactivar content protection al recibir plan sin feature |
| `src/i18n/translations.ts` | Agregar keys de plan |

## Verificación

```bash
npm run build
npm run lint
```

Manual:
1. Sin conexión: botón de captura deshabilitado después de 2 capturas (Lite default)
2. Contador visible desde el inicio
3. Badge de plan visible en StatusBar
4. Content protection desactivado automáticamente en Lite/Pro
5. Prompt de análisis bloqueado en Lite con badge "Pro"
