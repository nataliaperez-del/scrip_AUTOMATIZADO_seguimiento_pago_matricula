# 🎓 Automatización de Seguimiento de Matrículas UNAD — Demo

Demo de código abierto para gestionar y dar seguimiento al proceso de matrícula de estudiantes en la UNAD, implementada 100% sobre Google Workspace (Sheets + Apps Script + Forms + Gmail).

Diseñada para que un docente la instale en **menos de 5 minutos** usando su cuenta institucional, sin dependencias externas ni servidores propios.

---

## Arquitectura del proyecto

```
Google Sheets (3 hojas)
├── Base                       ← Lista de estudiantes + estados + observaciones
├── Respuestas de formulario 1 ← Respuestas del Google Forms de reporte de pago
└── Dashboard                  ← KPIs en vivo (filas 1-2) + tabla histórica (filas 5+)

Apps Script (2 archivos)
├── Codigo_Demo_Cortesia.gs    ← Lógica principal
└── Dashboard.html             ← Panel visual con Google Charts
```

---

## Características

**Verificación masiva RCA** — Consulta el estado de cada estudiante en el sistema RCA de la UNAD por número de documento y actualiza la columna `Estado` automáticamente.

**Correos personalizados con anti-duplicado** — Envía mensajes según el estado del estudiante (pendiente pago vs. pendiente inscripción). El sistema detecta si ya se envió correo en iteraciones anteriores y no lo reenvía.

**Sincronización vía Google Forms** — El correo incluye un botón "Ya Pagué". Cuando el estudiante lo usa, el trigger `alEnviarFormulario` actualiza su estado en tiempo real.

**Dashboard unificado** — La hoja `Dashboard` concentra tanto los KPIs actuales (matriculados, pendientes) como el histórico completo de ejecuciones. El panel HTML muestra gráfica de evolución de estados y gestión docente.

**Integración opcional con Gemini** — Si configuras un API key de Google AI Studio, los correos se redactan con IA. Sin key, usa plantillas incorporadas.

---

## Instalación paso a paso

### 1. Hoja de cálculo

**Opción recomendada — usar la plantilla incluida:**

