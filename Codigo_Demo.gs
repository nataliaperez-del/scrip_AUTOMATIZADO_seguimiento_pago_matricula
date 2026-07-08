/**
 * Automatización de seguimiento Matrículas — Demo
 * Autora  : Natalia Elizabeth Pérez C.
 * Licencia: Apache 2.0 — http://www.apache.org/licenses/LICENSE-2.0
 *
 * Instalación:
 *   1. Reemplaza los valores marcados con ⚠️ en CONFIG.
 *   2. Guarda (Ctrl+S) y ejecuta crearActivador() una sola vez.
 *
 * Flujo:
 *   paso1_VerificarRCA        → Consulta el RCA y registra resultado en ObservacionN.
 *   paso2_EnviarCorreos       → Envía correo a todos los pendientes CADA VEZ que el
 *                                profesor presiona el botón del menú. Sin límite de
 *                                tiempo ni cooldown — control 100% manual, ningún envío
 *                                automático. Cada ejecución agrega una columna
 *                                ObservacionN nueva con el registro de ese envío.
 *   paso3_ActualizarDashboard → Abre panel KPI con gráficas históricas.
 *   alEnviarFormulario        → Trigger: estudiante reporta pago O novedad vía Google Forms.
 *
 * RCA — textos de respuesta esperados:
 *   "ya la factura fue pagada"    → PAGADO
 *   "se ha encontrado la factura" → PENDIENTE
 *   "no se encontraron datos"     → NO_INSCRITO
 *
 * NOVEDAD:
 *   El formulario tiene 3 preguntas: documento, ¿ya pagó? (Sí/No), y si la
 *   respuesta es "No", un campo de texto libre para la novedad (ej: "ya terminé
 *   mis estudios hace un año", "cambio de programa", etc.)
 *
 * REGLA DE ENVÍO DE CORREOS:
 *   El único bloqueo permanente es: Estado = "El pago fue realizado" o
 *   Estado = "Novedad reportada". Mientras el estudiante no esté en ninguno
 *   de esos dos estados, el profesor puede reenviarle correo tantas veces
 *   como quiera, sin restricción de tiempo. Cada envío queda registrado en
 *   una nueva columna ObservacionN (historial acumulado a la derecha).
 */


// ─── CONFIG ──────────────────────────────────────────────────────────────────

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

  // ⚠️ Estos 3 textos deben coincidir EXACTO (tal cual, con tildes y signos)
  //    con las preguntas de tu Google Forms.
  COL_DOC_FORM:     'Ingresa tu número de documento',
  COL_PAGO_FORM:    '¿Ya realizaste el pago de tu matrícula?',
  COL_NOVEDAD_FORM: 'Si tu respuesta fue "No", cuéntanos qué novedad tienes con tu matrícula',

  ESTADO_PAGADO:          'El pago fue realizado',
  ESTADO_NOVEDAD:         'Novedad reportada',
  ESTADO_PEND_PAGO:       'Pendiente pago',
  ESTADO_PEND_INSCRIPCION:'Pendiente inscripción y pago',

  URL_RCA:         'https://rca.unad.edu.co/moodle/servicios/inicio.php',
  URL_INSCRIPCION: 'https://rca.unad.edu.co/moodle/preinscripcion/preinscripcion/home.php?Tan5UdE=872&nivel=1,2,5,7,10&asidAYa6tibaNU=1332',

  // 🔗 Enlace público del formulario (el mismo que le compartes a los estudiantes)
  URL_FORMULARIO: '📋 COPIE AQUI EL ENLACE DEL FORMULARIO PUBLICADO', // ⚠️ reemplaza este valor completo

  // 🆔 ID de tu Google Sheets — se saca de la URL del archivo:
  //    https://docs.google.com/spreadsheets/d/ 👉 ESTA-ES-LA-PARTE-QUE-COPIAS 👈 /edit?gid=0
  //    Ejemplo real: 19nRKQdmYLugoWaKzjmUGL6DHZu9lwqY1uAt9m_UJTr0
  SPREADSHEET_ID: '📋 COPIE AQUI EL ID DEL EXCEL GOOGLE', // ⚠️ reemplaza este valor completo

  // Valor del campo "peraca" en el formulario RCA. Actualizar cada semestre.
  // 2026 II PERIODO 16-04 → 2204
  PERIODO_RCA: '2204',

  // 🤖 Opcional — solo si quieres que los correos se redacten con IA (Gemini)
  GEMINI_API_KEY: '' // ⚠️ opcional — https://aistudio.google.com/app/apikey
};


