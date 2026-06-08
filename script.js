const SUPABASE_URL = 'https://pnaobmyaugbccfwwhyob.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYW9ibXlhdWdiY2Nmd3doeW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQwMzcsImV4cCI6MjA4MzkxMDAzN30.-TwJWOKZWXNDq2u789-dRcX--yA4fWjGSgHc-Zr-ny4';

// Instancia del Mapa
const map = L.map('map').setView([-1.6635, -78.6547], 13);

// Definición de Capas Base
const voyagerLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 20
});

// Capa activa por defecto
voyagerLayer.addTo(map);

// Grupos de capas originales
let perimetroLayerGroup = L.layerGroup();
let reportesLayerGroup = L.layerGroup();
let heatmapLayer = null;
let tempMarker = null;

let allReportesData = [];
let urbanPolygons = [];

let chartInstanceType = null;
let chartInstanceTime = null;

// -------------------------------------------------------------
// FUNCIONES UI
// -------------------------------------------------------------
function togglePanel() {
    const panel = document.getElementById('mainPanel');
    const toggle = document.getElementById('panelToggle');
    panel.classList.toggle('open');
    toggle.textContent = panel.classList.contains('open') ? '✕' : '☰';
}

function toggleDashboard() {
    const modal = document.getElementById('dashboardModal');
    if (modal.style.display !== 'flex') {
        actualizarDashboard();
        modal.style.display = 'flex';
    } else {
        modal.style.display = 'none';
    }
}

// Funciones UI para Capa Base
function toggleBasemapMenu() {
    document.getElementById('basemapMenu').classList.toggle('open');
}

function changeBasemap(layerName) {
    if (layerName === 'satellite') {
        map.removeLayer(voyagerLayer);
        satelliteLayer.addTo(map);
    } else {
        map.removeLayer(satelliteLayer);
        voyagerLayer.addTo(map);
    }
    document.getElementById('basemapMenu').classList.remove('open');
}

function mostrarEstadoForm(mensaje, tipo) {
    const status = document.getElementById('formStatus');
    status.textContent = mensaje;
    status.className = `form-status ${tipo}`;
    status.style.display = 'block';
    setTimeout(() => { status.style.display = 'none'; }, 3000);
}

