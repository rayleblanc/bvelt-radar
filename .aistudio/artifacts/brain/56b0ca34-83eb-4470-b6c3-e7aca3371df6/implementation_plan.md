# Plan de Implementación: Prospección Autónoma Founder y Captura de Respuestas

Este plan describe las mejoras arquitectónicas y de copywriting para que el **modo Founder** opere de manera 100% autónoma, consiga los primeros clientes para Bvelt con correos de alto valor (gancho de auditoría técnica), capture respuestas mediante webhooks de Resend y Brevo, y mantenga el bot de Telegram sincronizado.

---

## 1. Gancho de Auditoría Técnica y Copywriting en Modo Founder

### Diagnóstico Actual
Actualmente, los correos usan un enfoque de pitch directo que puede sentirse frío si el contratista no percibe un beneficio inmediato. Además, el Worker ya calcula auditorías técnicas (`webAudit.mobileScore`, `webAudit.fcpSeconds`, `dmarcAudit`, `signals.sms_gap`), pero estos datos no se aprovechaban completamente en el cuerpo del correo.

### Cambios Propuestos
- **Plantilla de Auditoría Técnica Gratuita (`generateAICopy` y `getTradePsychologyFallback`):**
  - **Asunto:** `Auditoría rápida para {empresa} en {ciudad} (fuga de clientes)` / `{name} — quick mobile latency & call audit in {city}`
  - **Cuerpo:** 
    1. Saludo personalizado mencionando su oficio y ciudad.
    2. Hecho observado real: *"Revisé la versión móvil de {empresa}: tarda {X} segundos en cargar y los visitantes móviles solo tienen un botón de llamada de voz sin respuesta SMS automática"*.
    3. Consecuencia económica: *"En servicios de {trade}, el 65% de los clientes en emergencias o fuera de horario no dejan recado en buzón de voz y llaman al siguiente contratista"*.
    4. Solución sin compromiso: Enlace a su auditoría y simulación interactiva de 60 segundos (`https://bvelt.app/demo?p={token}`).
    5. Cierre suave: *"¿Vale la pena una llamada de 5 minutos o te muestro cómo responder en 15 segundos?"*

---

## 2. Automatización Total de Envíos Diarios (5 a 8 correos/día)

### Diagnóstico Actual
`FOUNDER_AUTO_OUTREACH` requería una configuración estricta de variables en Cloudflare que a veces caía en cola de aprobación manual si la puntuación era menor a 70.

### Cambios Propuestos
- Configurar el gobernador de envíos (`checkSenderGovernor` y `handleOutreachJob`) para que en modo Founder despache automáticamente los prospectos calificados con puntuación $\ge 50$ hasta el cupo seguro diario (5 a 8 envíos/día).
- Respetar de forma innegociable los mecanismos de protección de reputación:
  - Verificación de registros MX mediante Cloudflare DNS-over-HTTPS (1.1.1.1).
  - Umbral mínimo de calidad de email ($\ge 0.65$) para evitar rebotes en Resend.
  - Pausa automática si se detecta un rebote o queja en el día.
- Enviar notificación instantánea a Telegram tras cada envío automático: `⚡ AUTO-SENT (X/8) a {Empresa} en {Ciudad}`.

---

## 3. Captura y Clasificación de Respuestas (Webhooks Resend y Brevo)

### Diagnóstico Actual
El endpoint `/api/events` procesaba eventos genéricos, pero no parseaba directamente los formatos nativos de webhooks de Resend y Brevo, obligando a usar adaptadores externos.

### Cambios Propuestos
- **Adaptador Unificado de Webhooks (`/api/events`, `/webhook/resend`, `/webhook/brevo`):**
  - **Resend Webhooks:**
    - Parsear eventos: `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, y respuestas de correo entrante (Inbound).
    - Mapear el ID de mensaje de Resend (`data.email_id`) o el email del destinatario (`data.to[0]`) para asociarlo automáticamente al prospecto en D1.
  - **Brevo Webhooks:**
    - Parsear eventos: `delivered`, `hard_bounce`, `soft_bounce`, `opened`, `click`, `reply`.
  - **Motor de Clasificación Semántica (`classifyReplyText`):**
    - Si el contratista responde: *"Sí, me interesa"*, *"Cuánto cuesta?"* -> Clasifica como `positive` o `question`, detiene la automatización (`auto_stopped = true`), pone el prospecto en `human_review` y manda una alerta 🔥 a Telegram con el texto exacto.
    - Si el contratista responde: *"Darse de baja"* o *"No me interesa"* -> Clasifica como `unsubscribe` o `negative`, agrega a la tabla de supresión y detiene cualquier contacto futuro.

---

## 4. Bot de Telegram: Verificación y Enlace en Tiempo Real

### Diagnóstico Actual
El bot de Telegram funciona correctamente mediante `notifyFounder` y webhook interactivo, pero es necesario asegurar que el endpoint de autocomprobación (`/api/telegram-test`) y el webhook registrado (`/telegram-webhook`) validen la conectividad bidireccional de inmediato.

### Cambios Propuestos
- Añadir verificación de estado del bot en la consola y diagnóstico claro si falta `TELEGRAM_BOT_TOKEN` o `TELEGRAM_CHAT_ID`.
- Cuando el contratista visita su enlace demo (`demo_viewed`) o hace clic en el CTA (`demo_cta_clicked`), emitir la alerta a Telegram para que el fundador sepa en tiempo real que el prospecto está interactuando con su demo.

---

## 5. Verificación de Tenant Mode

- Confirmar que todas las oportunidades generadas para clientes de Bvelt mantengan su aislamiento estricto, usen el script de servicios del contratista y no contengan enlaces de compra de Bvelt.

---

## Plan de Verificación

1. **Compilación y Linter:** Ejecutar `compile_applet` y `lint_applet` para garantizar 0 errores de sintaxis o tipos.
2. **Prueba Unitaria de Webhooks:** Probar el endpoint `/api/events` simulando payloads de Resend y Brevo para validar clasificación y cambio de estado en D1.
3. **Prueba de Copywriting:** Verificar que `generateAICopy` y `buildAttackKit` en modo Founder generen el gancho de auditoría técnica con métricas de rendimiento y enlace demo funcional.
