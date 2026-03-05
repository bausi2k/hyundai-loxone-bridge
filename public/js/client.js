const els = {
    hvBat: document.getElementById('hvBat'),
    range: document.getElementById('range'),
    statLock: document.getElementById('statLock'),
    stat12v: document.getElementById('stat12v'),
    statPlug: document.getElementById('statPlug'),
    updateTime: document.getElementById('updateTime'),
    car: document.querySelector('.car-container'),
    doors: { fl: document.querySelector('.door-fl'), fr: document.querySelector('.door-fr'), rl: document.querySelector('.door-rl'), rr: document.querySelector('.door-rr'), trunk: document.querySelector('.trunk'), hood: document.querySelector('.hood') },
    interior: { seatDriver: document.getElementById('seatDriver'), steering: document.getElementById('steering'), rearHeat: document.getElementById('rearHeat') },
    lockIcon: document.getElementById('lockIcon'),
    loader: document.getElementById('loader')
};

let isBusy = false;

// --- API Calls ---
async function fetchStatus(refresh = false) {
    if(isBusy && !refresh) return;
    showLoader(true);
    try {
        const res = await fetch(refresh ? '/status/refresh' : '/status');
        const json = await res.json();
        if(json.success) updateUI(json.data);
    } catch(e) { console.error(e); }
    showLoader(false);
}

// Preset Auslösen (Winter/Sommer)
async function triggerPreset(mode) {
    if(!confirm(mode.toUpperCase() + " Modus starten?")) return;
    showLoader(true);
    try {
        const res = await fetch(`/climate/trigger/${mode}`);
        const json = await res.json();
        if(json.success) {
            alert("OK! Befehl gesendet.");
            // Nach erfolgreichem Senden den Status nach 2 Sek neu laden
            setTimeout(()=>fetchStatus(false), 2000);
        } else {
            alert("Fehler: " + json.error);
        }
    } catch(e) { alert("Verbindungsfehler"); }
    showLoader(false);
}

// --- Standard Actions ---
async function actionClimateStop() { await simplePost('/climate/stop'); }
async function actionLock() { await simplePost('/lock'); }
async function actionUnlock() { await simplePost('/unlock'); }
async function actionForce() { if(confirm("Live Update weckt das Auto auf. Fortfahren?")) fetchStatus(true); }
async function actionRefresh() { fetchStatus(false); }
async function actionClimateToggle() { actionClimateStop(); } 

async function simplePost(url) {
    showLoader(true);
    try { await fetch(url, {method:'POST'}); setTimeout(()=>fetchStatus(false), 2000); } catch(e){}
    showLoader(false);
}

