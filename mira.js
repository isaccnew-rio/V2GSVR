/* ============================================================
   MIRA — Modelo de Inteligencia para Registro de Accidentes
   Acceso estricto: allReportesData (hora, date, Fallecidos, Heridos, descripcion)
   ============================================================ */

const m_mo = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const m_mo_s = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const ds_ak = 'sk-3155da9139b14cbc9625e3319a7e1486';

/* --- UI Toggle --- */
function toggleMira() {
    const p = document.getElementById('miraPanel');
    const f = document.getElementById('miraFab');
    p.classList.toggle('mira-hidden');
    f.style.display = p.classList.contains('mira-hidden') ? 'flex' : 'none';
}

function miraChip(txt) { 
    document.getElementById('miraInput').value = txt; 
    miraSend(); 
}

async function miraSend() {
    const i = document.getElementById('miraInput');
    const q = i.value.trim();
    if (!q) return;
    i.value = '';
    m_msg(q, 'user');
    m_typ_s();

    try {
        const d_flt = allReportesData.map(r => ({
            dt: r.date || '',
            hr: r.hora || '',
            f: m_fall(r),
            h: m_her(r),
            d: r.descripcion || ''
        }));

        const sys_p = `Eres MIRA. Responde a la consulta basándote ÚNICA Y EXCLUSIVAMENTE en este JSON de accidentes: ${JSON.stringify(d_flt)}. Los campos son dt(fecha), hr(hora), f(fallecidos), h(heridos), d(descripción). NO busques en la web. NO inventes información. Si la respuesta no está en el JSON, indica que no tienes registros. Sé concreto y estructurado.`;

        const req = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ds_ak}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: sys_p },
                    { role: 'user', content: q }
                ],
                temperature: 0.1
            })
        });

        if (!req.ok) throw new Error('API Exhausted or Error');

        const ds_res = await req.json();
        const txt_r = ds_res.choices[0].message.content;
        
        m_typ_h();
        m_msg(txt_r, 'bot');

    } catch (err) {
        setTimeout(() => { 
            m_typ_h(); 
            m_msg(miraProc(q), 'bot'); 
        }, 600);
    }
}

function m_msg(h, w) {
    const b = document.getElementById('miraBody');
    const w_el = b.querySelector('.mira-welcome');
    if (w_el) w_el.remove();
    const d = document.createElement('div');
    d.className = `mira-msg mira-msg-${w}`;
    d.innerHTML = `<div class="mira-bubble">${h}</div>`;
    b.appendChild(d);
    b.scrollTop = b.scrollHeight;
}

function m_typ_s() {
    const b = document.getElementById('miraBody');
    const d = document.createElement('div');
    d.className = 'mira-msg mira-msg-bot mira-typing-wrap';
    d.innerHTML = '<div class="mira-typing"><span></span><span></span><span></span></div>';
    b.appendChild(d);
    b.scrollTop = b.scrollHeight;
}

function m_typ_h() {
    const t = document.querySelector('.mira-typing-wrap');
    if (t) t.remove();
}

/* --- Parseo de Datos --- */
function m_dt(i) {
    if (i.date && typeof i.date === 'string' && i.date.length >= 10) {
        const p = i.date.split('-');
        return new Date(p[0], p[1] - 1, p[2]);
    }
    return null;
}

function m_mo_idx(i) { const d = m_dt(i); return d ? d.getMonth() : -1; }
function m_hr_idx(i) { return i.hora ? parseInt(i.hora.toString().split(':')[0], 10) : -1; }
function m_day_idx(i) { const d = m_dt(i); return d ? d.getDate() : -1; }

function m_fall(i) { 
    const v = i.Fallecidos; 
    return (v === 'NULL' || v === null || v === undefined) ? 0 : parseInt(v); 
}

function m_her(i) { 
    const v = i.Heridos; 
    return (v === 'NULL' || v === null || v === undefined) ? 0 : parseInt(v); 
}

function m_det_mo(q) {
    const ql = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (let i = 0; i < m_mo.length; i++) {
        if (ql.includes(m_mo[i]) || ql.includes(m_mo_s[i])) return i;
    }
    return -1;
}

function m_fmt_hr(h) { return h < 10 ? `0${h}:00` : `${h}:00`; }

/* --- Algoritmos de Agregación --- */
function m_max_mes() {
    const c = {};
    allReportesData.forEach(r => { const m = m_mo_idx(r); if (m >= 0) c[m] = (c[m] || 0) + 1; });
    let mx = 0, m_idx = -1;
    Object.entries(c).forEach(([k, v]) => { if (v > mx) { mx = v; m_idx = parseInt(k); } });
    return m_idx >= 0 ? `El mes con mayor cantidad de accidentes es <strong>${m_mo[m_idx]}</strong> con <span class="mira-stat">${mx}</span> siniestros.` : 'Datos insuficientes.';
}

function m_max_hr(m_fltr) {
    const c = {};
    allReportesData.forEach(r => {
        if (m_fltr >= 0 && m_mo_idx(r) !== m_fltr) return;
        const h = m_hr_idx(r);
        if (h >= 0) c[h] = (c[h] || 0) + 1;
    });
    let mx = 0, h_idx = -1;
    Object.entries(c).forEach(([k, v]) => { if (v > mx) { mx = v; h_idx = parseInt(k); } });
    const lbl = m_fltr >= 0 ? `del mes de ${m_mo[m_fltr]}` : 'histórica';
    return h_idx >= 0 ? `La hora ${lbl} con mayor cantidad de accidentes es a las <strong>${m_fmt_hr(h_idx)}</strong> (<span class="mira-stat">${mx}</span> incidentes).` : 'No hay registros para el periodo especificado.';
}

