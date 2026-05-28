const SUPABASE_URL = 'https://pnaobmyaugbccfwwhyob.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYW9ibXlhdWdiY2Nmd3doeW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQwMzcsImV4cCI6MjA4MzkxMDAzN30.-TwJWOKZWXNDq2u789-dRcX--yA4fWjGSgHc-Zr-ny4';

const map = L.map('map').setView([-1.6635, -78.6547], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

let perimetroLayerGroup = L.layerGroup();
let reportesLayerGroup = L.layerGroup();
let heatmapLayer = null;
let tempMarker = null;

let allReportesData = [];
let urbanPolygons = []; 

let chartInstanceType = null;
let chartInstanceTime = null;

function togglePanel() {
    const p = document.getElementById('mainPanel');
    const t = document.getElementById('panelToggle');
    p.classList.toggle('open');
    t.textContent = p.classList.contains('open') ? '✕' : '☰';
}

function toggleDashboard() {
    const m = document.getElementById('dashboardModal');
    if (m.style.display !== 'flex') {
        actualizarDashboard();
        m.style.display = 'flex';
    } else {
        m.style.display = 'none';
    }
}

function mostrarEstadoForm(m, t) {
    const s = document.getElementById('formStatus');
    s.textContent = m;
    s.className = `form-status ${t}`;
    s.style.display = 'block';
    setTimeout(() => { s.style.display = 'none'; }, 3000);
}

function normalizarTexto(t) {
    if (!t) return 'No especificado';
    let l = t.toString().toLowerCase().replace(/_/g, ' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return l.charAt(0).toUpperCase() + l.slice(1);
}

function encontrarFecha(i) {
    if (i.date && typeof i.date === 'string' && i.date.length >= 10) {
        const p = i.date.split('-');
        return new Date(p[0], p[1] - 1, p[2]); 
    }
    const fFallback = i.fecha_reporte || i.fecha || i.created_at;
    if (fFallback) {
        let f = new Date(fFallback);
        if (!isNaN(f)) {
            f.setTime(f.getTime() - (5 * 60 * 60 * 1000)); 
            return f;
        }
    }
    return null;
}

function encontrarTipo(i) {
    return i.sv || i.tipo_reporte || i.tipo_incidente || i.tipo || 'Colisión Vehicular';
}

function isPointInPolygon(pt, vs) {
    var x = pt[0], y = pt[1];
    var ins = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        var int = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (int) ins = !ins;
    }
    return ins;
}

function validarUbicacionUrbana(lat, lng) {
    if (urbanPolygons.length === 0) return true; 
    const pt = [lng, lat]; 
    let ind = false;
    for (let gj of urbanPolygons) {
        if (gj.type === 'Polygon') {
            if (isPointInPolygon(pt, gj.coordinates[0])) { ind = true; break; }
        } else if (gj.type === 'MultiPolygon') {
            for (let pc of gj.coordinates) {
                if (isPointInPolygon(pt, pc[0])) { ind = true; break; }
            }
        }
    }
    return ind;
}

function filtrarPorFecha(d, fIni, fFin) {
    const s = fIni ? new Date(fIni) : new Date('2000-01-01');
    let e = fFin ? new Date(fFin) : new Date();
    e.setHours(23, 59, 59, 999);
    return d.filter(i => {
        const fi = encontrarFecha(i);
        if (!fi) return true; 
        return fi >= s && fi <= e;
    });
}

function renderizarMarcadores(d, lg, op) {
    d.forEach(i => {
        let g = parseGeom(i);
        if (g) {
            const m = L.circleMarker([g.lat, g.lng], {
                radius: op.radius || 5,
                fillColor: op.color || "#ff0000",
                color: "#000",
                weight: 1,
                opacity: 1,
                fillOpacity: op.fillOpacity || 0.7
            });
            if (op.popupFormatter) m.bindPopup(op.popupFormatter(i));
            m.addTo(lg);
        }
    });
}

function renderizarCapas(fIni = null, fFin = null) {
    reportesLayerGroup.clearLayers();
    const repF = filtrarPorFecha(allReportesData, fIni, fFin);
    renderizarMarcadores(repF, reportesLayerGroup, {
        radius: 6, color: "#ffa500", fillOpacity: 0.8,
        popupFormatter: (i) => {
            let tBonito = normalizarTexto(encontrarTipo(i));
            const f = encontrarFecha(i);
            let vStr = '';
            if(parseInt(i.Fallecidos || 0) > 0) vStr += `<br><span style="color:red;">Fallecidos: ${i.Fallecidos}</span>`;
            if(parseInt(i.Heridos || 0) > 0) vStr += `<br><span style="color:orange;">Heridos: ${i.Heridos}</span>`;
            return `<b>${tBonito}</b><br><span style="font-size:10px;">${f ? f.toLocaleDateString('es-EC') : 'Reciente'}</span>${vStr}<br>${i.descripcion || ''}`;
        }
    });
    actualizarHeatmap(repF);
    actualizarDashboard(repF);
}

function aplicarFiltrosFecha() {
    renderizarCapas(document.getElementById('dateStart').value, document.getElementById('dateEnd').value);
}

function parseGeom(i) {
    if (i.latitud && i.longitud) return { lat: parseFloat(i.latitud), lng: parseFloat(i.longitud) };
    let g = i.geom || i.geometry || i.geojson;
    if (typeof g === 'string') try { g = JSON.parse(g); } catch (e) { }
    if (g && g.coordinates) return { lat: g.coordinates[1], lng: g.coordinates[0] };
    return null;
}

function actualizarHeatmap(d) {
    let pts = [];
    if (d) {
        d.forEach(i => {
            if (normalizarTexto(encontrarTipo(i)) === 'Colision vehicular') { 
                let g = parseGeom(i);
                if(g) pts.push([g.lat, g.lng, 1.0]); 
            }
        });
    }
    if (heatmapLayer) map.removeLayer(heatmapLayer);
    if (pts.length > 0 && typeof L.heatLayer === 'function') {
        heatmapLayer = L.heatLayer(pts, { radius: 40, blur: 25, maxZoom: 15, max: 3.0, minOpacity: 0.5, gradient: { 0.3: 'blue', 0.6: 'yellow', 1.0: 'red' } });
        if (document.getElementById('heatmapToggle')?.checked) heatmapLayer.addTo(map);
    }
}

document.getElementById('heatmapToggle')?.addEventListener('change', e => {
    if (heatmapLayer) e.target.checked ? map.addLayer(heatmapLayer) : map.removeLayer(heatmapLayer);
});

function actualizarDashboard(d) {
    const rep = d || allReportesData;
    const cByType = {};
    const cByMonth = {};
    
    rep.forEach(i => {
        const cType = normalizarTexto(encontrarTipo(i));
        const nf = parseInt(i.Fallecidos || 0);
        const nh = parseInt(i.Heridos || 0);
        if (nf > 0) cByType['Fallecidos'] = (cByType['Fallecidos'] || 0) + nf;
        if (nh > 0) cByType['Heridos'] = (cByType['Heridos'] || 0) + nh;
        if (!['Fallecidos', 'Heridos'].includes(cType)) cByType[cType] = (cByType[cType] || 0) + 1;
        
        const f = encontrarFecha(i); 
        if (f) {
            const k = `${f.getFullYear()}-${(f.getMonth() + 1).toString().padStart(2, '0')}`;
            cByMonth[k] = (cByMonth[k] || 0) + 1;
        }
    });

    const sMonths = Object.keys(cByMonth).sort();
    const isF = document.getElementById('dateStart')?.value || document.getElementById('dateEnd')?.value;
    let mShow = (!isF && sMonths.length > 3) ? sMonths.slice(-3) : sMonths;

    if (chartInstanceType) chartInstanceType.destroy();
    chartInstanceType = new Chart(document.getElementById('typeChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: Object.keys(cByType), datasets: [{ data: Object.values(cByType), backgroundColor: ['#ef4444', '#f97316', '#3b82f6', '#a855f7', '#22c55e', '#eab308'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: true, aspectRatio: 2, plugins: { legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 10 }, boxWidth: 10 } } } }
    });

    if (chartInstanceTime) chartInstanceTime.destroy();
    chartInstanceTime = new Chart(document.getElementById('timeChart').getContext('2d'), {
        type: 'bar',
        data: { labels: mShow, datasets: [{ label: 'Siniestros', data: mShow.map(m => cByMonth[m]), backgroundColor: '#3b82f6', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: true, aspectRatio: 2, scales: { y: { beginAtZero: true, ticks: { color: '#cbd5e1' }, grid: { color: '#334155' } }, x: { ticks: { color: '#cbd5e1', maxRotation: 45 }, grid: { display: false } } }, plugins: { legend: { display: false } } }
    });
}

async function loadLayer(tbl) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${tbl}?select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }
        });
        return await res.json();
    } catch (e) { return []; }
}

