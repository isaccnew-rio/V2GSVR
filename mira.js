/* ============================================================
   MIRA — Modelo de Inteligencia para Registro de Accidentes
   Acceso estricto: allReportesData (hora, date, Fallecidos, Heridos)
   ============================================================ */

const m_mo = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const m_mo_s = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const GEMINI_API_KEY = 'AIzaSyAIEnAZ0fkGaQcvaxK-g_xvgn3VXZXTE-I'; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

/* --- UI Toggle --- */
function toggleMira() {
    const panelMira = document.getElementById('miraPanel');
    const botonFlotante = document.getElementById('miraFab');
    panelMira.classList.toggle('mira-hidden');
    botonFlotante.style.display = panelMira.classList.contains('mira-hidden') ? 'flex' : 'none';
}

function miraChip(textoConsulta) { 
    document.getElementById('miraInput').value = textoConsulta; 
    miraSend(); 
}

async function miraSend() {
    const inputElement = document.getElementById('miraInput');
    const consultaUsuario = inputElement.value.trim();
    if (!consultaUsuario) return;
    inputElement.value = '';
    m_msg(consultaUsuario, 'user');
    m_typ_s();
    
    let respuestaFinal = await llamarApiGemini(consultaUsuario, allReportesData);
    if (!respuestaFinal) {
        respuestaFinal = miraProc(consultaUsuario);
    }
    
    m_typ_h(); 
    m_msg(respuestaFinal, 'bot');
}

function m_msg(contenidoHTML, emisor) {
    const contenedorMensajes = document.getElementById('miraBody');
    const mensajeBienvenida = contenedorMensajes.querySelector('.mira-welcome');
    if (mensajeBienvenida) mensajeBienvenida.remove();
    const divMensaje = document.createElement('div');
    divMensaje.className = `mira-msg mira-msg-${emisor}`;
    divMensaje.innerHTML = `<div class="mira-bubble">${contenidoHTML}</div>`;
    contenedorMensajes.appendChild(divMensaje);
    contenedorMensajes.scrollTop = contenedorMensajes.scrollHeight;
}

function m_typ_s() {
    const contenedorMensajes = document.getElementById('miraBody');
    const divTipeo = document.createElement('div');
    divTipeo.className = 'mira-msg mira-msg-bot mira-typing-wrap';
    divTipeo.innerHTML = '<div class="mira-typing"><span></span><span></span><span></span></div>';
    contenedorMensajes.appendChild(divTipeo);
    contenedorMensajes.scrollTop = contenedorMensajes.scrollHeight;
}

function m_typ_h() {
    const elementoTipeo = document.querySelector('.mira-typing-wrap');
    if (elementoTipeo) elementoTipeo.remove();
}

/* --- Parseo de Datos --- */
function m_dt(registro) {
    if (registro.date && typeof registro.date === 'string' && registro.date.length >= 10) {
        const partesFecha = registro.date.split('-');
        return new Date(partesFecha[0], partesFecha[1] - 1, partesFecha[2]);
    }
    return null;
}

function m_mo_idx(registro) { 
    const fecha = m_dt(registro); 
    return fecha ? fecha.getMonth() : -1; 
}

function m_hr_idx(registro) { 
    return registro.hora ? parseInt(registro.hora.toString().split(':')[0], 10) : -1; 
}

function m_day_idx(registro) { 
    const fecha = m_dt(registro); 
    return fecha ? fecha.getDate() : -1; 
}

function m_fall(registro) { 
    const valorFallecidos = registro.Fallecidos; 
    return (valorFallecidos === 'NULL' || valorFallecidos === null || valorFallecidos === undefined) ? 0 : parseInt(valorFallecidos); 
}

function m_her(registro) { 
    const valorHeridos = registro.Heridos; 
    return (valorHeridos === 'NULL' || valorHeridos === null || valorHeridos === undefined) ? 0 : parseInt(valorHeridos); 
}

function m_det_mo(consulta) {
    const consultaLimpia = consulta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (let indice = 0; indice < m_mo.length; indice++) {
        if (consultaLimpia.includes(m_mo[indice]) || consultaLimpia.includes(m_mo_s[indice])) return indice;
    }
    return -1;
}

function m_fmt_hr(horaEntera) { 
    return horaEntera < 10 ? `0${horaEntera}:00` : `${horaEntera}:00`; 
}

/* --- Algoritmos de Agregación --- */
function m_max_mes() {
    const conteoMeses = {};
    allReportesData.forEach(registro => { 
        const indiceMes = m_mo_idx(registro); 
        if (indiceMes >= 0) conteoMeses[indiceMes] = (conteoMeses[indiceMes] || 0) + 1; 
    });
    let maximoIncidentes = 0, indiceMesMaximo = -1;
    Object.entries(conteoMeses).forEach(([clave, valor]) => { 
        if (valor > maximoIncidentes) { maximoIncidentes = valor; indiceMesMaximo = parseInt(clave); } 
    });
    return indiceMesMaximo >= 0 ? `El mes con mayor cantidad de accidentes es <strong>${m_mo[indiceMesMaximo]}</strong> con <span class="mira-stat">${maximoIncidentes}</span> siniestros.` : 'Datos insuficientes.';
}