// ─── MENÚ ────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎓 AUTOMATIZACIÓN UNAD')
    .addItem('🔍 1. Verificar RCA',      'menuVerificarRCA')
    .addItem('📨 2. Enviar correos a pendientes', 'menuEnviarCorreos')
    .addSeparator()
    .addItem('⚡ 3. Ejecutar todo',      'menuEjecutarTodo')
    .addSeparator()
    .addItem('📊 4. Dashboard',          'menuDashboard')
    .addItem('🐞 5. Ver errores del sistema', 'menuVerErrores')
    .addToUi();
}

function menuVerificarRCA()  { ejecutarFlujo('SOLO_RCA');     }
function menuEnviarCorreos() { ejecutarFlujo('SOLO_CORREOS'); }
function menuEjecutarTodo()  { ejecutarFlujo('TODO');         }
function menuDashboard()     { paso3_ActualizarDashboard();   }

function menuVerErrores() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName('Errores_Sistema');
  if (!hoja) { mostrarAlerta('✅ No hay errores registrados todavía.'); return; }
  ss.setActiveSheet(hoja);
}


// ─── ORQUESTADOR ─────────────────────────────────────────────────────────────

function ejecutarFlujo(tipo) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) { mostrarAlerta('❌ Hoja "' + CONFIG.SHEET_NAME + '" no encontrada.'); return; }

  if (tipo === 'SOLO_RCA' || tipo === 'TODO') {
    paso1_VerificarRCA(sheet, sheet.getDataRange().getValues());
    if (tipo === 'SOLO_RCA') mostrarAlerta('✅ Verificación RCA completada.');
  }
  if (tipo === 'SOLO_CORREOS' || tipo === 'TODO') {
    const resultado = paso2_EnviarCorreos(sheet, sheet.getDataRange().getValues());
    if (tipo === 'SOLO_CORREOS') {
      mostrarAlerta('✉️ Correos enviados: ' + resultado.enviados +
        '\n✅ Ya pagaron / con novedad (excluidos): ' + resultado.excluidos);
    }
  }
  if (tipo === 'TODO') mostrarAlerta('🎉 Flujo completo terminado.');
}


// ─── PASO 1 — VERIFICAR RCA ──────────────────────────────────────────────────

function paso1_VerificarRCA(sheet, datos) {
  const enc        = datos[0];
  const idxDoc     = buscarCol(enc, CONFIG.COL_DOC);
  const idxEstado  = buscarCol(enc, CONFIG.COL_ESTADO);
  const idxPeriodo = buscarCol(enc, CONFIG.COL_PERIODO);

  if (idxDoc === -1 || idxEstado === -1) {
    mostrarAlerta('❌ Columnas "' + CONFIG.COL_DOC + '" o "' + CONFIG.COL_ESTADO + '" no encontradas.');
    return;
  }
  if (!verificarConexionRCA()) {
    mostrarAlerta('⚠️ No se pudo conectar con el RCA. Puede estar caído o la URL cambió.');
    return;
  }

  const ts = timestamp();
  const resultados = [];
  const estadoPagadoLimpio  = limpiarTexto(CONFIG.ESTADO_PAGADO);
  const estadoNovedadLimpio = limpiarTexto(CONFIG.ESTADO_NOVEDAD);

  for (let i = 1; i < datos.length; i++) {
    const documento = String(datos[i][idxDoc]    || '').trim();
    const estado    = String(datos[i][idxEstado] || '').trim();
    if (!documento) continue;
    const estadoLimpio = limpiarTexto(estado);
    // No vuelve a consultar si ya pagó o si tiene novedad reportada (ej. ya se graduó).
    if (estadoLimpio === estadoPagadoLimpio || estadoLimpio === estadoNovedadLimpio) continue;

    const periodo = (idxPeriodo !== -1 && datos[i][idxPeriodo])
      ? String(datos[i][idxPeriodo]).trim()
      : CONFIG.PERIODO_RCA;

    const rca = verificarPagoRCA(documento, periodo);
    let nuevoEstado = estado;
    let textoObs    = '[' + ts + '] ';

    switch (rca) {
      case 'PAGADO':      nuevoEstado = CONFIG.ESTADO_PAGADO;           textoObs += CONFIG.ESTADO_PAGADO;           break;
      case 'PENDIENTE':   nuevoEstado = CONFIG.ESTADO_PEND_PAGO;        textoObs += CONFIG.ESTADO_PEND_PAGO;        break;
      case 'NO_INSCRITO': nuevoEstado = CONFIG.ESTADO_PEND_INSCRIPCION; textoObs += CONFIG.ESTADO_PEND_INSCRIPCION; break;
      case 'ERROR':       textoObs += '⚠️ Error de conexión RCA — verificar manualmente';          break;
      case 'DESCONOCIDO': textoObs += '⚠️ Respuesta no identificada del RCA — verificar manualmente'; break;
    }
    resultados.push({ fila: i, nuevoEstado, textoObs });
  }

  if (!resultados.length) return;

  const idxObs = crearSiguienteObservacion(datos);
  let pagados = 0, pendP = 0, pendI = 0;
  for (const r of resultados) {
    datos[r.fila][idxEstado] = r.nuevoEstado;
    datos[r.fila][idxObs]   = r.textoObs;
    if (r.nuevoEstado === CONFIG.ESTADO_PAGADO)                 pagados++;
    else if (r.nuevoEstado === CONFIG.ESTADO_PEND_PAGO)         pendP++;
    else if (r.nuevoEstado === CONFIG.ESTADO_PEND_INSCRIPCION)  pendI++;
  }
  guardar(sheet, datos);
  _registrarHistorico(SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID), pagados, pendP, pendI, 0, resultados.length);
}


