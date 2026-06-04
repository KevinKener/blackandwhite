# TODOS

Items deferred or flagged during plan-eng-review (2026-06-04).

---

## Fase 1 — Antes del deploy

### TODO-1: Botón "Enviar por WhatsApp" para el link de registro del cliente

**Qué:** En el admin panel, al crear o ver un cliente, mostrar su link de registro con un botón "Copiar" y un botón "Enviar por WhatsApp" que abra `wa.me/?text=...` con el link pre-armado.

**Por qué:** Sin este botón, el empleado tiene que copiar y pegar el link manualmente en WhatsApp. En la práctica esto va a fallar frecuentemente, lo que significa que clientes no reciben el link y nunca se registran. La adopción del programa de puntos depende de que este paso sea un click.

**Pros:** Reduce el error operacional más probable de Fase 1. La URL `wa.me` es trivial de implementar.

**Cons:** Un componente más en el panel admin de Fase 1.

**Contexto:** El flow de envío es 100% manual hoy. El empleado recibe el número del cliente por WhatsApp y tiene que ir al panel, buscar el cliente, copiar el link, y volver a WhatsApp a pegarlo. Sin el botón, es 4 pasos. Con el botón, es 1.

**Depende de:** Nada — independiente del resto.

---

### TODO-3: Fijar un deadline blando para Fase 1 con el dueño

**Qué:** Acordar con el dueño de Black & White una fecha concreta para que Fase 1 esté viva en producción. Por ejemplo: "viernes de la semana 3 desde el inicio del desarrollo — el panel admin está funcionando con pedidos reales".

**Por qué:** "Sin deadline formal" + primer proyecto serio = riesgo de estancarse en el 70% buscando perfección. Un deadline blando es un anchor contra el perfeccionismo, no presión. El dueño también necesita una fecha para preparar a su equipo.

**Pros:** El dueño empieza a dar feedback desde datos reales, no desde mockups. El developer tiene un hito concreto.

**Cons:** Puede generar presión si el developer tiene otras obligaciones. Es blando — no pasa nada si se corre una semana.

**Depende de:** Conversación con el dueño antes de arrancar el código.

---

## Antes de Fase 2 — resolver con el dueño

### Confirmar si los precios varían entre sucursales

**Qué:** Antes de construir `menu_items`, confirmar con el dueño si el mismo producto puede tener precios distintos en cada sucursal (ej: una hamburguesa cuesta $5000 en local A y $5500 en local B).

**Por qué:** Si el precio vive en `menu_items` con solo `tenant_id`, agregar precios por sucursal después requiere una migración. Si desde el principio `menu_items` tiene `location_id`, ambos casos quedan cubiertos sin costo extra.

**Acción:** En Fase 2, diseñar `menu_items` con `location_id` siempre. No bloquea Fase 1.

---

## Post-v1 (SaaS)

### TODO-4: Diseñar la ruta de migración de identidad de clientes para SaaS multi-tenant

**Qué:** Documentar cómo migraría la tabla `customers` (con `registration_token`) a entidades con cuenta Supabase Auth real, incluyendo el caso de un cliente que quiere usar el mismo número de teléfono en dos restaurantes distintos del SaaS.

**Por qué:** La arquitectura actual (clientes fuera de `auth.users`) es correcta para Fase 1. Pero si el SaaS tiene 10 tenants con clientes compartidos, la pregunta "¿cómo reusar la misma cuenta?" no tiene una respuesta limpia con el modelo actual. Mejor capturar el razonamiento antes de tener datos reales que migrar.

**Pros:** Captura la deuda antes de que sea costosa.

**Cons:** Problema especulativo — el SaaS todavía no tiene un segundo cliente real.

**Depende de:** Que el SaaS tenga al menos un segundo tenant activo.

---

*Última actualización: 2026-06-04 — plan-eng-review*
