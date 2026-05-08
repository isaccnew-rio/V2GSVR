/* ============================================================
   MIRA — Motor de Inteligencia para Reportes de Accidentalidad
   Accede exclusivamente a: allReportesData (hora, date, Fallecidos, Heridos)
   ============================================================ */

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MESES_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

/* --- UI Toggle --- */
function toggleMira() {
    const p = document.getElementById('miraPanel');
    const f = document.getElementById('miraFab');
    p.classList.toggle('mira-hidden');
    f.style.display = p.classList.contains('mira-hidden') ? 'flex' : 'none';
}

function miraChip(txt) { document.getElementById('miraInput').value = txt; miraSend(); }

function miraSend() {
    const inp = document.getElementById('miraInput');
    const q = inp.value.trim();
    if (!q) return;
    inp.value = '';
    miraAddMsg(q, 'user');
    miraShowTyping();
    setTimeout(() => { miraRemoveTyping(); miraAddMsg(miraProc(q), 'bot'); }, 600);
}

function miraAddMsg(html, who) {
    const body = document.getElementById('miraBody');
    const wel = body.querySelector('.mira-welcome');
    if (wel) wel.remove();
    const d = document.createElement('div');
    d.className = `mira-msg mira-msg-${who}`;
    d.innerHTML = `<div class="mira-bubble">${html}</div>`;
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
}

function miraShowTyping() {
    const body = document.getElementById('miraBody');
    const d = document.createElement('div');
    d.className = 'mira-msg mira-msg-bot mira-typing-wrap';
    d.innerHTML = '<div class="mira-typing"><span></span><span></span><span></span></div>';
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
}

function miraRemoveTyping() {
    const t = document.querySelector('.mira-typing-wrap');
    if (t) t.remove();
}

/* --- Helpers --- */
function mGetDate(item) {
    if (item.date && typeof item.date === 'string' && item.date.length >= 10) {
        const p = item.date.split('-');
        return new Date(p[0], p[1] - 1, p[2]);
    }
    const fb = item.fecha_reporte || item.fecha || item.created_at;
    if (fb) { const d = new Date(fb); if (!isNaN(d)) return d; }
    return null;
}

function mGetMonth(item) { const d = mGetDate(item); return d ? d.getMonth() : -1; }
function mGetHr(item) { return item.hora ? parseInt(item.hora.toString().split(':')[0], 10) : -1; }
function mGetFall(item) { return parseInt(item.Fallecidos || 0); }
function mGetHer(item) { return parseInt(item.Heridos || 0); }