function normalizarTexto(texto) {
    if (!texto) return 'No especificado';
    let limpio = texto.toString().toLowerCase().replace(/_/g, ' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

function encontrarFecha(item) {
    if (item.date && typeof item.date === 'string' && item.date.length >= 10) {
        const parts = item.date.split('-');
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    const fechaFallback = item.fecha_reporte || item.fecha || item.created_at;
    if (fechaFallback) {
        let fecha = new Date(fechaFallback);
        if (!isNaN(fecha)) {
            fecha.setTime(fecha.getTime() - (5 * 60 * 60 * 1000));
            return fecha;
        }
    }
    return null;
}

function encontrarTipo(item) {
    return item.sv || item.tipo_reporte || item.tipo_incidente || item.tipo || 'Colisión Vehicular';
}

// -------------------------------------------------------------
// VALIDACIÓN GEOGRÁFICA
// -------------------------------------------------------------
function isPointInPolygon(point, vs) {
    var x = point[0], y = point[1];
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        var intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function validarUbicacionUrbana(lat, lng) {
    if (urbanPolygons.length === 0) return true;
    const punto = [lng, lat];
    let estaDentro = false;
    for (let geojson of urbanPolygons) {
        if (geojson.type === 'Polygon') {
            if (isPointInPolygon(punto, geojson.coordinates[0])) { estaDentro = true; break; }
        } else if (geojson.type === 'MultiPolygon') {
            for (let polyCoords of geojson.coordinates) {
                if (isPointInPolygon(punto, polyCoords[0])) { estaDentro = true; break; }
            }
        }
    }
    return estaDentro;
}

// -------------------------------------------------------------
// FILTRADO Y RENDERIZADO
// -------------------------------------------------------------
function filtrarPorFecha(datos, fechaInicio, fechaFin) {
    const start = fechaInicio ? new Date(fechaInicio) : new Date('2000-01-01');
    let end = fechaFin ? new Date(fechaFin) : new Date();
    end.setHours(23, 59, 59, 999);
    return datos.filter(item => {
        const fechaItem = encontrarFecha(item);
        if (!fechaItem) return true;
        return fechaItem >= start && fechaItem <= end;
    });
}

function renderizarMarcadores(datos, layerGroup, opciones) {
    datos.forEach(item => {
        let geom = parseGeom(item);
        if (geom) {
            const marker = L.circleMarker([geom.lat, geom.lng], {
                radius: opciones.radius || 5,
                fillColor: opciones.color || "#ff0000",
                color: "#000",
                weight: 1,
                opacity: 1,
                fillOpacity: opciones.fillOpacity || 0.7
            });
            if (opciones.popupFormatter) marker.bindPopup(opciones.popupFormatter(item));
            marker.addTo(layerGroup);
        }
    });
}

function renderizarCapas(fechaInicio = null, fechaFin = null) {
    reportesLayerGroup.clearLayers();
    const repPorFecha = filtrarPorFecha(allReportesData, fechaInicio, fechaFin);
    renderizarMarcadores(repPorFecha, reportesLayerGroup, {
        radius: 6, color: "#ffa500", fillOpacity: 0.8,
        popupFormatter: (item) => {
            let tipoBonito = normalizarTexto(encontrarTipo(item));
            const fecha = encontrarFecha(item);
            let victimasStr = '';
            if(parseInt(item.Fallecidos || 0) > 0) victimasStr += `<br><span style="color:red;">Fallecidos: ${item.Fallecidos}</span>`;
            if(parseInt(item.Heridos || 0) > 0) victimasStr += `<br><span style="color:orange;">Heridos: ${item.Heridos}</span>`;
            return `<b>${tipoBonito}</b><br><span style="font-size:10px;">${fecha ? fecha.toLocaleDateString('es-EC') : 'Reciente'}</span>${victimasStr}<br>${item.descripcion || ''}`;
        }
    });
    actualizarHeatmap(repPorFecha);
    actualizarDashboard(repPorFecha);
}

function aplicarFiltrosFecha() {
    renderizarCapas(document.getElementById('dateStart').value, document.getElementById('dateEnd').value);
}

function parseGeom(item) {
    if (item.latitud && item.longitud) return { lat: parseFloat(item.latitud), lng: parseFloat(item.longitud) };
    let g = item.geom || item.geometry || item.geojson;
    if (typeof g === 'string') try { g = JSON.parse(g); } catch (e) { }
    if (g && g.coordinates) return { lat: g.coordinates[1], lng: g.coordinates[0] };
    return null;
}

// -------------------------------------------------------------
// MAPA DE CALOR
// -------------------------------------------------------------
function actualizarHeatmap(repData) {
    let puntos = [];
    if (repData) {
        repData.forEach(item => {
            if (normalizarTexto(encontrarTipo(item)) === 'Colision vehicular') {
                let g = parseGeom(item);
                if(g) puntos.push([g.lat, g.lng, 1.0]);
            }
        });
    }
    if (heatmapLayer) map.removeLayer(heatmapLayer);
    if (puntos.length > 0 && typeof L.heatLayer === 'function') {
        heatmapLayer = L.heatLayer(puntos, { radius: 40, blur: 25, maxZoom: 15, max: 3.0, minOpacity: 0.5, gradient: { 0.3: 'blue', 0.6: 'yellow', 1.0: 'red' } });
        if (document.getElementById('heatmapToggle')?.checked) heatmapLayer.addTo(map);
    }
}

document.getElementById('heatmapToggle')?.addEventListener('change', e => {
    if (heatmapLayer) e.target.checked ? map.addLayer(heatmapLayer) : map.removeLayer(heatmapLayer);
});

// -------------------------------------------------------------
// DASHBOARD
// -------------------------------------------------------------
function actualizarDashboard(repFiltered) {
    const rep = repFiltered || allReportesData;
    const countsByType = {};
    const countsByMonth = {};

    rep.forEach(item => {
        const cleanType = normalizarTexto(encontrarTipo(item));
        const nf = parseInt(item.Fallecidos || 0);
        const nh = parseInt(item.Heridos || 0);
        if (nf > 0) countsByType['Fallecidos'] = (countsByType['Fallecidos'] || 0) + nf;
        if (nh > 0) countsByType['Heridos'] = (countsByType['Heridos'] || 0) + nh;
        if (!['Fallecidos', 'Heridos'].includes(cleanType)) countsByType[cleanType] = (countsByType[cleanType] || 0) + 1;

        const d = encontrarFecha(item);
        if (d) {
            const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            countsByMonth[key] = (countsByMonth[key] || 0) + 1;
        }
    });

    const sortedMonths = Object.keys(countsByMonth).sort();
    const isFiltered = document.getElementById('dateStart')?.value || document.getElementById('dateEnd')?.value;
    let monthsToShow = (!isFiltered && sortedMonths.length > 3) ? sortedMonths.slice(-3) : sortedMonths;

    if (chartInstanceType) chartInstanceType.destroy();
    chartInstanceType = new Chart(document.getElementById('typeChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: Object.keys(countsByType), datasets: [{ data: Object.values(countsByType), backgroundColor: ['#ef4444', '#f97316', '#3b82f6', '#a855f7', '#22c55e', '#eab308'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: true, aspectRatio: 2, plugins: { legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 10 }, boxWidth: 10 } } } }
    });

    if (chartInstanceTime) chartInstanceTime.destroy();
    chartInstanceTime = new Chart(document.getElementById('timeChart').getContext('2d'), {
        type: 'bar',
        data: { labels: monthsToShow, datasets: [{ label: 'Siniestros', data: monthsToShow.map(m => countsByMonth[m]), backgroundColor: '#3b82f6', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: true, aspectRatio: 2, scales: { y: { beginAtZero: true, ticks: { color: '#cbd5e1' }, grid: { color: '#334155' } }, x: { ticks: { color: '#cbd5e1', maxRotation: 45 }, grid: { display: false } } }, plugins: { legend: { display: false } } }
    });
}

// -------------------------------------------------------------
// CARGA INICIAL
// -------------------------------------------------------------
async function loadLayer(tableName) {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }
        });
        return await response.json();
    } catch (e) { return []; }
}

async function init() {
    allReportesData = await loadLayer('reportes') || [];
    const perimetroData = await loadLayer('perimetro_urbano') || [];
    perimetroLayerGroup.clearLayers();
    perimetroData.forEach(item => {
        if (item.geom) {
            L.geoJSON(item.geom, { style: { color: '#0000ff', weight: 2, fillOpacity: 0.05 } }).addTo(perimetroLayerGroup);
            urbanPolygons.push(typeof item.geom === 'string' ? JSON.parse(item.geom) : item.geom);
        }
    });
    renderizarCapas();
}

// -------------------------------------------------------------
// FORMULARIO
// -------------------------------------------------------------
document.getElementById('reportForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const lat = parseFloat(document.getElementById('latitud').value);
    const lon = parseFloat(document.getElementById('longitud').value);
    if (!validarUbicacionUrbana(lat, lon)) { mostrarEstadoForm('⚠️ Ubicación fuera de zona permitida.', 'error'); return; }

    try {
        const hoy = new Date();
        const fechaActualDate = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/reportes`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitud: lat, longitud: lon, tipo_reporte: document.getElementById('tipoReporte').value, descripcion: document.getElementById('descripcion').value, date: fechaActualDate })
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
    // --- ANÁLISIS ESPACIAL ZONAL --- Interceptar clic si hay modo activo
    if (az_modo) { azOnMapClick(e); return; }
    // Comportamiento original
    document.getElementById('latitud').value = e.latlng.lat.toFixed(6);
    document.getElementById('longitud').value = e.latlng.lng.toFixed(6);
    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker(e.latlng).addTo(map).bindPopup('Ubicación').openPopup();
});

document.getElementById('perimetroLayer').addEventListener('change', e => e.target.checked ? map.addLayer(perimetroLayerGroup) : map.removeLayer(perimetroLayerGroup));
document.getElementById('reportesLayer').addEventListener('change', e => e.target.checked ? map.addLayer(reportesLayerGroup) : map.removeLayer(reportesLayerGroup));

// -------------------------------------------------------------
// GENERACIÓN DE PDF (CON GUÍA DE DATOS + ESTADÍSTICAS 2026)
// -------------------------------------------------------------
async function descargarPDF() {
    if (!window.jspdf) { alert("Error: Librería PDF no cargada."); return; }
    const lat = document.getElementById('latitud').value;
    const lng = document.getElementById('longitud').value;
    if (!lat || !lng) { alert("⚠️ Selecciona una ubicación primero."); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const colorBlue = [59, 130, 246]; const colorDark = [15, 23, 42];

    // --- Encabezado ---
    doc.setFillColor(...colorBlue); doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
    doc.text("RIOBAMBA SEGURA", 105, 15, { align: "center" });
    doc.setFontSize(12); doc.text("Reporte de Incidente / Siniestro", 105, 24, { align: "center" });

    doc.setTextColor(100); doc.setFontSize(10); doc.text(`Generado el: ${new Date().toLocaleString('es-EC')}`, 20, 42);
    doc.setDrawColor(200); doc.line(20, 45, 190, 45);

    // --- Detalles del evento ---
    let y = 55;
    doc.setTextColor(...colorDark); doc.setFontSize(14); doc.text("Detalles del Evento", 20, y);
    y += 10; doc.setFontSize(12); doc.text(`Tipo: ${document.getElementById('tipoReporte').value}`, 20, y);
    y += 8; doc.text(`Ubicación: Lat: ${lat} | Lng: ${lng}`, 20, y);

    y += 15; doc.text("Descripción:", 20, y);
    y += 5; doc.setFillColor(248, 250, 252); doc.rect(20, y, 170, 30, 'F');
    doc.setFontSize(10); doc.text(doc.splitTextToSize(document.getElementById('descripcion').value || "Sin descripción proporcionada.", 160), 25, y + 10);

    y += 40;

    // ----------------------------------------------------------------
    // --- ESTADÍSTICAS 2026 (KPI + leyenda de tipos, sin pastel)    ---
    // Filtrar allReportesData: solo registros desde 01-ene-2026 a hoy
    // ----------------------------------------------------------------
    const az_inicio2026 = new Date(2026, 0, 1);      // 1 enero 2026
    const az_hoy        = new Date();
    az_hoy.setHours(23, 59, 59, 999);

    const d2026 = allReportesData.filter(item => {
        const f = encontrarFecha(item);
        return f && f >= az_inicio2026 && f <= az_hoy;
    });

    // Calcular totales del período
    let az_tot = d2026.length;
    let az_fall = 0, az_her = 0;
    d2026.forEach(r => {
        const fv = r.Fallecidos; az_fall += (fv === 'NULL' || fv == null) ? 0 : parseInt(fv) || 0;
        const hv = r.Heridos;   az_her  += (hv === 'NULL' || hv == null) ? 0 : parseInt(hv) || 0;
    });

    // Conteo por tipo de siniestro (leyenda textual)
    const az_tipos = {};
    d2026.forEach(item => {
        const t = normalizarTexto(encontrarTipo(item));
        az_tipos[t] = (az_tipos[t] || 0) + 1;
    });
    const az_tipoKeys  = Object.keys(az_tipos);
    const az_tipoVals  = az_tipoKeys.map(k => az_tipos[k]);
    const az_tipoTotal = az_tipoVals.reduce((a, b) => a + b, 0);

    // Paleta corporativa
    const az_pal = [
        [59, 130, 246], [239, 68, 68],  [249, 115, 22], [168, 85, 247],
        [34, 197, 94],  [234, 179, 8],  [6, 182, 212],  [236, 72, 153],
    ];

    // Calcular alto del recuadro: KPI (35mm) + leyenda (4 + filas*5 mm) + márgenes
    const az_leyRows   = Math.min(az_tipoKeys.length, 6);
    const az_boxH      = 8 + 22 + 8 + 4 + az_leyRows * 5 + 6;   // dinámico

    // --- Encabezado sección estadísticas ---
    doc.setDrawColor(...colorBlue); doc.setLineWidth(0.4); doc.line(20, y, 190, y);
    y += 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.setTextColor(...colorBlue);
    doc.text("ANÁLISIS ESTADÍSTICO · PERÍODO 2026", 20, y);
    y += 7;

    // Fondo suave de la sección (alto calculado)
    doc.setFillColor(245, 248, 255); doc.rect(20, y, 170, az_boxH, 'F');
    doc.setDrawColor(200, 220, 255); doc.setLineWidth(0.3); doc.rect(20, y, 170, az_boxH, 'S');

    // --- Indicadores KPI: tres columnas equilibradas ---
    const az_kpiY    = y + 8;
    const az_kpiBoxW = 48; const az_kpiBoxH = 22; const az_kpiGap = 9;
    const az_kpiX    = [22, 22 + az_kpiBoxW + az_kpiGap, 22 + (az_kpiBoxW + az_kpiGap) * 2];
    const az_kpiCols = [
        { label: 'ACCIDENTES', val: az_tot,  rgb: [59, 130, 246] },
        { label: 'FALLECIDOS', val: az_fall, rgb: [239, 68, 68]  },
        { label: 'HERIDOS',    val: az_her,  rgb: [249, 115, 22] },
    ];

    az_kpiCols.forEach((kpi, i) => {
        doc.setFillColor(...kpi.rgb);
        doc.roundedRect(az_kpiX[i], az_kpiY, az_kpiBoxW, az_kpiBoxH, 3, 3, 'F');
        doc.setFont("helvetica", "bold"); doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.text(String(kpi.val), az_kpiX[i] + az_kpiBoxW / 2, az_kpiY + 13, { align: "center" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        doc.setTextColor(...colorDark);
        doc.text(kpi.label, az_kpiX[i] + az_kpiBoxW / 2, az_kpiY + az_kpiBoxH + 5, { align: "center" });
    });


    // --- Leyenda de tipos de siniestro (bajo las KPI, dentro del recuadro) ---
    const az_leyX = 23;
    let   az_leyY = az_kpiY + az_kpiBoxH + 12;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    doc.setTextColor(...colorDark);
    doc.text("Tipos de siniestro:", az_leyX, az_leyY);
    az_leyY += 4;

    az_tipoKeys.slice(0, 6).forEach((tipo, i) => {
        const az_pct = az_tipoTotal > 0 ? Math.round((az_tipoVals[i] / az_tipoTotal) * 100) : 0;
        doc.setFillColor(...az_pal[i % az_pal.length]);
        doc.rect(az_leyX, az_leyY - 2.5, 3, 3, 'F');
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
        doc.setTextColor(40);
        const az_lbl = tipo.length > 30 ? tipo.substring(0, 29) + '…' : tipo;
        doc.text(`${az_lbl} (${az_pct}%)`, az_leyX + 4.5, az_leyY);
        az_leyY += 5;
    });

    // Avanzar cursor: alto dinámico del recuadro + separación antes de la Guía
    y += az_boxH + 8;


    // ----------------------------------------------------------------
    // --- GUÍA PARA USO DE DATOS ABIERTOS (intacta) ---
    // ----------------------------------------------------------------
    doc.setDrawColor(...colorBlue); doc.setLineWidth(0.5); doc.line(20, y, 190, y);
    y += 10; doc.setFontSize(13); doc.setTextColor(...colorBlue);
    doc.setFont("helvetica", "bold");
    doc.text("GUÍA PARA USO DE DATOS ABIERTOS", 20, y);

    doc.setTextColor(50); doc.setFontSize(9); doc.setFont("helvetica", "normal"); y += 8;
    const guiaText = "Metodología: Los archivos descargados son en formato GeoJSON para análisis en software SIG. IMPORTANTE: Realizar una proyección al sistema UTM Zona 17 Sur (EPSG:32717) ya que los datos vienen por defecto en coordenadas geográficas WGS 84 (EPSG:4326).\n\nModo de uso: Al descargar la información, encontrará campos como 'Fallecidos' y 'Heridos' (numéricos), así como 'date' y 'hora' para análisis temporal. La coordenada exacta reside en la geometría del punto.";
    doc.text(doc.splitTextToSize(guiaText, 170), 20, y);

    doc.setFontSize(8); doc.setTextColor(150);
    doc.text("Documento Oficial - GeoPortal Seguridad Vial Riobamba", 105, 285, { align: "center" });
    doc.save(`Reporte_Riobamba_${Date.now()}.pdf`);
}

// -------------------------------------------------------------
// GENERACIÓN DE GEOJSON (DATOS ABIERTOS)
// -------------------------------------------------------------
function descargarGeoJSON() {
    if (allReportesData.length === 0) return;
    const features = allReportesData.map(item => {
        const geom = parseGeom(item);
        return geom ? { type: "Feature", geometry: { type: "Point", coordinates: [geom.lng, geom.lat] }, properties: { ...item } } : null;
    }).filter(f => f);

    const geojson = {
        type: "FeatureCollection",
        metadata: {
            titulo: "Datos abiertos Geo Portal Seguridad Vial Riobamba",
            descripcion: "Iniciativa para el análisis de incidentes de tránsito en Riobamba para prevención y toma de decisiones.",
            metodologia: "Formato GeoJSON (EPSG:4326). Se recomienda proyectar a UTM Zona 17 Sur (EPSG:32717). Fuente: Recopilación bibliográfica local.",
            modo_de_uso: "Utilizar campos 'date', 'hora', 'Fallecidos' y 'Heridos' para análisis estadístico."
        },
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::4326" } },
        features: features
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reportes_riobamba_${new Date().toISOString().split('T')[0]}.geojson`;
    a.click();
}

// -------------------------------------------------------------
// GENERACIÓN DE CSV (DATOS ABIERTOS MULTI-FORMATO)
// -------------------------------------------------------------
function descargarCSV() {
    if (allReportesData.length === 0) {
        alert("No hay datos para descargar.");
        return;
    }

    let headers = new Set();
    allReportesData.forEach(item => {
        Object.keys(item).forEach(key => {
            if(key !== 'geom' && key !== 'geojson') headers.add(key);
        });
    });

    headers.add('latitud_geo');
    headers.add('longitud_geo');

    const headersArray = Array.from(headers);
    let csvContent = headersArray.join(',') + '\n';

    allReportesData.forEach(item => {
        const geom = parseGeom(item);
        let row = headersArray.map(header => {
            let val = item[header];
            if (header === 'latitud_geo') val = geom ? geom.lat : '';
            if (header === 'longitud_geo') val = geom ? geom.lng : '';

            if (val === null || val === undefined) return '""';

            let strVal = String(val).replace(/"/g, '""');
            return `"${strVal}"`;
        });
        csvContent += row.join(',') + '\n';
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `reportes_riobamba_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// ============================================================
// --- ANÁLISIS ESPACIAL ZONAL ---
// Módulo de Geoprocesamiento con Turf.js + Leaflet HeatLayer
// Variables globales de estado del análisis
// ============================================================

let az_modo       = null;   // 'punto' | 'rect' | null
let az_bufLayer   = null;   // L.geoJSON del buffer/rect dibujado
let az_drawGeom   = null;   // GeoJSON geometry de la zona analizada
let az_filt       = [];     // Accidentes filtrados spatialmente
let az_ptLayer    = null;   // L.layerGroup de marcadores filtrados
let az_kdeLayer   = null;   // L.heatLayer local (KDE zonal)
let az_rectStart  = null;   // Punto inicial del drag de rectángulo
let az_rectRect   = null;   // L.rectangle en preview durante drag

// --- ANÁLISIS ESPACIAL ZONAL --- Toggle UI del panel colapsable
function toggleAZ() {
    const panel    = document.getElementById('azPanel');
    const chevron  = document.getElementById('azChevron');
    panel.classList.toggle('open');
    chevron.classList.toggle('open');
}

// --- ANÁLISIS ESPACIAL ZONAL --- Activar modo de captura (punto o rectángulo)
function azActivarModo(modo) {
    // Si el mismo modo ya está activo, desactivar
    if (az_modo === modo) { azDesactivarModo(); return; }

    az_modo = modo;
    const btnP = document.getElementById('az-btn-punto');
    const btnR = document.getElementById('az-btn-rect');
    const bufRow = document.getElementById('azBufferRow');
    const st     = document.getElementById('azStatus');

    // Estado visual de botones
    btnP.classList.toggle('active', modo === 'punto');
    btnR.classList.toggle('active', modo === 'rect');

    // Mostrar/ocultar campo de buffer
    bufRow.classList.toggle('visible', modo === 'punto');

    // Mensaje de instrucción
    if (modo === 'punto') {
        st.textContent = '📍 Haz clic en el mapa para colocar el punto';
        st.className   = 'az-status active';
        map.getContainer().style.cursor = 'crosshair';
    } else {
        st.textContent = '🖊 Arrastra en el mapa para trazar el rectángulo';
        st.className   = 'az-status active';
        map.getContainer().style.cursor = 'crosshair';
        // Habilitar drag para rectángulo
        map.dragging.disable();
        map.on('mousedown', azRectStart);
    }
}

// --- ANÁLISIS ESPACIAL ZONAL --- Desactivar modo sin limpiar resultados
function azDesactivarModo() {
    az_modo = null;
    document.getElementById('az-btn-punto').classList.remove('active');
    document.getElementById('az-btn-rect').classList.remove('active');
    document.getElementById('azStatus').textContent = 'Selecciona un modo de análisis';
    document.getElementById('azStatus').className   = 'az-status';
    map.getContainer().style.cursor = '';
    map.dragging.enable();
    map.off('mousedown', azRectStart);
    map.off('mousemove', azRectDrag);
    map.off('mouseup',   azRectEnd);
    if (az_rectRect) { map.removeLayer(az_rectRect); az_rectRect = null; }
}

// --- ANÁLISIS ESPACIAL ZONAL --- Manejador de clic en mapa (modo punto)
function azOnMapClick(e) {
    if (az_modo !== 'punto') return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    // Validación: el punto debe estar dentro del perímetro urbano
    if (!validarUbicacionUrbana(lat, lng)) {
        azSetStatus('⚠ Punto fuera del perímetro urbano analizado', 'warning');
        return;
    }

    // Leer el radio de buffer en metros
    const radM = parseFloat(document.getElementById('azBufferInput').value);
    if (isNaN(radM) || radM <= 0) {
        azSetStatus('⚠ Ingresa un valor de buffer válido (metros)', 'warning');
        return;
    }

    // --- ANÁLISIS ESPACIAL ZONAL --- Generar buffer con Turf.js (unidades: metros)
    const pt_tf    = turf.point([lng, lat]);
    const buf_tf   = turf.buffer(pt_tf, radM, { units: 'meters' });
    az_drawGeom    = buf_tf;

    // Limpiar capa de buffer anterior y renderizar nueva
    if (az_bufLayer) map.removeLayer(az_bufLayer);
    az_bufLayer = L.geoJSON(buf_tf, {
        style: { color: '#22d3ee', weight: 2, fillColor: '#22d3ee', fillOpacity: 0.12, dashArray: '6 4' }
    }).addTo(map);

    // Centrar vista en el buffer
    map.fitBounds(az_bufLayer.getBounds(), { padding: [30, 30] });

    azSetStatus(`Buffer de ${radM}m generado. Analizando...`, 'active');
    azFiltrarYRenderizar(buf_tf);
    azDesactivarModo();
}

// --- ANÁLISIS ESPACIAL ZONAL --- Inicio del arrastre para rectángulo
function azRectStart(e) {
    az_rectStart = e.latlng;
    map.on('mousemove', azRectDrag);
    map.on('mouseup',   azRectEnd);
}

// --- ANÁLISIS ESPACIAL ZONAL --- Preview del rectángulo durante el arrastre
function azRectDrag(e) {
    if (!az_rectStart) return;
    if (az_rectRect) map.removeLayer(az_rectRect);
    az_rectRect = L.rectangle([az_rectStart, e.latlng], {
        color: '#22d3ee', weight: 2, fillColor: '#22d3ee', fillOpacity: 0.1, dashArray: '6 4'
    }).addTo(map);
}

// --- ANÁLISIS ESPACIAL ZONAL --- Fin del arrastre: calcular bbox y filtrar
function azRectEnd(e) {
    map.off('mousemove', azRectDrag);
    map.off('mouseup',   azRectEnd);
    map.dragging.enable();

    if (!az_rectStart || !az_rectRect) return;

    const s = az_rectStart;
    const f = e.latlng;

    // Validar que al menos una esquina esté en el perímetro urbano
    const cornerOk = validarUbicacionUrbana(s.lat, s.lng) ||
                     validarUbicacionUrbana(f.lat, f.lng) ||
                     validarUbicacionUrbana(s.lat, f.lng) ||
                     validarUbicacionUrbana(f.lat, s.lng);
    if (!cornerOk) {
        map.removeLayer(az_rectRect); az_rectRect = null; az_rectStart = null;
        azSetStatus('⚠ Rectángulo fuera del perímetro urbano', 'warning');
        return;
    }

    // --- ANÁLISIS ESPACIAL ZONAL --- Convertir bounds a GeoJSON polygon (Turf.js bboxPolygon)
    const minLng = Math.min(s.lng, f.lng);
    const minLat = Math.min(s.lat, f.lat);
    const maxLng = Math.max(s.lng, f.lng);
    const maxLat = Math.max(s.lat, f.lat);

    const bbox_tf = turf.bboxPolygon([minLng, minLat, maxLng, maxLat]);
    az_drawGeom   = bbox_tf;

    // Reemplazar preview con capa final estilizada
    map.removeLayer(az_rectRect); az_rectRect = null;
    if (az_bufLayer) map.removeLayer(az_bufLayer);
    az_bufLayer = L.geoJSON(bbox_tf, {
        style: { color: '#22d3ee', weight: 2, fillColor: '#22d3ee', fillOpacity: 0.12, dashArray: '6 4' }
    }).addTo(map);

    az_rectStart = null;
    azSetStatus(`Rectángulo definido. Analizando...`, 'active');
    azFiltrarYRenderizar(bbox_tf);
    azDesactivarModo();
}

// --- ANÁLISIS ESPACIAL ZONAL --- Filtrado Point-in-Polygon + Renderizado de capas temporales
function azFiltrarYRenderizar(zonaTurf) {
    // Limpiar capas anteriores de análisis
    azLimpiarCapas();

    // --- ANÁLISIS ESPACIAL ZONAL --- Filtrado espacial con turf.booleanPointInPolygon
    az_filt = allReportesData.filter(item => {
        const g = parseGeom(item);
        if (!g) return false;
        const pt = turf.point([g.lng, g.lat]);
        return turf.booleanPointInPolygon(pt, zonaTurf);
    });

    if (az_filt.length === 0) {
        azSetStatus('ℹ Sin accidentes en la zona seleccionada', 'warning');
        azMostrarToggleCapas(false);
        return;
    }

    // --- ANÁLISIS ESPACIAL ZONAL --- Capa de marcadores filtrados (L.layerGroup temporal)
    az_ptLayer = L.layerGroup();
    az_filt.forEach(item => {
        const g = parseGeom(item);
        if (!g) return;
        L.circleMarker([g.lat, g.lng], {
            radius: 7,
            fillColor: '#22d3ee',
            color: '#0e7490',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.85
        })
        .bindPopup(`<b>Zona Filtrada</b><br>${normalizarTexto(encontrarTipo(item))}<br><span style="font-size:10px;color:#22d3ee;">${az_filt.length} total en zona</span>`)
        .addTo(az_ptLayer);
    });
    az_ptLayer.addTo(map);

    // --- ANÁLISIS ESPACIAL ZONAL --- KDE local: L.heatLayer alimentado SOLO con az_filt
    const hPts = az_filt.map(item => {
        const g = parseGeom(item);
        return g ? [g.lat, g.lng, 1.0] : null;
    }).filter(Boolean);

    if (hPts.length > 0 && typeof L.heatLayer === 'function') {
        az_kdeLayer = L.heatLayer(hPts, {
            radius: 35,
            blur: 20,
            maxZoom: 18,
            max: 2.0,
            minOpacity: 0.4,
            gradient: { 0.2: '#06b6d4', 0.5: '#f59e0b', 1.0: '#ef4444' }
        });
        az_kdeLayer.addTo(map);
    }

    // Mostrar toggles de capas en el panel
    azMostrarToggleCapas(true);
    azSetStatus(`✅ ${az_filt.length} accidente(s) encontrado(s) en la zona`, 'success');
}

// --- ANÁLISIS ESPACIAL ZONAL --- Helpers UI de estado y toggles de capas
function azSetStatus(msg, cls) {
    const el = document.getElementById('azStatus');
    el.textContent = msg;
    el.className   = `az-status ${cls}`;
}

function azMostrarToggleCapas(show) {
    document.getElementById('azLayerRowFiltrados').style.display = show ? 'flex' : 'none';
    document.getElementById('azLayerRowKDE').style.display       = show ? 'flex' : 'none';

    // Sincronizar estado checked
    if (show) {
        document.getElementById('azFiltradosToggle').checked = true;
        document.getElementById('azKdeToggle').checked       = true;
    }
}

// --- ANÁLISIS ESPACIAL ZONAL --- Listeners de toggle de capas temporales
document.getElementById('azFiltradosToggle')?.addEventListener('change', e => {
    if (az_ptLayer) e.target.checked ? map.addLayer(az_ptLayer) : map.removeLayer(az_ptLayer);
});

document.getElementById('azKdeToggle')?.addEventListener('change', e => {
    if (az_kdeLayer) e.target.checked ? map.addLayer(az_kdeLayer) : map.removeLayer(az_kdeLayer);
});

// --- ANÁLISIS ESPACIAL ZONAL --- Limpiar solo las capas de resultado (mantiene geometría)
function azLimpiarCapas() {
    if (az_ptLayer)  { map.removeLayer(az_ptLayer);  az_ptLayer  = null; }
    if (az_kdeLayer) { map.removeLayer(az_kdeLayer); az_kdeLayer = null; }
    az_filt = [];
}

// --- ANÁLISIS ESPACIAL ZONAL --- Botón "Limpiar Análisis": elimina TODO y resetea estado
function azLimpiar() {
    azDesactivarModo();
    azLimpiarCapas();
    if (az_bufLayer)  { map.removeLayer(az_bufLayer);  az_bufLayer  = null; }
    if (az_rectRect)  { map.removeLayer(az_rectRect);  az_rectRect  = null; }
    az_drawGeom   = null;
    az_rectStart  = null;
    azMostrarToggleCapas(false);
    azSetStatus('Análisis limpiado. Selecciona un modo', 'az-status');
    document.getElementById('azBufferInput').value = '';
    document.getElementById('az-btn-punto').classList.remove('active');
    document.getElementById('az-btn-rect').classList.remove('active');
    document.getElementById('azBufferRow').classList.remove('visible');
}
// ============================================================


init();


// ============================================================
// MOTOR DE ALERTAS PREVENTIVAS DE PROXIMIDAD
// Geofencing Client-Side · Radio fijo: 50 metros reales
// Algoritmo: Fórmula de Haversine (independiente de zoom/píxeles)
// ============================================================

/**
 * Centroides geográficos precalculados de zonas críticas de Riobamba.
 * Fuente: análisis territorial de siniestralidad vial urbana.
 * @type {Array<{nombre: string, lat: number, lng: number, radioMetros: number}>}
 */
const zonasCriticas = [
    {
        nombre: 'Zona cerca del Hospital San Juan',
        lat: -1.662198,
        lng: -78.658870,
        radioMetros: 100
    },
    {
        nombre: 'Zona cerca del Redondel del Comil',
        lat: -1.665350,
        lng: -78.649496,
        radioMetros: 100
    },
    {
        nombre: 'Zona aproximada a la Prefectura de Chimborazo',
        lat: -1.668763,
        lng: -78.652333,
        radioMetros: 100
    },
    {
        nombre: 'Zona aproximada a la Plaza Alfaro',
        lat: -1.671071,
        lng: -78.654227,
        radioMetros: 100
    },
    {
        nombre: 'Zona aproximada al Mercado de San Alfonso',
        lat: -1.671138,
        lng: -78.647331,
        radioMetros: 100
    }
];

// ── Estado interno del motor ──────────────────────────────────
const motorAlertas = {
    activo:       false,   // Motor encendido / apagado
    watchId:      null,    // ID de navigator.geolocation.watchPosition
    ultimaAlerta: null,    // { zonaIdx, timestamp } — throttle por zona
    cooldownMs:   30000    // 30 s entre alertas repetidas de la MISMA zona
};

// ── Marcadores de zonas críticas en el mapa ──────────────────
let zonasMarkers = [];

// ── Fórmula de Haversine ─────────────────────────────────────
/**
 * Calcula la distancia en METROS entre dos pares de coordenadas geográficas
 * usando la fórmula de Haversine. Operación matemática pura, sin dependencias
 * externas ni relación con el zoom o píxeles del mapa.
 *
 * @param {number} lat1 - Latitud del punto A (grados decimales)
 * @param {number} lon1 - Longitud del punto A (grados decimales)
 * @param {number} lat2 - Latitud del punto B (grados decimales)
 * @param {number} lon2 - Longitud del punto B (grados decimales)
 * @returns {number} Distancia en metros
 */
function haversineMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radio medio de la Tierra en metros
    const toRad = deg => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // metros
}

// ── Verificación de proximidad ───────────────────────────────
/**
 * Itera sobre zonasCriticas aplicando Haversine.
 * Si distancia ≤ radioMetros: dispara alerta visual + vibración táctil.
 * Incorpora throttle por zona para evitar spam de alertas.
 *
 * @param {GeolocationCoordinates} coords
 */
function verificarProximidad(coords) {
    const userLat = coords.latitude;
    const userLng = coords.longitude;
    const ahora   = Date.now();

    for (let i = 0; i < zonasCriticas.length; i++) {
        const zona     = zonasCriticas[i];
        const distancia = haversineMetros(userLat, userLng, zona.lat, zona.lng);

        if (distancia <= zona.radioMetros) {
            // Throttle: no repetir alerta de la misma zona antes del cooldown
            const enCooldown =
                motorAlertas.ultimaAlerta &&
                motorAlertas.ultimaAlerta.zonaIdx === i &&
                (ahora - motorAlertas.ultimaAlerta.timestamp) < motorAlertas.cooldownMs;

            if (!enCooldown) {
                motorAlertas.ultimaAlerta = { zonaIdx: i, timestamp: ahora };
                mostrarAlertaProximidad(zona, Math.round(distancia));
                activarVibracionTactica();
            }
            return; // Alerta de zona más cercana encontrada, detener iteración
        }
    }

    // Si el usuario ya no está en ninguna zona crítica, ocultar overlay pasivo
    ocultarAlertaProximidadPasiva();
}

// ── Vibración táctil ─────────────────────────────────────────
/**
 * Activa el patrón de vibración intermitente en dispositivos compatibles.
 * Patrón: 500ms ON · 200ms OFF · 500ms ON
 */
function activarVibracionTactica() {
    if ('vibrate' in navigator) {
        navigator.vibrate([500, 200, 500]);
    }
}

// ── Mostrar overlay de alerta ────────────────────────────────
/**
 * Muestra el panel flotante de alerta de proximidad con el nombre de la zona
 * y la distancia calculada en metros.
 *
 * @param {{nombre: string, lat: number, lng: number, radioMetros: number}} zona
 * @param {number} distanciaMetros
 */
function mostrarAlertaProximidad(zona, distanciaMetros) {
    const overlay = document.getElementById('alertaProximidad');
    if (!overlay) return;

    document.getElementById('alertaZonaNombre').textContent = zona.nombre;
    document.getElementById('alertaDistancia').textContent  = `${distanciaMetros} m`;

    overlay.classList.remove('alerta-oculta');
    overlay.classList.add('alerta-visible');
}

// ── Cerrar overlay (botón ✕ o salida de zona) ────────────────
function ocultarAlertaProximidad() {
    const overlay = document.getElementById('alertaProximidad');
    if (!overlay) return;
    overlay.classList.remove('alerta-visible');
    overlay.classList.add('alerta-oculta');
}

/**
 * Oculta el overlay solo si el usuario sale de TODAS las zonas críticas.
 * No resetea el cooldown para evitar falsos negativos por fluctuación GPS.
 */
function ocultarAlertaProximidadPasiva() {
    const overlay = document.getElementById('alertaProximidad');
    if (overlay && overlay.classList.contains('alerta-visible')) {
        // No cerramos automáticamente — el usuario cierra con el botón ✕
        // para asegurar que la alerta sea leída incluso con GPS oscilante
    }
}

// ── Iniciar motor ────────────────────────────────────────────
function iniciarMotorAlertas() {
    if (!navigator.geolocation) {
        alert('⚠️ Geolocalización no disponible en este dispositivo.');
        return;
    }

    motorAlertas.watchId = navigator.geolocation.watchPosition(
        (position) => {
            verificarProximidad(position.coords);
            actualizarIndicadorGPS(true, position.coords.accuracy);
        },
        (error) => {
            let msg = 'Error GPS';
            if (error.code === 1) msg = 'Permiso de ubicación denegado';
            else if (error.code === 2) msg = 'Posición no disponible';
            else if (error.code === 3) msg = 'Tiempo de espera GPS agotado';
            actualizarIndicadorGPS(false, null, msg);
        },
        {
            enableHighAccuracy: true,   // GPS de alta precisión
            timeout:            10000,  // Máximo 10 s por lectura
            maximumAge:         0       // Sin caché — siempre posición fresca
        }
    );

    motorAlertas.activo = true;
    renderizarMarcadoresZonasCriticas();
    actualizarUIMotor();
}

// ── Detener motor ────────────────────────────────────────────
function detenerMotorAlertas() {
    if (motorAlertas.watchId !== null) {
        navigator.geolocation.clearWatch(motorAlertas.watchId);
        motorAlertas.watchId = null;
    }
    motorAlertas.activo       = false;
    motorAlertas.ultimaAlerta = null;

    eliminarMarcadoresZonasCriticas();
    ocultarAlertaProximidad();
    actualizarIndicadorGPS(false);
    actualizarUIMotor();
}

// ── Toggle desde botón UI ────────────────────────────────────
function toggleMotorAlertas() {
    if (motorAlertas.activo) {
        detenerMotorAlertas();
    } else {
        iniciarMotorAlertas();
    }
}

// ── Listener del checkbox del Motor de Alertas ───────────────
(function () {
    const chk = document.getElementById('motorAlertasToggle');
    if (chk) {
        chk.addEventListener('change', function () {
            // Sincronizar: si el checkbox cambió a un estado distinto al motor, actuar
            if (chk.checked && !motorAlertas.activo) {
                iniciarMotorAlertas();
            } else if (!chk.checked && motorAlertas.activo) {
                detenerMotorAlertas();
            }
        });
    }
})();

// ── Actualizar estado visual del toggle y status del panel ───
function actualizarUIMotor() {
    const toggle    = document.getElementById('motorAlertasToggle');
    const statusTxt = document.getElementById('motorAlertasStatus');

    if (motorAlertas.activo) {
        if (toggle)    toggle.checked       = true;
        if (statusTxt) statusTxt.textContent = 'Motor activo — monitoreando GPS';
        if (statusTxt) statusTxt.style.color = '#4ade80';
    } else {
        if (toggle)    toggle.checked       = false;
        if (statusTxt) statusTxt.textContent = 'Motor detenido';
        if (statusTxt) statusTxt.style.color = '#94a3b8';
    }
}

// ── Indicador de precisión GPS ───────────────────────────────
function actualizarIndicadorGPS(activo, precision, errorMsg) {
    const el = document.getElementById('gpsAccuracyBadge');
    if (!el) return;
    if (!activo) {
        el.textContent = errorMsg || '—';
        el.style.color = errorMsg ? '#f87171' : '#64748b';
    } else {
        el.textContent = precision ? `±${Math.round(precision)} m` : 'Buscando...';
        el.style.color = precision && precision <= 20 ? '#4ade80' : '#fbbf24';
    }
}

// ── Marcadores de zonas críticas en el mapa ──────────────────
function renderizarMarcadoresZonasCriticas() {
    eliminarMarcadoresZonasCriticas();
    zonasCriticas.forEach(zona => {
        const marker = L.circleMarker([zona.lat, zona.lng], {
            radius:      12,
            fillColor:   '#ef4444',
            color:       '#fca5a5',
            weight:      2,
            opacity:     0.9,
            fillOpacity: 0.35
        }).bindPopup(
            `<div style="font-family:Montserrat,sans-serif;font-size:12px;">
                <b style="color:#ef4444;">⚠ Zona Crítica</b><br>
                ${zona.nombre}<br>
                <span style="color:#94a3b8;font-size:10px;">Radio de alerta: ${zona.radioMetros} m</span>
            </div>`
        ).addTo(map);
        zonasMarkers.push(marker);
    });
}

function eliminarMarcadoresZonasCriticas() {
    zonasMarkers.forEach(m => map.removeLayer(m));
    zonasMarkers = [];
}
// ============================================================
// FIN — MOTOR DE ALERTAS PREVENTIVAS DE PROXIMIDAD
// ============================================================