1. Descarga `Plantilla_Seguimiento_Matriculas_UNAD.xlsx` de este repositorio.
2. Ve a [drive.google.com](https://drive.google.com), sube el archivo y ábrelo con **Abrir con > Google Sheets**.
3. La plantilla ya incluye las tres hojas preconfiguradas y 15 registros de ejemplo. Solo reemplaza los datos ficticios con los de tus estudiantes (filas 2 en adelante en la hoja `Base`).

**Opción manual (desde cero):**

Crea un Google Sheets con estas tres pestañas (nombres exactos):

| Pestaña | Contenido |
|---|---|
| `Base` | Fila 1: encabezados. Columnas mínimas: `Documento`, `Nombre`, `Email`, `Estado`, `Periodo Academico` |
| `Respuestas de formulario 1` | Se crea sola al vincular el Forms |
| `Dashboard` | Se crea automáticamente en la primera ejecución |

**Columnas completas de la hoja Base** (estructura del piloto):

`Documento` · `Nombre` · `Zona` · `CEAD` · `Codigo_CEAD` · `Escuela` · `Programa` · `Email` · `Email_Personal` · `Telefono` · `Telefono2` · `ACOMPAÑA` · `Periodo Academico` · `Estado` · `Observacion1` (generada por el script)

### 2. Google Forms

1. Crea un formulario con una pregunta obligatoria: **`Ingresa tu número de documento`**
2. En la pestaña Respuestas → vincula a tu Sheets → la pestaña resultante debe llamarse `Respuestas de formulario 1`
3. Copia la URL pública del formulario (la que compartes a los estudiantes)

### 3. Apps Script

1. En Sheets ve a **Extensiones > Apps Script**
2. Crea dos archivos:
   - `Codigo_Demo_Cortesia.gs` → pega el contenido del `.gs` de este repo
   - `Dashboard.html` → pega el contenido del `.html` de este repo
3. En el bloque `CONFIG` al inicio del `.gs`, reemplaza los valores marcados con ⚠️:

```javascript
SPREADSHEET_ID: 'TU_ID_AQUI',      // ⚠️ ID entre /d/ y /edit en la URL
URL_FORMULARIO: 'URL_DEL_FORMS',   // ⚠️ URL pública del formulario
PERIODO_RCA:    '2204',            // ⚠️ Código del período RCA activo
GEMINI_API_KEY: ''                 // opcional — https://aistudio.google.com/app/apikey
```

4. Guarda (**Ctrl+S**)

### 4. Activar el trigger

Selecciona la función `crearActivador` en el desplegable y haz clic en **Ejecutar**. Aprueba los permisos. Esto crea el trigger que escucha el formulario.

### 5. Usar el menú

Recarga el Sheets (**F5**). Aparece el menú **🎓 AUTOMATIZACIÓN UNAD**:

| Opción | Acción |
|---|---|
| 🔍 1. Verificar RCA | Consulta el RCA y actualiza `Estado` + agrega columna `ObservacionN` |
| 📨 2. Enviar correos | Envía correos a pendientes (no reenvía si ya se notificó) |
| ⚡ 3. Ejecutar todo | RCA + correos en secuencia |
| 📊 4. Dashboard | Abre el panel con KPIs y gráficas históricas |

---

## Estructura del Dashboard

La hoja `Dashboard` tiene este layout fijo:

```
Fila 1  │ Encabezados KPI  (fondo #1a1a2e, texto blanco)
Fila 2  │ Valores KPI      (verde / rojo / ámbar según métrica)
Fila 3  │ Separador visual (8px)
Fila 4  │ Encabezados histórico (fondo #004b87, texto blanco)
Fila 5+ │ Snapshots acumulados por ejecución
         │ Columnas: Fecha | Matriculados | Pend.Pago | Pend.Inscripción | Correos | Consultas RCA
```

El panel HTML (popup) lee esta misma hoja y renderiza:
- 3 tarjetas KPI (pagados / pendiente pago / pendiente inscripción)
- Gráfica de líneas: evolución de estados en el tiempo
- Gráfica de barras: correos enviados y consultas RCA por fecha

---

## CONFIG completo (referencia)

```javascript
const CONFIG = {
  SHEET_NAME:      'Base',
  FORMS_SHEET:     'Respuestas de formulario 1',
  DASHBOARD_SHEET: 'Dashboard',

  COL_DOC:      'Documento',
  COL_NOM:      'Nombre',
  COL_EMAIL:    'Email',
  COL_ESTADO:   'Estado',
  COL_PERIODO:  'Periodo Academico',
  OBS_PREFIX:   'Observacion',
  COL_DOC_FORM: 'Ingresa tu número de documento',

  URL_RCA:         'https://rca.unad.edu.co/moodle/servicios/inicio.php',
  URL_INSCRIPCION: 'https://rca.unad.edu.co/.../home.php',
  URL_FORMULARIO:  '',       // ⚠️ reemplazar
  SPREADSHEET_ID:  '',       // ⚠️ reemplazar
  PERIODO_RCA:     '2204',   // ⚠️ actualizar cada semestre
  GEMINI_API_KEY:  ''        // opcional
};
```

---

## Nota técnica — Template scriptlet

En `Dashboard.html`, la variable `histJson` usa el scriptlet sin escape `<?!= histJson ?>` (no `<?= ?>`). Esto es intencional: el JSON se inyecta en un bloque `<script>` donde las comillas **no deben** escaparse como entidades HTML. Cambiar esto a `<?= ?>` rompe las gráficas silenciosamente.

---

## Licencia

Apache License 2.0 — ver [LICENSE](LICENSE).
Distribución, modificación y uso libre conservando el aviso de autoría.

**Natalia Elizabeth Pérez C.**
