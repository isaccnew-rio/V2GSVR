const m_mo = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const m_mo_s = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const g_k = 'AIzaSyAIEnAZ0fkGaQcvaxK-g_xvgn3VXZXTE-I';
const mx_q = 50; 

function t_mira() {
    const p = document.getElementById('miraPanel');
    const f = document.getElementById('miraFab');
    p.classList.toggle('mira-hidden');
    f.style.display = p.classList.contains('mira-hidden') ? 'flex' : 'none';
}

function miraChip(txt) { 
    document.getElementById('miraInput').value = txt; 
    miraSend(); 
}

function chk_q() {
    const d = new Date().toDateString();
    const l_d = localStorage.getItem('m_d');
    let q = parseInt(localStorage.getItem('m_q')) || 0;
    if (l_d !== d) {
        localStorage.setItem('m_d', d);
        localStorage.setItem('m_q', '0');
        return true;
    }
    return q < mx_q;
}

function add_q() {
    let q = parseInt(localStorage.getItem('m_q')) || 0;
    localStorage.setItem('m_q', (q + 1).toString());
}

async function miraSend() {
    const i = document.getElementById('miraInput');
    const q = i.value.trim();
    if (!q) return;
    i.value = '';
    m_msg(q, 'user');
    m_typ_s();

    let res = '';
    
    if (!allReportesData || allReportesData.length === 0) {
        res = '<span class="mira-warn">⚠ Sin datos. Sincronización pendiente con Supabase.</span>';
    } else {
        if (chk_q()) {
            res = await llm_p(q);
        } else {
            res = miraProc(q);
        }
    }

    m_typ_h();
    m_msg(res, 'bot');
}

async function llm_p(q) {
    const ctx = allReportesData.map(r => ({
        d: r.date || 'ND',
        h: r.hora || 'ND',
        f: m_fall(r),
        hr: m_her(r)
    }));

    const p = `Eres MIRA, analista del Geoportal de Accidentes Riobamba.
    Datos JSON (d:fecha, h:hora, f:fallecidos, hr:heridos): ${JSON.stringify(ctx)}
    Consulta: "${q}"
    Reglas: Responde técnico, concreto, sin saludos. Usa HTML básico (<strong>, <br>) para formatear la respuesta. Si la consulta se sale del contexto vial, indícalo.`;

    try {
        const req = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${g_k}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: p }] }] })
        });

        if (req.status === 429) return miraProc(q); 

        const j = await req.json();
        if(j.error) throw new Error(j.error.message);
        
        add_q();
        let txt = j.candidates[0].content.parts[0].text;
        return txt.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    } catch (e) {
        return miraProc(q);
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
    d.className = 'mira-msg mira-msg-bot m-typ-w';
    d.innerHTML = '<div class="mira-typing"><span></span><span></span><span></span></div>';
    b.appendChild(d);
    b.scrollTop = b.scrollHeight;
}

function m_typ_h() {
    const t = document.querySelector('.m-typ-w');
    if (t) t.remove();
}

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

function m_max_m() {
    const c = {};
    allReportesData.forEach(r => { const m = m_mo_idx(r); if (m >= 0) c[m] = (c[m] || 0) + 1; });
    let mx = 0, id = -1;
    Object.entries(c).forEach(([k, v]) => { if (v > mx) { mx = v; id = parseInt(k); } });
    return id >= 0 ? `Mes con más accidentes: <strong>${m_mo[id]}</strong> (<span class="mira-stat">${mx}</span>).` : 'Datos insuficientes.';
}

function m_max_h(mf) {
    const c = {};
    allReportesData.forEach(r => {
        if (mf >= 0 && m_mo_idx(r) !== mf) return;
        const h = m_hr_idx(r);
        if (h >= 0) c[h] = (c[h] || 0) + 1;
    });
    let mx = 0, id = -1;
    Object.entries(c).forEach(([k, v]) => { if (v > mx) { mx = v; id = parseInt(k); } });
    const lbl = mf >= 0 ? `en ${m_mo[mf]}` : 'histórica';
    return id >= 0 ? `Hora ${lbl} con más incidentes: <strong>${m_fmt_hr(id)}</strong> (<span class="mira-stat">${mx}</span>).` : 'Sin registros.';
}