// ─── PASO 2 — ENVIAR CORREOS (control 100% manual del profesor) ─────────────
// Se envía a TODOS los que no estén en "El pago fue realizado" ni en
// "Novedad reportada" — sin límite de reenvíos, sin cooldown, sin envío
// automático. Cada ejecución agrega una columna ObservacionN nueva.

function paso2_EnviarCorreos(sheet, datos) {
  if (!CONFIG.URL_FORMULARIO) { mostrarAlerta('❌ URL_FORMULARIO no configurada.'); return { enviados: 0, excluidos: 0 }; }

  const enc       = datos[0];
  const idxNom    = buscarCol(enc, CONFIG.COL_NOM);
  const idxEmail  = buscarCol(enc, CONFIG.COL_EMAIL);
  const idxEstado = buscarCol(enc, CONFIG.COL_ESTADO);

  if (idxEmail === -1 || idxEstado === -1) {
    mostrarAlerta('❌ Columnas de email o estado no encontradas.');
    return { enviados: 0, excluidos: 0 };
  }

  const obsCols       = getObsColumns(enc);
  const idxCorreoObs  = crearSiguienteObservacion(datos);
  const ts            = timestamp();

  const estadoPagadoLimpio  = limpiarTexto(CONFIG.ESTADO_PAGADO);
  const estadoNovedadLimpio = limpiarTexto(CONFIG.ESTADO_NOVEDAD);

  let enviados  = 0;
  let excluidos = 0; // ya pagaron o tienen novedad — bloqueo permanente

  for (let i = 1; i < datos.length; i++) {
    const estado = limpiarTexto(datos[i][idxEstado] || '');
    const email  = String(datos[i][idxEmail] || '').trim();

    if (estado === estadoPagadoLimpio || estado === estadoNovedadLimpio || !email) { excluidos++; continue; }

    const nombre    = String(datos[i][idxNom] || 'Estudiante').split(' ')[0];
    const ultimaObs = getUltimaObservacion(datos[i], obsCols);
    try {
      MailApp.sendEmail({
        to:       email,
        subject:  '📚 Tu matrícula UNAD: acción requerida, ' + nombre,
        htmlBody: redactarCorreo(nombre, ultimaObs)
      });
      datos[i][idxCorreoObs] = '[' + ts + '] Correo Enviado';
      enviados++;
    } catch (err) {
      registrarError('paso2_EnviarCorreos', 'No se pudo enviar correo a ' + email + ' (' + nombre + '): ' + err.message);
    }
  }

  if (enviados > 0) {
    guardar(sheet, datos);
    _registrarHistorico(SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID), null, null, null, enviados, 0);
  } else {
    // Nadie recibió correo en esta ejecución — deshace la columna ObservacionN vacía.
    datos[0].pop();
    for (let r = 1; r < datos.length; r++) datos[r].pop();
  }

  Logger.log('Correos enviados: ' + enviados + ' · Excluidos (pagados/novedad): ' + excluidos);
  return { enviados, excluidos };
}