function m_max_dia(m_fltr) {
    const c = {};
    allReportesData.forEach(r => {
        if (m_fltr >= 0 && m_mo_idx(r) !== m_fltr) return;
        const d = m_day_idx(r);
        if (d >= 0) c[d] = (c[d] || 0) + 1;
    });
    let mx = 0, d_idx = -1;
    Object.entries(c).forEach(([k, v]) => { if (v > mx) { mx = v; d_idx = parseInt(k); } });
    const lbl = m_fltr >= 0 ? `de ${m_mo[m_fltr]}` : 'a nivel general';
    return d_idx >= 0 ? `El día ${lbl} con más accidentes fue el <strong>${d_idx}</strong> con <span class="mira-stat">${mx}</span> incidentes.` : 'No hay registros para el periodo especificado.';
}

function m_idx_acc(m_fltr) {
    const d_set = new Set();
    let acc = 0;
    allReportesData.forEach(r => {
        if (m_fltr >= 0 && m_mo_idx(r) !== m_fltr) return;
        if (r.date) { d_set.add(r.date); acc++; }
    });
    const d_tot = d_set.size;
    const lbl = m_fltr >= 0 ? `en ${m_mo[m_fltr]}` : 'global';
    if (d_tot === 0) return `Datos insuficientes para calcular el índice ${lbl}.`;
    const idx = (acc / d_tot).toFixed(2);
    return `<strong>Índice de accidentes ${lbl}:</strong><br>▸ <span class="mira-stat">${idx}</span> accidentes/día (Cálculo: ${acc} siniestros en ${d_tot} días con registro).`;
}

function m_idx_vict(m_fltr, v_type) {
    let v_tot = 0, acc = 0;
    allReportesData.forEach(r => {
        if (m_fltr >= 0 && m_mo_idx(r) !== m_fltr) return;
        acc++;
        v_tot += v_type === 'fall' ? m_fall(r) : m_her(r);
    });
    const lbl = m_fltr >= 0 ? `en ${m_mo[m_fltr]}` : 'global';
    const t_lbl = v_type === 'fall' ? 'Fallecidos' : 'Heridos';
    if (acc === 0) return `Datos insuficientes para calcular el índice ${lbl}.`;
    const idx = (v_tot / acc).toFixed(2);
    return `<strong>Índice de ${t_lbl} ${lbl}:</strong><br>▸ <span class="mira-stat">${idx}</span> ${t_lbl.toLowerCase()} por siniestro (Total: ${v_tot} en ${acc} accidentes).`;
}

function m_resumen() {
    const t = allReportesData.length;
    let f = 0, h = 0;
    allReportesData.forEach(r => { f += m_fall(r); h += m_her(r); });
    return `<strong>📊 Resumen General de Datos</strong><br><br>` +
        `▸ Total accidentes: <span class="mira-stat">${t}</span><br>` +
        `▸ Fallecidos totales: <span class="mira-warn">${f}</span><br>` +
        `▸ Heridos totales: <span class="mira-stat">${h}</span><br>`;
}

function m_correlacion() {
    let f_acc = 0, f_tot = 0, h_acc = 0, h_tot = 0;
    allReportesData.forEach(r => {
        const f = m_fall(r);
        const h = m_her(r);
        if(f > 0) { f_acc++; f_tot += f; }
        if(h > 0) { h_acc++; h_tot += h; }
    });
    return `<strong>🔗 Correlación de Gravedad</strong><br><br>` +
           `▸ Accidentes con heridos: <span class="mira-stat">${h_acc}</span> (Suma total: ${h_tot})<br>` +
           `▸ Accidentes con fallecidos: <span class="mira-warn">${f_acc}</span> (Suma total: ${f_tot})<br>`;
}

/* --- NLP Engine --- */
function miraProc(q) {
    if (!allReportesData || allReportesData.length === 0)
        return '<span class="mira-warn">⚠ Sin datos. Sincronización pendiente con Supabase.</span>';

    const ql = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const m_fltr = m_det_mo(q);

    if (/resumen/.test(ql)) return m_resumen();
    if (/correlacion/.test(ql)) return m_correlacion();

    if (/mes.*mayor.*accidente|mes.*mas.*accidente/.test(ql)) return m_max_mes();
    if (/hora.*mayor.*accidente|hora.*mas.*accidente/.test(ql)) return m_max_hr(m_fltr);
    if (/dia.*mayor.*accidente|dia.*mas.*accidente/.test(ql)) return m_max_dia(m_fltr);
    
    if (/indice.*accidente/.test(ql)) return m_idx_acc(m_fltr);
    if (/indice.*herido/.test(ql)) return m_idx_vict(m_fltr, 'her');
    if (/indice.*fallecido|indice.*muert/.test(ql)) return m_idx_vict(m_fltr, 'fall');

    if (!/(accidente|herido|fallecido|muert|resumen|correlacion|indice)/.test(ql)) {
        return `⚠ Consulta fuera de alcance (Out-of-Scope). MIRA analiza exclusivamente: <strong>hora, fecha, fallecidos y heridos</strong> registrados en Supabase.`;
    }

    return `Sintaxis no reconocida. Consultas soportadas:<br>` +
           `▸ "Cual es el mes con mayor cantidad de accidentes"<br>` +
           `▸ "Hora del mes de abril con mayor cantidad de accidentes"<br>` +
           `▸ "Dia de mayo con mas accidentes"<br>` +
           `▸ "Indice de accidentes en junio"<br>` +
           `▸ "Indices de fallecidos"`;
}