function mDetectMes(q) {
    const ql = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (let i = 0; i < MESES.length; i++) {
        const mn = MESES[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (ql.includes(mn) || ql.includes(MESES_SHORT[i])) return i;
    }
    return -1;
}

function mFmtHr(h) { return h < 10 ? `0${h}:00` : `${h}:00`; }

/* --- Core Analysis Functions --- */
function mConteoMensual() {
    const c = {};
    allReportesData.forEach(r => { const m = mGetMonth(r); if (m >= 0) c[m] = (c[m] || 0) + 1; });
    return c;
}

function mMaxFechaSiniestros() {
    const c = {};
    allReportesData.forEach(r => { const d = mGetDate(r); if (d) { const k = d.toISOString().split('T')[0]; c[k] = (c[k] || 0) + 1; } });
    let mx = 0, mxd = '';
    Object.entries(c).forEach(([k, v]) => { if (v > mx) { mx = v; mxd = k; } });
    return { date: mxd, count: mx };
}

function mHoraPico(mes) {
    const c = {};
    allReportesData.forEach(r => {
        if (mes >= 0 && mGetMonth(r) !== mes) return;
        const h = mGetHr(r);
        if (h >= 0) c[h] = (c[h] || 0) + 1;
    });
    let mx = 0, mxh = -1;
    Object.entries(c).forEach(([k, v]) => { if (v > mx) { mx = v; mxh = parseInt(k); } });
    const top3 = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { peak: mxh, count: mx, top3 };
}

function mCorrelacion(campo) {
    const mc = {};
    allReportesData.forEach(r => {
        const m = mGetMonth(r);
        if (m < 0) return;
        if (!mc[m]) mc[m] = { acc: 0, val: 0 };
        mc[m].acc++;
        mc[m].val += campo === 'fall' ? mGetFall(r) : mGetHer(r);
    });
    return mc;
}

function mResumen() {
    const total = allReportesData.length;
    let fall = 0, her = 0;
    allReportesData.forEach(r => { fall += mGetFall(r); her += mGetHer(r); });
    const cm = mConteoMensual();
    const mx = mMaxFechaSiniestros();
    const hp = mHoraPico(-1);
    let mesMax = 0, mesMaxN = '';
    Object.entries(cm).forEach(([k, v]) => { if (v > mesMax) { mesMax = v; mesMaxN = MESES[k]; } });
    return `<strong>📊 Resumen General de Datos</strong><br><br>` +
        `▸ Total registros: <span class="mira-stat">${total}</span><br>` +
        `▸ Fallecidos totales: <span class="mira-warn">${fall}</span><br>` +
        `▸ Heridos totales: <span class="mira-stat">${her}</span><br>` +
        `▸ Mes con más siniestros: <span class="mira-stat">${mesMaxN} (${mesMax})</span><br>` +
        `▸ Fecha con máximo histórico: <span class="mira-stat">${mx.date} (${mx.count})</span><br>` +
        `▸ Hora pico global: <span class="mira-stat">${hp.peak >= 0 ? mFmtHr(hp.peak) : 'N/D'} (${hp.count} inc.)</span>`;
}

/* --- NLP Processor --- */
function miraProc(q) {
    if (!allReportesData || allReportesData.length === 0)
        return '<span class="mira-warn">⚠ Sin datos. Espera a que Supabase sincronice.</span>';

    const ql = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mes = mDetectMes(q);

    // Resumen
    if (/resumen|general|total|overview/.test(ql)) return mResumen();

    // Conteo mensual
    if (/conteo|mensual|por mes|meses|cuantos/.test(ql)) {
        const cm = mConteoMensual();
        let out = '<strong>📅 Conteo Mensual de Siniestros</strong><br><br>';
        Object.keys(cm).sort((a, b) => a - b).forEach(k => {
            out += `▸ ${MESES[k]}: <span class="mira-stat">${cm[k]}</span><br>`;
        });
        return out;
    }

    // Hora pico
    if (/hora|pico|horari|recurrencia|peak/.test(ql)) {
        const hp = mHoraPico(mes);
        const label = mes >= 0 ? MESES[mes] : 'todos los meses';
        let out = `<strong>🕐 Análisis Horario — ${label}</strong><br><br>`;
        out += `▸ Hora pico: <span class="mira-stat">${hp.peak >= 0 ? mFmtHr(hp.peak) : 'N/D'}</span> (${hp.count} incidentes)<br><br>`;
        out += `<strong>Top 3 horas:</strong><br>`;
        hp.top3.forEach(([h, c], i) => {
            out += `${i + 1}. ${mFmtHr(parseInt(h))} → <span class="mira-stat">${c}</span> inc.<br>`;
        });
        return out;
    }

    // Fecha máxima
    if (/fecha|maximo|historico|max|record|critico|critica/.test(ql)) {
        const mx = mMaxFechaSiniestros();
        return `<strong>🔴 Máximo Histórico</strong><br><br>` +
            `▸ Fecha: <span class="mira-stat">${mx.date}</span><br>` +
            `▸ Siniestros: <span class="mira-stat">${mx.count}</span>`;
    }

    // Correlación
    if (/correlacion|relacion|versus|vs/.test(ql)) {
        const esFall = /fallecido|fall|muerte|fatal/.test(ql);
        const label = esFall ? 'Fallecidos' : 'Heridos';
        const mc = mCorrelacion(esFall ? 'fall' : 'her');
        let out = `<strong>🔗 Correlación Accidentes vs ${label}</strong><br><br>`;
        Object.keys(mc).sort((a, b) => a - b).forEach(k => {
            const r = mc[k];
            const ratio = r.acc > 0 ? (r.val / r.acc).toFixed(2) : '0';
            out += `▸ ${MESES[k]}: ${r.acc} acc. / ${r.val} ${label.toLowerCase()} — ratio: <span class="mira-stat">${ratio}</span><br>`;
        });
        return out;
    }

    // Fallecidos / Heridos por mes
    if (/fallecido|fall|muerte|herido|herid|victima/.test(ql)) {
        const esFall = /fallecido|fall|muerte|fatal/.test(ql);
        const label = esFall ? 'Fallecidos' : 'Heridos';
        const mc = {};
        allReportesData.forEach(r => {
            const m = mGetMonth(r);
            if (m < 0) return;
            mc[m] = (mc[m] || 0) + (esFall ? mGetFall(r) : mGetHer(r));
        });
        let t = 0, out = `<strong>${esFall ? '💀' : '🏥'} ${label} por Mes</strong><br><br>`;
        Object.keys(mc).sort((a, b) => a - b).forEach(k => { t += mc[k]; out += `▸ ${MESES[k]}: <span class="mira-stat">${mc[k]}</span><br>`; });
        out += `<br>Total: <span class="mira-warn">${t}</span>`;
        return out;
    }

    // Mes específico
    if (mes >= 0) {
        const data = allReportesData.filter(r => mGetMonth(r) === mes);
        let fall = 0, her = 0;
        data.forEach(r => { fall += mGetFall(r); her += mGetHer(r); });
        const hp = mHoraPico(mes);
        return `<strong>📅 Análisis de ${MESES[mes]}</strong><br><br>` +
            `▸ Siniestros: <span class="mira-stat">${data.length}</span><br>` +
            `▸ Fallecidos: <span class="mira-warn">${fall}</span><br>` +
            `▸ Heridos: <span class="mira-stat">${her}</span><br>` +
            `▸ Hora pico: <span class="mira-stat">${hp.peak >= 0 ? mFmtHr(hp.peak) : 'N/D'}</span>`;
    }

    // Fallback
    return `<strong>ℹ Consultas disponibles:</strong><br><br>` +
        `▸ "resumen general"<br>` +
        `▸ "conteo mensual"<br>` +
        `▸ "hora pico" / "hora pico en enero"<br>` +
        `▸ "fecha con máximo histórico"<br>` +
        `▸ "correlación heridos"<br>` +
        `▸ "fallecidos por mes"<br>` +
        `▸ Nombre de un mes (ej: "marzo")`;
}