function m_max_d(mf) {
    const c = {};
    allReportesData.forEach(r => {
        if (mf >= 0 && m_mo_idx(r) !== mf) return;
        const d = m_day_idx(r);
        if (d >= 0) c[d] = (c[d] || 0) + 1;
    });
    let mx = 0, id = -1;
    Object.entries(c).forEach(([k, v]) => { if (v > mx) { mx = v; id = parseInt(k); } });
    const lbl = mf >= 0 ? `de ${m_mo[mf]}` : 'general';
    return id >= 0 ? `Día ${lbl} con más incidentes: <strong>${id}</strong> (<span class="mira-stat">${mx}</span>).` : 'Sin registros.';
}

function m_id_a(mf) {
    const ds = new Set();
    let ac = 0;
    allReportesData.forEach(r => {
        if (mf >= 0 && m_mo_idx(r) !== mf) return;
        if (r.date) { ds.add(r.date); ac++; }
    });
    const dt = ds.size;
    const lbl = mf >= 0 ? `en ${m_mo[mf]}` : 'global';
    if (dt === 0) return `Datos insuficientes.`;
    const idx = (ac / dt).toFixed(2);
    return `<strong>Índice ${lbl}:</strong><br>▸ <span class="mira-stat">${idx}</span> acc/día (${ac} en ${dt} días).`;
}

function m_id_v(mf, vt) {
    let v_t = 0, ac = 0;
    allReportesData.forEach(r => {
        if (mf >= 0 && m_mo_idx(r) !== mf) return;
        ac++;
        v_t += vt === 'f' ? m_fall(r) : m_her(r);
    });
    const lbl = mf >= 0 ? `en ${m_mo[mf]}` : 'global';
    const tl = vt === 'f' ? 'Fallecidos' : 'Heridos';
    if (ac === 0) return `Datos insuficientes.`;
    const idx = (v_t / ac).toFixed(2);
    return `<strong>Índice ${tl} ${lbl}:</strong><br>▸ <span class="mira-stat">${idx}</span> por siniestro (${v_t} en ${ac} acc).`;
}

function m_res() {
    const t = allReportesData.length;
    let f = 0, h = 0;
    allReportesData.forEach(r => { f += m_fall(r); h += m_her(r); });
    return `<strong>📊 Resumen General</strong><br><br>` +
        `▸ Accidentes: <span class="mira-stat">${t}</span><br>` +
        `▸ Fallecidos: <span class="mira-warn">${f}</span><br>` +
        `▸ Heridos: <span class="mira-stat">${h}</span><br>`;
}

function m_cor() {
    let fa = 0, ft = 0, ha = 0, ht = 0;
    allReportesData.forEach(r => {
        const f = m_fall(r);
        const h = m_her(r);
        if(f > 0) { fa++; ft += f; }
        if(h > 0) { ha++; ht += h; }
    });
    return `<strong>🔗 Correlación de Gravedad</strong><br><br>` +
           `▸ Acc con heridos: <span class="mira-stat">${ha}</span> (Suma: ${ht})<br>` +
           `▸ Acc con fallecidos: <span class="mira-warn">${fa}</span> (Suma: ${ft})<br>`;
}

function miraProc(q) {
    const ql = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mf = m_det_mo(q);

    if (/resumen/.test(ql)) return m_res();
    if (/correlacion/.test(ql)) return m_cor();
    if (/mes.*mayor.*accidente|mes.*mas.*accidente/.test(ql)) return m_max_m();
    if (/hora.*mayor.*accidente|hora.*mas.*accidente/.test(ql)) return m_max_h(mf);
    if (/dia.*mayor.*accidente|dia.*mas.*accidente/.test(ql)) return m_max_d(mf);
    if (/indice.*accidente/.test(ql)) return m_id_a(mf);
    if (/indice.*herido/.test(ql)) return m_id_v(mf, 'h');
    if (/indice.*fallecido|indice.*muert/.test(ql)) return m_id_v(mf, 'f');

    if (!/(accidente|herido|fallecido|muert|resumen|correlacion|indice)/.test(ql)) {
        return `⚠ Fuera de alcance. Solo análisis: fecha, hora, heridos, fallecidos.`;
    }

    return `Sintaxis no reconocida. Pruebe:<br>` +
           `▸ "Mes con mas accidentes"<br>` +
           `▸ "Hora con mas accidentes en abril"<br>` +
           `▸ "Indice de accidentes"`;
}