async function init() {
    allReportesData = await loadLayer('reportes') || [];
    const pData = await loadLayer('perimetro_urbano') || [];
    perimetroLayerGroup.clearLayers();
    pData.forEach(i => {
        if (i.geom) {
            L.geoJSON(i.geom, { style: { color: '#0000ff', weight: 2, fillOpacity: 0.05 } }).addTo(perimetroLayerGroup);
            urbanPolygons.push(typeof i.geom === 'string' ? JSON.parse(i.geom) : i.geom);
        }
    });
    renderizarCapas();
}

document.getElementById('reportForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const lat = parseFloat(document.getElementById('latitud').value);
    const lon = parseFloat(document.getElementById('longitud').value);
    if (!validarUbicacionUrbana(lat, lon)) { mostrarEstadoForm('⚠️ Ubicación fuera de zona permitida.', 'error'); return; }

    try {
        const hoy = new Date();
        const fAct = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/reportes`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitud: lat, longitud: lon, tipo_reporte: document.getElementById('tipoReporte').value, descripcion: document.getElementById('descripcion').value, date: fAct })
        });
        if (!res.ok) throw new Error();
        mostrarEstadoForm('¡Enviado!', 'success');
        document.getElementById('reportForm').reset();
        allReportesData = await loadLayer('reportes');
        renderizarCapas();
    } catch (err) { mostrarEstadoForm('Error en envío', 'error'); }
});

function obtenerUbicacion() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(p => {
            const lat = p.coords.latitude; const lng = p.coords.longitude;
            document.getElementById('latitud').value = lat.toFixed(6);
            document.getElementById('longitud').value = lng.toFixed(6);
            map.setView([lat, lng], 16);
            if (tempMarker) map.removeLayer(tempMarker);
            tempMarker = L.marker([lat, lng]).addTo(map).bindPopup('Tu ubicación').openPopup();
        });
    } else alert('GPS no disponible');
}

map.on('click', e => {
    document.getElementById('latitud').value = e.latlng.lat.toFixed(6);
    document.getElementById('longitud').value = e.latlng.lng.toFixed(6);
    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker(e.latlng).addTo(map).bindPopup('Ubicación').openPopup();
});

document.getElementById('perimetroLayer').addEventListener('change', e => e.target.checked ? map.addLayer(perimetroLayerGroup) : map.removeLayer(perimetroLayerGroup));
document.getElementById('reportesLayer').addEventListener('change', e => e.target.checked ? map.addLayer(reportesLayerGroup) : map.removeLayer(reportesLayerGroup));

async function descargarPDF() {
    if (!window.jspdf) { alert("Error: Librería PDF no cargada."); return; }
    const lat = document.getElementById('latitud').value;
    const lng = document.getElementById('longitud').value;
    if (!lat || !lng) { alert("⚠️ Selecciona una ubicación primero."); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const cB = [59, 130, 246]; const cD = [15, 23, 42];

    doc.setFillColor(...cB); doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
    doc.text("RIOBAMBA SEGURA", 105, 15, { align: "center" });
    doc.setFontSize(12); doc.text("Reporte de Incidente / Siniestro", 105, 24, { align: "center" });

    doc.setTextColor(100); doc.setFontSize(10); doc.text(`Generado el: ${new Date().toLocaleString('es-EC')}`, 20, 42);
    doc.setDrawColor(200); doc.line(20, 45, 190, 45);

    let y = 55;
    doc.setTextColor(...cD); doc.setFontSize(14); doc.text("Detalles del Evento", 20, y);
    y += 10; doc.setFontSize(12); doc.text(`Tipo: ${document.getElementById('tipoReporte').value}`, 20, y);
    y += 8; doc.text(`Ubicación: Lat: ${lat} | Lng: ${lng}`, 20, y);
    
    y += 15; doc.text("Descripción:", 20, y);
    y += 5; doc.setFillColor(248, 250, 252); doc.rect(20, y, 170, 30, 'F');
    doc.setFontSize(10); doc.text(doc.splitTextToSize(document.getElementById('descripcion').value || "Sin descripción.", 160), 25, y + 10);

    y += 45;
    doc.setDrawColor(...cB); doc.setLineWidth(0.5); doc.line(20, y, 190, y);
    y += 10; doc.setFontSize(13); doc.setTextColor(...cB); doc.text("GUÍA PARA USO DE DATOS ABIERTOS", 20, y);
    
    doc.setTextColor(50); doc.setFontSize(9); y += 8;
    const txtG = "Metodología: Los archivos descargados son en formato GeoJSON para análisis en software SIG. IMPORTANTE: Realizar una proyección al sistema UTM Zona 17 Sur (EPSG:32717) ya que los datos vienen por defecto en coordenadas geográficas WGS 84 (EPSG:4326).\n\nModo de uso: Al descargar la información, encontrará campos como 'Fallecidos' y 'Heridos' (numéricos), así como 'date' y 'hora' para análisis temporal. La coordenada exacta reside en la geometría del punto.";
    doc.text(doc.splitTextToSize(txtG, 170), 20, y);

    doc.setFontSize(8); doc.setTextColor(150);
    doc.text("Documento Oficial - GeoPortal Seguridad Vial Riobamba", 105, 285, { align: "center" });
    doc.save(`Reporte_Riobamba_${Date.now()}.pdf`);
}

function descargarGeoJSON() {
    if (allReportesData.length === 0) return;
    const f = allReportesData.map(i => {
        const g = parseGeom(i);
        return g ? { type: "Feature", geometry: { type: "Point", coordinates: [g.lng, g.lat] }, properties: { ...i } } : null;
    }).filter(x => x);

    const gj = {
        type: "FeatureCollection",
        metadata: {
            titulo: "Datos abiertos Geo Portal Seguridad Vial Riobamba",
            descripcion: "Iniciativa para el análisis de incidentes de tránsito en Riobamba para prevención y toma de decisiones.",
            metodologia: "Formato GeoJSON (EPSG:4326). Se recomienda proyectar a UTM Zona 17 Sur (EPSG:32717).",
            modo_de_uso: "Utilizar campos 'date', 'hora', 'Fallecidos' y 'Heridos' para análisis estadístico."
        },
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::4326" } },
        features: f
    };

    const b = new Blob([JSON.stringify(gj, null, 2)], { type: "application/geo+json" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `reportes_riobamba_${new Date().toISOString().split('T')[0]}.geojson`;
    a.click();
}

init();