// ─── PASO 3 — DASHBOARD ──────────────────────────────────────────────────────

function paso3_ActualizarDashboard() {
  const ss        = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetData = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheetData) { mostrarAlerta('❌ Hoja "' + CONFIG.SHEET_NAME + '" no encontrada.'); return; }

  const datos     = sheetData.getDataRange().getValues();
  const idxEstado = buscarCol(datos[0], CONFIG.COL_ESTADO);
  const obsCols   = getObsColumns(datos[0]);
  let matriculados = 0, pendPago = 0, pendInscripcion = 0;

  for (let i = 1; i < datos.length; i++) {
    const estado    = limpiarTexto(datos[i][idxEstado] || '');
    const ultimaObs = limpiarTexto(getUltimaObservacion(datos[i], obsCols));
    if (estado === limpiarTexto(CONFIG.ESTADO_PAGADO))                        matriculados++;
    else if (ultimaObs.includes(limpiarTexto(CONFIG.ESTADO_PEND_INSCRIPCION))) pendInscripcion++;
    else if (ultimaObs.includes(limpiarTexto(CONFIG.ESTADO_PEND_PAGO)))        pendPago++;
    // Los estudiantes con "Novedad reportada" no se cuentan aquí a propósito.
  }

  _registrarHistorico(ss, matriculados, pendPago, pendInscripcion, 0, 0);

  const dash    = ss.getSheetByName(CONFIG.DASHBOARD_SHEET);
  const lastRow = dash ? dash.getLastRow() : 0;
  const histRows = (dash && lastRow >= 5)
    ? dash.getRange(5, 1, lastRow - 4, 6).getValues()
    : [];

  const histJson = JSON.stringify({
    labels:   histRows.map(r => String(r[0]).substring(0, 10)),
    pagados:  histRows.map(r => Number(r[1]) || 0),
    pendPago: histRows.map(r => Number(r[2]) || 0),
    pendInsc: histRows.map(r => Number(r[3]) || 0),
    semanas:  histRows.map(r => String(r[0]).substring(0, 10)),
    correos:  histRows.map(r => Number(r[4]) || 0),
    rca:      histRows.map(r => Number(r[5]) || 0)
  });

  const tpl = HtmlService.createTemplateFromFile('Dashboard');
  tpl.matriculados       = matriculados;
  tpl.pendPago           = pendPago;
  tpl.pendInscripcion    = pendInscripcion;
  tpl.periodo            = CONFIG.PERIODO_RCA;
  tpl.histJson           = histJson;
  tpl.fechaActualizacion = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  SpreadsheetApp.getUi().showModalDialog(
    tpl.evaluate().setWidth(700).setHeight(620),
    '📊 Panel Docente · ' + CONFIG.PERIODO_RCA
  );
}

// ─── REGISTRO EN HOJA DASHBOARD ──────────────────────────────────────────────
// Filas 1-2: KPIs. Fila 3: separador. Fila 4: encabezados. Fila 5+: histórico.

function _registrarHistorico(ss, matriculados, pendPago, pendInscripcion, correos, rca) {
  if (matriculados === null && correos === 0 && rca === 0) return;

  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  let dash = ss.getSheetByName(CONFIG.DASHBOARD_SHEET);
  if (!dash) {
    dash = ss.insertSheet(CONFIG.DASHBOARD_SHEET);
    dash.setTabColor('#004b87');
    dash.getRange('A1:D1')
        .setValues([['Matriculados', 'Pend. Pago', 'Pend. Inscripción', 'Actualizado']])
        .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff')
        .setHorizontalAlignment('center');
    dash.getRange('A2:D2').setValues([[0, 0, 0, ts]])
        .setFontSize(16).setHorizontalAlignment('center').setFontWeight('bold');
    dash.getRange('A2').setFontColor('#1D9E75');
    dash.getRange('B2').setFontColor('#E24B4A');
    dash.getRange('C2').setFontColor('#BA7517');
    dash.getRange('D2').setFontColor('#5f6368').setFontSize(10).setFontWeight('normal');
    dash.setRowHeight(3, 8);
    dash.getRange('A4:F4')
        .setValues([['Fecha', 'Matriculados', 'Pend. Pago', 'Pend. Inscripción', 'Correos', 'Consultas RCA']])
        .setFontWeight('bold').setBackground('#004b87').setFontColor('#ffffff');
    dash.setFrozenRows(2);
    dash.setColumnWidth(1, 140);
  }

  if (matriculados !== null) {
    dash.getRange('A2:D2').setValues([[matriculados, pendPago, pendInscripcion, ts]]);
  }

  const nextRow = Math.max(dash.getLastRow() + 1, 5);
  dash.getRange(nextRow, 1, 1, 6).setValues([[
    ts,
    matriculados    !== null ? matriculados    : '',
    pendPago        !== null ? pendPago        : '',
    pendInscripcion !== null ? pendInscripcion : '',
    correos || 0,
    rca     || 0
  ]]);
}