function m_max_hr(filtroMes) {
    const conteoHoras = {};
    allReportesData.forEach(registro => {
        if (filtroMes >= 0 && m_mo_idx(registro) !== filtroMes) return;
        const indiceHora = m_hr_idx(registro);
        if (indiceHora >= 0) conteoHoras[indiceHora] = (conteoHoras[indiceHora] || 0) + 1;
    });
    let maximoIncidentes = 0, indiceHoraMaximo = -1;
    Object.entries(conteoHoras).forEach(([clave, valor]) => { 
        if (valor > maximoIncidentes) { maximoIncidentes = valor; indiceHoraMaximo = parseInt(clave); } 
    });
    const etiquetaMes = filtroMes >= 0 ? `del mes de ${m_mo[filtroMes]}` : 'histórica';
    return indiceHoraMaximo >= 0 ? `La hora ${etiquetaMes} con mayor cantidad de accidentes es a las <strong>${m_fmt_hr(indiceHoraMaximo)}</strong> (<span class="mira-stat">${maximoIncidentes}</span> incidentes).` : 'No hay registros para el periodo especificado.';
}

function m_max_dia(filtroMes) {
    const conteoDias = {};
    allReportesData.forEach(registro => {
        if (filtroMes >= 0 && m_mo_idx(registro) !== filtroMes) return;
        const indiceDia = m_day_idx(registro);
        if (indiceDia >= 0) conteoDias[indiceDia] = (conteoDias[indiceDia] || 0) + 1;
    });
    let maximoIncidentes = 0, indiceDiaMaximo = -1;
    Object.entries(conteoDias).forEach(([clave, valor]) => { 
        if (valor > maximoIncidentes) { maximoIncidentes = valor; indiceDiaMaximo = parseInt(clave); } 
    });
    const etiquetaMes = filtroMes >= 0 ? `de ${m_mo[filtroMes]}` : 'a nivel general';
    return indiceDiaMaximo >= 0 ? `El día ${etiquetaMes} con más accidentes fue el <strong>${indiceDiaMaximo}</strong> con <span class="mira-stat">${maximoIncidentes}</span> incidentes.` : 'No hay registros para el periodo especificado.';
}

function calcularRangoHorario(filtroMes) {
    let incidentesManana = 0, incidentesTarde = 0, incidentesNoche = 0;
    allReportesData.forEach(registro => {
        if (filtroMes >= 0 && m_mo_idx(registro) !== filtroMes) return;
        const indiceHora = m_hr_idx(registro);
        if (indiceHora >= 0) {
            if (indiceHora >= 6 && indiceHora < 12) incidentesManana++;
            else if (indiceHora >= 12 && indiceHora < 19) incidentesTarde++;
            else incidentesNoche++;
        }
    });
    const etiquetaMes = filtroMes >= 0 ? `en <strong>${m_mo[filtroMes]}</strong>` : 'a nivel general';
    return `Distribución de accidentes ${etiquetaMes}:<br><br>` +
           `▸ Mañana (06:00-11:59): <span class="mira-stat">${incidentesManana}</span><br>` +
           `▸ Tarde (12:00-18:59): <span class="mira-stat">${incidentesTarde}</span><br>` +
           `▸ Noche (19:00-05:59): <span class="mira-stat">${incidentesNoche}</span>`;
}

function m_idx_acc(filtroMes) {
    const setDiasUnicos = new Set();
    let totalAccidentesAcumulados = 0;
    allReportesData.forEach(registro => {
        if (filtroMes >= 0 && m_mo_idx(registro) !== filtroMes) return;
        if (registro.date) { setDiasUnicos.add(registro.date); totalAccidentesAcumulados++; }
    });
    const totalDiasRegistrados = setDiasUnicos.size;
    const etiquetaMes = filtroMes >= 0 ? `en ${m_mo[filtroMes]}` : 'global';
    if (totalDiasRegistrados === 0) return `Datos insuficientes para calcular el índice ${etiquetaMes}.`;
    const indiceAccidentabilidad = (totalAccidentesAcumulados / totalDiasRegistrados).toFixed(2);
    return `<strong>Índice de accidentes ${etiquetaMes}:</strong><br>▸ <span class="mira-stat">${indiceAccidentabilidad}</span> accidentes/día (Cálculo: ${totalAccidentesAcumulados} siniestros en ${totalDiasRegistrados} días con registro).`;
}

function m_idx_vict(filtroMes, tipoVictima) {
    let totalVictimasAcumuladas = 0, totalAccidentesAcumulados = 0;
    allReportesData.forEach(registro => {
        if (filtroMes >= 0 && m_mo_idx(registro) !== filtroMes) return;
        totalAccidentesAcumulados++;
        totalVictimasAcumuladas += tipoVictima === 'fall' ? m_fall(registro) : m_her(registro);
    });
    const etiquetaMes = filtroMes >= 0 ? `en ${m_mo[filtroMes]}` : 'global';
    const etiquetaTipoVictima = tipoVictima === 'fall' ? 'Fallecidos' : 'Heridos';
    if (totalAccidentesAcumulados === 0) return `Datos insuficientes para calcular el índice ${etiquetaMes}.`;
    const indiceVictimas = (totalVictimasAcumuladas / totalAccidentesAcumulados).toFixed(2);
    return `<strong>Índice de ${etiquetaTipoVictima} ${etiquetaMes}:</strong><br>▸ <span class="mira-stat">${indiceVictimas}</span> ${etiquetaTipoVictima.toLowerCase()} por siniestro (Total: ${totalVictimasAcumuladas} en ${totalAccidentesAcumulados} accidentes).`;
}