// --- UI Logic ---
function updateUI(data) {
    console.log("🔥 DATA:", data);
    const state = data.data || data;
    const get = (path) => path.split('.').reduce((acc, part) => acc && acc[part], state);

    // Batterie
    const batVal = Math.round(get('Green.BatteryManagement.BatteryRemain.Ratio') || 0);
    els.hvBat.innerText = batVal + '%';
    els.hvBat.className = "status-value " + (batVal>=60?'stat-green':(batVal<20?'stat-red':'stat-orange'));
    
    // Range
    const rangeVal = Math.round(get('Drivetrain.FuelSystem.DTE.Total') || 0);
    els.range.innerText = rangeVal;

    // Status Badges
    const lockV1 = get('Body.Door.Row1.Driver.Lock');
    const lockV2 = get('Cabin.Door.Row1.Driver.Lock');
    const lockVal = (lockV2 !== undefined) ? lockV2 : (lockV1 !== undefined ? lockV1 : 0);
    
    const isLocked = (lockVal === 0);
    els.statLock.innerHTML = isLocked ? '<i class="fa-solid fa-lock"></i> Verriegelt' : '<i class="fa-solid fa-lock-open"></i> Offen';
    els.statLock.className = isLocked ? 'info-badge active' : 'info-badge warning';
    
    // Auto Visualisierung (Schloss)
    if(isLocked) {
        els.car.classList.add('locked');
        if(els.lockIcon) { els.lockIcon.className = "fa-solid fa-lock"; els.lockIcon.style.color = ""; }
    } else {
        els.car.classList.remove('locked');
        if(els.lockIcon) { els.lockIcon.className = "fa-solid fa-lock-open"; els.lockIcon.style.color = "var(--danger)"; }
    }

    // 12V
    const auxFail = get('Electronics.Battery.Auxiliary.FailWarning'); 
    els.stat12v.innerHTML = (auxFail === 0) ? '<i class="fa-solid fa-car-battery"></i> 12V: OK' : '<i class="fa-solid fa-triangle-exclamation"></i> 12V: Prüfen';
    
    // Stecker
    const seq = get('Green.ChargingInformation.SequenceDetails');
    const remainTime = get('Green.ChargingInformation.Charging.RemainTime') || 0;
    
    let plugText = "Nicht angesteckt";
    let plugClass = "info-badge"; 
    let plugIcon = "fa-plug-circle-xmark";

    if (seq === 8) { plugText = "Lädt..."; plugClass = "info-badge active stat-green"; plugIcon = "fa-bolt"; }
    else if (seq === 12) { plugText = "Pausiert"; plugClass = "info-badge warning"; plugIcon = "fa-pause"; }
    else if (seq === 2) { plugText = "Fertig"; plugClass = "info-badge active stat-green"; plugIcon = "fa-check"; }
    else if (seq === 0) {
        const fast = get('Green.ChargingInformation.ConnectorFastening.State');
        if (fast === 1) { plugText = "Angesteckt"; plugClass = "info-badge active"; plugIcon = "fa-plug"; }
    } else if (remainTime > 0) { plugText = "Lädt..."; plugClass = "info-badge active stat-green"; plugIcon = "fa-bolt"; }

    if(els.statPlug) {
        els.statPlug.innerHTML = `<i class="fa-solid ${plugIcon}"></i> ${plugText}`;
        els.statPlug.className = plugClass;
        if(plugClass.includes('stat-green')) els.statPlug.style.borderColor = 'var(--success)';
        else if(plugClass.includes('warning')) els.statPlug.style.borderColor = 'var(--danger)';
        else if(plugClass.includes('active')) els.statPlug.style.borderColor = 'var(--accent)';
        else els.statPlug.style.borderColor = '';
    }

    // Türen
    const getOpen = (pathPart) => {
        const v1 = get(`Body.Door.${pathPart}.Open`);
        const v2 = get(`Cabin.Door.${pathPart}.Open`);
        return (v1 === 1 || v2 === 1);
    };
    toggleDoor(els.doors.fl, getOpen('Row1.Driver'));
    toggleDoor(els.doors.fr, getOpen('Row1.Passenger'));
    toggleDoor(els.doors.rl, getOpen('Row2.Left'));
    toggleDoor(els.doors.rr, getOpen('Row2.Right'));
    toggleDoor(els.doors.trunk, get('Body.Trunk.Open') === 1);
    toggleDoor(els.doors.hood, get('Body.Hood.Open') === 1);

    // Klima Status (Lüfter)
    const blowerSpeed = get('Cabin.HVAC.Row1.Driver.Blower.SpeedLevel');
    const isClimateOn = (blowerSpeed > 0);
    const btnFan = document.getElementById('btnFanStatus');
    if(btnFan) btnFan.style.color = isClimateOn ? '#007aff' : 'var(--primary)';

    // --- NEU: Interieur Visualisierung (Sitze, Lenkrad, Heckscheibe) ---
    
    // Sitzheizung: 2 ist Aus, 5-7 ist Heizen.
    const seatVal = get('Cabin.Seat.Row1.Driver.Climate.State');
    if (seatVal && seatVal !== 2 && seatVal !== 0) els.interior.seatDriver.classList.add('active');
    else els.interior.seatDriver.classList.remove('active');

    // Lenkrad: 1 = An
    if (get('SteeringWheel.Heat.State') === 1) els.interior.steering.classList.add('active');
    else els.interior.steering.classList.remove('active');

    // Heckscheibe: 1 = An
    if (get('Body.Windshield.Rear.Defog.State') === 1) els.interior.rearHeat.classList.add('active');
    else els.interior.rearHeat.classList.remove('active');

    // Zeit
    const rawDate = get('Location.Date') || get('lastUpdateTime');
    if (rawDate && rawDate.length >= 14) {
        const d = rawDate.substring(6,8), m = rawDate.substring(4,6), h = rawDate.substring(8,10), min = rawDate.substring(10,12);
        els.updateTime.innerText = `${d}.${m}. ${h}:${min}`;
    }
}

function toggleDoor(el, s) { if(el) s ? el.classList.add('open') : el.classList.remove('open'); }
function showLoader(s) { els.loader.style.display = s ? 'flex' : 'none'; }

// --- LIVE PREVIEW ---
window.updateMqttPreview = () => {
    const input = document.getElementById('mqttTopic');
    const display = document.getElementById('mqttExamples');
    if(input && display) {
        let base = input.value.trim() || 'hyundai';
        base = base.toLowerCase();
        display.innerHTML = `
            ${base}/green/batterymanagement/batteryremain/ratio = 80<br>
            ${base}/drivetrain/fuelsystem/dte/total = 350<br>
            ${base}/bridge/status = online
        `;
    }
};