// ─── TRIGGER — FORMULARIO DE PAGO / NOVEDAD ─────────────────────────────────

function alEnviarFormulario(e) {
  if (!e || !e.values) { registrarError('alEnviarFormulario', 'Evento vacío — el trigger no recibió datos del formulario'); return; }

  const ss         = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetForms = ss.getSheetByName(CONFIG.FORMS_SHEET);
  if (!sheetForms) { registrarError('alEnviarFormulario', 'Hoja de respuestas no encontrada: "' + CONFIG.FORMS_SHEET + '"'); return; }

  const encabezados = sheetForms.getDataRange().getValues()[0];
  const idxDocForm   = buscarCol(encabezados, CONFIG.COL_DOC_FORM);
  const idxPagoForm  = buscarCol(encabezados, CONFIG.COL_PAGO_FORM);
  const idxNovForm   = buscarCol(encabezados, CONFIG.COL_NOVEDAD_FORM);

  if (idxDocForm === -1) {
    registrarError('alEnviarFormulario', 'No se encontró la columna de documento. Revisa que CONFIG.COL_DOC_FORM coincida exacto con la pregunta del Forms. Encabezados reales: ' + JSON.stringify(encabezados));
    return;
  }

  const documento = String(e.values[idxDocForm] || '').replace(/\D/g, '');
  if (!documento) { registrarError('alEnviarFormulario', 'El documento llegó vacío tras normalizar la respuesta del formulario'); return; }

  const respuestaPago = idxPagoForm !== -1 ? limpiarTexto(e.values[idxPagoForm]) : 'si';
  const yaPago  = respuestaPago === 'si' || respuestaPago === 'sí';
  const novedad = idxNovForm !== -1 ? String(e.values[idxNovForm] || '').trim() : '';

  const sheetData = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheetData) { registrarError('alEnviarFormulario', 'Hoja "' + CONFIG.SHEET_NAME + '" no encontrada'); return; }

  const datos     = sheetData.getDataRange().getValues();
  const idxDoc    = buscarCol(datos[0], CONFIG.COL_DOC);
  const idxEstado = buscarCol(datos[0], CONFIG.COL_ESTADO);
  if (idxDoc === -1 || idxEstado === -1) { registrarError('alEnviarFormulario', 'Columnas "Documento" o "Estado" no encontradas en la hoja Base'); return; }

  const ts = timestamp();
  let encontrado = false;

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][idxDoc] || '').replace(/\D/g, '') !== documento) continue;

    if (yaPago) {
      datos[i][idxEstado] = CONFIG.ESTADO_PAGADO;
      datos[i][crearSiguienteObservacion(datos)] =
        '[' + ts + '] El pago fue realizado — Reportado vía formulario';
    } else {
      datos[i][idxEstado] = CONFIG.ESTADO_NOVEDAD;
      const textoObs = novedad
        ? '[' + ts + '] Novedad reportada: ' + novedad
        : '[' + ts + '] Respondió "No" pero no describió la novedad — revisar manualmente';
      datos[i][crearSiguienteObservacion(datos)] = textoObs;
    }

    guardar(sheetData, datos);
    encontrado = true;
    Logger.log('✅ Fila ' + (i + 1) + ' actualizada — yaPago=' + yaPago + (novedad ? ' — novedad: ' + novedad : ''));
    break;
  }

  if (!encontrado) {
    registrarError('alEnviarFormulario', 'Documento "' + documento + '" no encontrado en la hoja Base. Revisa si tiene puntos, espacios, o si el estudiante no está en la lista.');
  }
}