function m_resumen() {
    const totalRegistrosSistema = allReportesData.length;
    let totalFallecidosSistema = 0, totalHeridosSistema = 0;
    allReportesData.forEach(registro => { 
        totalFallecidosSistema += m_fall(registro); 
        totalHeridosSistema += m_her(registro); 
    });
    return `<strong>📊 Resumen General de Datos</strong><br><br>` +
        `▸ Total accidentes: <span class="mira-stat">${totalRegistrosSistema}</span><br>` +
        `▸ Fallecidos totales: <span class="mira-warn">${totalFallecidosSistema}</span><br>` +
        `▸ Heridos totales: <span class="mira-stat">${totalHeridosSistema}</span><br>`;
}

function m_correlacion() {
    let incidentesConFallecidos = 0, sumaTotalFallecidos = 0, incidentesConHeridos = 0, sumaTotalHeridos = 0;
    allReportesData.forEach(registro => {
        const fallecidosActuales = m_fall(registro);
        const heridosActuales = m_her(registro);
        if(fallecidosActuales > 0) { incidentesConFallecidos++; sumaTotalFallecidos += fallecidosActuales; }
        if(heridosActuales > 0) { incidentesConHeridos++; sumaTotalHeridos += heridosActuales; }
    });
    return `<strong>🔗 Correlación de Gravedad</strong><br><br>` +
           `▸ Accidentes con heridos: <span class="mira-stat">${incidentesConHeridos}</span> (Suma total: ${sumaTotalHeridos})<br>` +
           `▸ Accidentes con fallecidos: <span class="mira-warn">${incidentesConFallecidos}</span> (Suma total: ${sumaTotalFallecidos})<br>`;
}

/* --- API Gemini --- */
async function llamarApiGemini(consultaUsuario, datosContexto) {
    try {
        if (!datosContexto || datosContexto.length === 0) return null;
        
        const datosMinimizados = datosContexto.map(registro => ({ 
            mes: m_mo_idx(registro), 
            hora: m_hr_idx(registro), 
            fallecidos: m_fall(registro), 
            heridos: m_her(registro) 
        }));

        const respuestaPeticionRed = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ 
                    parts: [{ 
                        text: `Rol: Analista SIG. Datos enviados: ${JSON.stringify(datosMinimizados)}. Responde brevemente y con datos exactos a: ${consultaUsuario}` 
                    }] 
                }]
            })
        });

        if (!respuestaPeticionRed.ok) throw new Error('Fallo en la respuesta de la API Gemini');
        
        const respuestaJson = await respuestaPeticionRed.json();
        let textoGenerado = respuestaJson.candidates[0].content.parts[0].text;
        
        return textoGenerado
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

    } catch (errorPeticion) {
        console.warn("Fallo API Gemini. Activando contingencia local MIRA.", errorPeticion);
        return null;
    }
}

/* --- NLP Engine Local --- */
function miraProc(consultaUsuario) {
    if (!allReportesData || allReportesData.length === 0)
        return '<span class="mira-warn">⚠ Sin datos. Sincronización pendiente con Supabase.</span>';

    const consultaLimpia = consultaUsuario.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filtroMes = m_det_mo(consultaUsuario);

    if (/resumen/.test(consultaLimpia)) return m_resumen();
    if (/correlacion/.test(consultaLimpia)) return m_correlacion();

    if (/(manana|tarde|noche|madrugada)/.test(consultaLimpia)) return calcularRangoHorario(filtroMes);

    if (/hora.*mas.*accidente/.test(consultaLimpia)) return m_max_hr(filtroMes);
    if (/dia.*mas.*accidente/.test(consultaLimpia)) return m_max_dia(filtroMes);
    if (/mas.*accidente/.test(consultaLimpia)) return m_max_mes();
    
    if (/indice.*accidente/.test(consultaLimpia)) return m_idx_acc(filtroMes);
    if (/indice.*herido/.test(consultaLimpia)) return m_idx_vict(filtroMes, 'her');
    if (/indice.*fallecido|indice.*muert/.test(consultaLimpia)) return m_idx_vict(filtroMes, 'fall');

    return `Sintaxis no reconocida por contingencia local. Consultas soportadas:<br>` +
           `▸ "Mes con mayor cantidad de accidentes"<br>` +
           `▸ "Accidentes en febrero en la mañana o tarde"<br>` +
           `▸ "Dia de mayo con mas accidentes"<br>` +
           `▸ "Indice de accidentes en junio"<br>` +
           `▸ "Indices de fallecidos"`;
}