// --- CONFIG ---
window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    if(tabId === 'dashboard') document.querySelectorAll('.tab-btn')[0].classList.add('active');
    else { document.querySelectorAll('.tab-btn')[1].classList.add('active'); loadConfig(); }
};

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const json = await res.json();
        if(json.success) {
            const c = json.config;
            const p = c.presets || {};
            
            // Winter Preset laden
            if(p.winter) {
                document.getElementById('win_temp').value = p.winter.temperature || 22;
                document.getElementById('win_dur').value = p.winter.duration || 20;
                document.getElementById('win_heat').checked = !!p.winter.heating;
                document.getElementById('win_defrost').checked = !!p.winter.defrost;
                document.getElementById('win_ac').checked = !!p.winter.climate;
                document.getElementById('win_extras').value = p.winter.extras || '{}';
            }
            // Sommer Preset laden
            if(p.summer) {
                document.getElementById('sum_temp').value = p.summer.temperature || 18;
                document.getElementById('sum_dur').value = p.summer.duration || 15;
                document.getElementById('sum_heat').checked = !!p.summer.heating;
                document.getElementById('sum_defrost').checked = !!p.summer.defrost;
                document.getElementById('sum_ac').checked = !!p.summer.climate;
                document.getElementById('sum_extras').value = p.summer.extras || '{}';
            }

            // Restliche Config
            document.getElementById('bluelinkUser').value = c.bluelinkUser || '';
            document.getElementById('bluelinkPass').value = c.bluelinkPass || '';
            document.getElementById('bluelinkPin').value = c.bluelinkPin || '';
            document.getElementById('bluelinkVin').value = c.bluelinkVin || '';
            if(c.brand) document.getElementById('brand').value = c.brand;
            document.getElementById('udpHost').value = c.udpHost || ''; 
            document.getElementById('udpPort').value = c.udpPort || ''; 
            document.getElementById('enableUdp').checked = c.enableUdp || false;
            document.getElementById('mqttHost').value = c.mqttHost || ''; 
            document.getElementById('mqttPort').value = c.mqttPort || 1883; 
            document.getElementById('mqttUser').value = c.mqttUser || ''; 
            document.getElementById('mqttPass').value = c.mqttPass || ''; 
            document.getElementById('mqttTopic').value = c.mqttTopic || 'hyundai';
            
            window.updateMqttPreview();
            
            const statEl = document.getElementById('mqttStatusDisplay');
            if(statEl && json.serverInfo && json.serverInfo.mqttStatus) {
                statEl.innerText = json.serverInfo.mqttStatus;
                if(json.serverInfo.mqttStatus.includes('Verbunden')) { statEl.style.background = '#d4edda'; statEl.style.color = '#155724'; }
                else if(json.serverInfo.mqttStatus.includes('Fehler') || json.serverInfo.mqttStatus.includes('Offline')) { statEl.style.background = '#f8d7da'; statEl.style.color = '#721c24'; }
                else { statEl.style.background = '#eee'; statEl.style.color = '#333'; }
            }
        }
    } catch(e) { console.error(e); }
}

window.saveConfig = async () => {
    // Presets aus Formular lesen
    const presets = {
        winter: {
            temperature: document.getElementById('win_temp').value,
            duration: document.getElementById('win_dur').value,
            heating: document.getElementById('win_heat').checked,
            defrost: document.getElementById('win_defrost').checked,
            climate: document.getElementById('win_ac').checked,
            extras: document.getElementById('win_extras').value
        },
        summer: {
            temperature: document.getElementById('sum_temp').value,
            duration: document.getElementById('sum_dur').value,
            heating: document.getElementById('sum_heat').checked,
            defrost: document.getElementById('sum_defrost').checked,
            climate: document.getElementById('sum_ac').checked,
            extras: document.getElementById('sum_extras').value
        }
    };

    const config = {
        presets: presets,
        bluelinkUser: document.getElementById('bluelinkUser').value,
        bluelinkPass: document.getElementById('bluelinkPass').value,
        bluelinkPin: document.getElementById('bluelinkPin').value,
        bluelinkVin: document.getElementById('bluelinkVin').value,
        brand: document.getElementById('brand').value,
        udpHost: document.getElementById('udpHost').value, 
        udpPort: document.getElementById('udpPort').value, 
        enableUdp: document.getElementById('enableUdp').checked,
        mqttHost: document.getElementById('mqttHost').value, 
        mqttPort: document.getElementById('mqttPort').value, 
        mqttUser: document.getElementById('mqttUser').value, 
        mqttPass: document.getElementById('mqttPass').value, 
        mqttTopic: document.getElementById('mqttTopic').value
    };
    
    try {
        const res = await fetch('/api/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(config) });
        const json = await res.json();
        alert("Gespeichert!");
        loadConfig();
    } catch(e) { alert("Fehler beim Speichern"); }
};

// Start
fetchStatus();