// ─── SETUP — ejecutar UNA SOLA VEZ ───────────────────────────────────────────

function crearActivador() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'alEnviarFormulario')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('alEnviarFormulario').forSpreadsheet(ss).onFormSubmit().create();
}


// ─── AUXILIARES ──────────────────────────────────────────────────────────────

function getObsColumns(enc) {
  const prefix = limpiarTexto(CONFIG.OBS_PREFIX);
  const result = [];
  for (let c = 0; c < enc.length; c++) {
    const m = limpiarTexto(enc[c]).match(new RegExp('^' + prefix + '(\\d+)$'));
    if (m) result.push({ n: parseInt(m[1]), col: c });
  }
  return result.sort((a, b) => a.n - b.n);
}

function crearSiguienteObservacion(datos) {
  const cols   = getObsColumns(datos[0]);
  const maxN   = cols.length ? cols[cols.length - 1].n : 0;
  const newIdx = datos[0].length;
  datos[0].push(CONFIG.OBS_PREFIX + (maxN + 1));
  for (let r = 1; r < datos.length; r++) {
    while (datos[r].length < datos[0].length) datos[r].push('');
  }
  return newIdx;
}

function getUltimaObservacion(fila, obsCols) {
  if (!obsCols.length) return '';
  return String(fila[obsCols[obsCols.length - 1].col] || '').trim();
}

function limpiarTexto(s) {
  return String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function buscarCol(enc, nombre) {
  const obj = limpiarTexto(nombre);
  return enc.findIndex(h => limpiarTexto(h) === obj);
}

function guardar(sheet, datos) {
  sheet.getRange(1, 1, datos.length, datos[0].length).setValues(datos);
}

function timestamp() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

function mostrarAlerta(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (_) {}
}

// ─── ERRORES VISIBLES EN EL EXCEL ────────────────────────────────────────────
// En vez de que los fallos queden escondidos en el log técnico de Apps Script,
// se registran en una hoja "Errores_Sistema" (pestaña roja) dentro del propio
// Excel — cualquiera que lo abra los ve, sin necesidad de entrar al código.

function registrarError(origen, mensaje) {
  Logger.log('❌ [' + origen + '] ' + mensaje); // se mantiene también en el log técnico
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let hoja = ss.getSheetByName('Errores_Sistema');
    if (!hoja) {
      hoja = ss.insertSheet('Errores_Sistema');
      hoja.getRange('A1:C1')
          .setValues([['Fecha', 'Dónde ocurrió', 'Qué pasó']])
          .setFontWeight('bold').setBackground('#E24B4A').setFontColor('#ffffff');
      hoja.setFrozenRows(1);
      hoja.setColumnWidth(1, 130);
      hoja.setColumnWidth(2, 200);
      hoja.setColumnWidth(3, 550);
    }
    hoja.setTabColor('#E24B4A'); // pestaña roja — visible incluso sin abrirla
    hoja.appendRow([timestamp(), origen, mensaje]);
  } catch (_) { /* si esto también falla, ya no hay más capas — queda solo el log técnico */ }
}


// ─── CLIENTE RCA ─────────────────────────────────────────────────────────────
// Llama a resumen.php con parámetros en base64 (inicio.php solo devuelve JS, no ejecutable por UrlFetchApp).

const RCA_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-CO,es;q=0.9',
  'Referer':         'https://rca.unad.edu.co/moodle/servicios/inicio.php'
};

function verificarConexionRCA() {
  try {
    return UrlFetchApp.fetch(CONFIG.URL_RCA,
      { method: 'get', headers: RCA_HEADERS, muteHttpExceptions: true, followRedirects: true }
    ).getResponseCode() < 500;
  } catch (_) { return false; }
}

// Devuelve: 'PAGADO' | 'PENDIENTE' | 'NO_INSCRITO' | 'DESCONOCIDO' | 'ERROR'
function verificarPagoRCA(documento, periodo) {
  try {
    const url = 'https://rca.unad.edu.co/moodle/ryc/reimpresion/resumen.php'
              + '?d=' + Utilities.base64Encode(documento)
              + '&p=' + Utilities.base64Encode(String(periodo || CONFIG.PERIODO_RCA).trim());

    const r = UrlFetchApp.fetch(url,
      { method: 'post', headers: RCA_HEADERS, muteHttpExceptions: true, followRedirects: true }
    ).getContentText().toLowerCase();

    if (r.includes('ya la factura fue pagada'))    return 'PAGADO';
    if (r.includes('no se encontraron datos'))     return 'NO_INSCRITO';
    if (r.includes('se ha encontrado la factura')) return 'PENDIENTE';
    return 'DESCONOCIDO';
  } catch (_) { return 'ERROR'; }
}


