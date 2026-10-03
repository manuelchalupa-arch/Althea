# RELEASE — Monitoring y costes

Qué revisar **después del primer deploy de staging**, y antes de producción.
Ningún valor de esta tabla es un secreto; ningún secreto se registra aquí.

Este documento es una lista de comprobación, no un panel. Los valores concretos
de uso sólo existen en las consolas de cada proveedor.

---

## 1. Firebase

| Qué | Dónde | Qué mirar |
|---|---|---|
| Usage | consola Firebase → Usage & billing | lecturas/escrituras de Firestore por día |
| Authentication | consola Firebase → Authentication → Usage | RA/MAU, y sobre todo **nº de usuarios creados** (las pruebas E2E crean cuentas reales) |
| Hosting | consola Firebase → Hosting | GB servidos + Number of requests. El service worker reduce repetición, pero los usuarios que recargan la app consumen |
| Performance | consola Firebase → Performance | latencia de red observada |
| Cuotas | consola Firebase → Usage | % de cuota consumida por Auth y Firestore |
| Billing | consola Firebase → Facturación | método de pago activo y límites de presupuesto |

**Alerta sugerida:** configurar aviso de presupuesto en Billing. Firebase no
tiene alertas de uso tan finas como Cloudflare, pero el aviso de presupuesto
es lo mínimo.

**Coste esperado bajo:** una PWA personal con pocos usuarios. El riesgo real no
es Firebase sino el Worker (ver §3), porque un endpoint público sin límite puede
disparar peticiones.

---

## 2. Firestore

| Qué | Dónde | Qué mirar |
|---|---|---|
| Documentos | consola Firebase → Firestore → Data | que **no** aparezcan datos de pruebas en producción |
| Reglas | consola Firebase → Firestore → Rules | que las reglas desplegadas coincidan con `firestore.rules` del repo |
| Lecturas | Usage | Growth unexpected = un cliente leyendo en bucle |

Verificación de que no hay datos de prueba:

```bash
# En la consola web, path exacto de un usuario:
#   projects/<PROJECT_ID>/databases/(default)/documents/users/<uid>
# Ojo: sólo el propietario, con su sesión, sobre SU proyecto.
```

---

## 3. Cloudflare (el punto crítico)

El Worker es lo que puede costar dinero sin avisar.

| Qué | Dónde | Qué mirar |
|---|---|---|
| Requests | dashboard Workers & Pages → el Worker → Metrics | volumen de peticiones por minuto |
| Errores | dashboard → Workers → Logs | 5xx del Worker; también errores del upstream Groq |
| Latencia | dashboard → Workers → Metrics | el proxy añade latencia al Coach |
| **Durable Objects** | dashboard → Storage & KV → Durable Objects | **peticiones** (no sólo peticiones HTTP): es lo que cobra el rate limit |
| **KV** | dashboard → Storage & KV → KV Namespaces | operaciones de lectura/escritura |
| Coste | dashboard → Facturación | uso total del plan Workers |

**Las dos alertas que hay que activar el mismo día del deploy:**

1. **Alertas de Workers** — para errores y para peticiones sostenidas.
2. **Presupuesto / billing alert** — en la configuración de la cuenta.

**Refuerzo recomendado (WAF Rate Limiting Rule).** El rate limit del código
(429) protege el gasto en **Groq**. Una WAF Rate Limiting Rule en el borde
protege al **Worker** y también frena el cómputo antes de que la petición llegue
al código. Son complementarios:

- `Rate limit` en la regla WAF → proteger el Worker.
- `X-RateLimit-Mode: durable-object` en el código → proteger el gasto en Groq.

**Comprobar que el rate limit sigue activo** tras el deploy:

```bash
npm run staging:worker:live-check -- \
  https://althea-proxy-staging.<user>.workers.dev \
  https://althea-staging.web.app
```

El resultado debe incluir `mode=durable-object`. Si aparece
`mode=memory-degraded`, el binding de la Durable Object no está aplicado y la
protección real es la degradada.

---

## 4. Groq

| Qué | Dónde | Qué mirar |
|---|---|---|
| Uso | console.groq.com → Usage | tokens consumidos por día |
| Rate limits | console.groq.com → API Keys / Limits | TPM/RPM del plan |
| Claves | console.groq.com → API Keys | **cuántas claves activas existen** |

**Acción obligatoria antes de producción:** revocar cualquier clave histórica de
desarrollo que haya estado expuesta, y rotar la que se use. Ver
`docs/INFRAESTRUCTURA.md` §9.

---

## 5. Checklist tras el primer deploy

- [ ] El Coach remoto responde (no cae al fallback sin avisar).
- [ ] `X-RateLimit-Mode` = `durable-object`.
- [ ] 0 errores 5xx en los logs del Worker durante 24 h.
- [ ] El presupuesto de Firebase tiene alerta activa.
- [ ] El presupuesto de Cloudflare tiene alerta activa.
- [ ] Se ha configurado la WAF Rate Limiting Rule.
- [ ] Ningún dato de prueba en Firestore del proyecto correcto.
- [ ] Las cuentas `althea-*-probe-*@example.com` de las pruebas E2E se han
      borrado de Auth.
- [ ] Registrado el commit y la versión del Worker desplegados
      (ver `docs/RELEASE_ROLLBACK.md`).

---

## 6. Nada de esto se puede cerrar desde el repositorio

Todo lo anterior requiere las consolas de los proveedores. El repositorio
aporta los comandos y los validadores; el acceso es del propietario.