// ─── CORREO ──────────────────────────────────────────────────────────────────
// Usa Gemini si hay API key; si no, cae al template base.

function redactarCorreo(nombre, ultimaObs) {
  const pendInscripcion = limpiarTexto(ultimaObs).includes('inscri');
  const urlAccion       = pendInscripcion ? CONFIG.URL_INSCRIPCION : CONFIG.URL_RCA;
  const textoAccion     = pendInscripcion ? '👉 COMPLETAR PREINSCRIPCIÓN' : '👉 IR AL RCA — DESCARGAR FACTURA';
  const cuerpo = (CONFIG.GEMINI_API_KEY ? _generarCuerpoIA(nombre, pendInscripcion) : null)
    || (pendInscripcion
        ? 'Detectamos que aún <strong>no has completado tu preinscripción</strong> para el período actual. No pierdas tu cupo — los cupos son limitados y el plazo está próximo a vencer.'
        : 'Tu preinscripción está registrada, pero <strong>el pago de matrícula sigue pendiente</strong>. Ingresa al RCA, descarga tu recibo y realiza el pago cuanto antes.');

  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">'
    + '<div style="background:#004b87;padding:22px 24px;">'
    + '<h2 style="color:#fff;margin:0;font-size:18px;">🎓 Universidad Nacional Abierta y a Distancia</h2>'
    + '<p style="color:#b3cde8;margin:4px 0 0;font-size:13px;">Seguimiento de Matrículas · ' + CONFIG.PERIODO_RCA + '</p>'
    + '</div>'
    + '<div style="padding:28px 24px;">'
    + '<p style="font-size:15px;">Estimado/a <strong>' + nombre + '</strong>,</p>'
    + '<p style="font-size:14px;line-height:1.6;">' + cuerpo + '</p>'
    + '<p style="text-align:center;margin:28px 0;">'
    + '<a href="' + urlAccion + '" style="background:#004b87;color:#fff;padding:13px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;display:inline-block;">' + textoAccion + '</a>'
    + '</p>'
    + '<hr style="border:none;border-top:1px solid #e8e8e8;margin:24px 0;">'
    + '<p style="font-size:13px;"><strong>⚠️ ¿Ya realizaste el pago?</strong> Repórtalo para actualizar tu estado:</p>'
    + '<p style="text-align:center;margin:16px 0;">'
    + '<a href="' + CONFIG.URL_FORMULARIO + '" style="background:#27ae60;color:#fff;padding:13px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;display:inline-block;">✅ YA PAGUÉ — REPORTAR AQUÍ</a>'
    + '</p></div>'
    + '<div style="background:#f5f5f5;padding:14px 24px;text-align:center;">'
    + '<p style="color:#888;font-size:11px;margin:0;">Gestión de Matrículas · UNAD — mensaje automático, no responder.</p>'
    + '</div></div>';
}

function _generarCuerpoIA(nombre, pendInscripcion) {
  try {
    const situacion = pendInscripcion
      ? 'El estudiante no ha completado la preinscripción para el período 2026-II de la UNAD.'
      : 'El estudiante completó la preinscripción pero no ha pagado la factura para el período 2026-II de la UNAD.';

    const prompt = 'Eres el asistente académico de la UNAD.\n'
      + 'Redacta UN párrafo (máx. 3 oraciones) para un correo de seguimiento de matrícula.\n'
      + 'Destinatario: ' + nombre + '.\n'
      + 'Situación: ' + situacion + '\n'
      + 'Tono amable pero urgente. Usa <strong> en máximo 1 frase. Devuelve SOLO el párrafo HTML.';

    const resp = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + CONFIG.GEMINI_API_KEY,
      { method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
                                  generationConfig: { temperature: 0.7, maxOutputTokens: 200 } }),
        muteHttpExceptions: true }
    );

    const json = JSON.parse(resp.getContentText());
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
  } catch (_) { return null; }
}
