const API_BASE = ''; 
let currentState = { isClimateOn: false };
let isBusy = false;

// --- DOM ELEMENTE ---
const els = {
    // Dashboard (Große Stats)
    hvBat: document.getElementById('hvBat'),
    range: document.getElementById('range'),
    
    // Info Zeile
    statLock: document.getElementById('statLock'),
    stat12v: document.getElementById('stat12v'),
    statPlug: document.getElementById('statPlug'),
    
    updateTime: document.getElementById('updateTime'),
    
    // Auto Visualisierung
    car: document.querySelector('.car-container'),
    doors: {
        fl: document.querySelector('.door-fl'), fr: document.querySelector('.door-fr'),
        rl: document.querySelector('.door-rl'), rr: document.querySelector('.door-rr'),
        trunk: document.querySelector('.trunk'), hood: document.querySelector('.hood'),
    },
    interior: {
        seatDriver: document.getElementById('seatDriver'),
        steering: document.getElementById('steering'),
        rearHeat: document.getElementById('rearHeat')
    },
    lockIcon: document.getElementById('lockIcon'),
    
    // Cards & Inputs
    climateVal: document.getElementById('climateVal'),
    chargeStatus: document.getElementById('chargeStatus'),
    tempRange: document.getElementById('tempRange'),
    durRange: document.getElementById('durationRange'),
    defrostCheck: document.getElementById('defrostCheck'),
    tempDisplay: document.getElementById('tempDisplay'),
    durDisplay: document.getElementById('durDisplay'),
    loader: document.getElementById('loader')
};

// --- API KOMMUNIKATION ---

async function fetchStatus(refresh = false) {
    if(isBusy && !refresh) return; 
    showLoader(true);
    try {
        const res = await fetch(refresh ? '/status/refresh' : '/status');
        const json = await res.json();
        if(json.success) updateUI(json.data);
    } catch(e) { console.error("Fetch Error:", e); }
    showLoader(false);
}

async function sendCmd(endpoint, body = {}, sourceBtn = null) {
    if(isBusy) return; 
    isBusy = true;
    let originalIcon = "";
    if(sourceBtn) {
        originalIcon = sourceBtn.innerHTML;
        sourceBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        sourceBtn.classList.add('disabled');
    } else { showLoader(true); }

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        const json = await res.json();
        if(json.success) setTimeout(() => fetchStatus(false), 2000);
        else alert("Fehler: " + (json.details || json.error || "Unbekannt"));
    } catch(e) { alert("Verbindungsfehler"); } 
    finally {
        isBusy = false;
        if(sourceBtn) {
            sourceBtn.innerHTML = originalIcon;
            sourceBtn.classList.remove('disabled');
        } else { showLoader(false); }
    }
}

// --- UI UPDATE LOGIC ---

function updateUI(data) {
    console.log("🔥 DATA:", data);
    const state = data.data || data; 
    const get = (path) => path.split('.').reduce((acc, part) => acc && acc[part], state);

    // 1. Batterie
    const batVal = Math.round(get('Green.BatteryManagement.BatteryRemain.Ratio') || 0);
    if(els.hvBat) {
        els.hvBat.innerText = batVal + '%';
        els.hvBat.className = "status-value"; 
        if(batVal >= 60) els.hvBat.classList.add('stat-green');
        else if(batVal < 20) els.hvBat.classList.add('stat-red');
        else els.hvBat.classList.add('stat-orange');
    }

    // 2. Reichweite
    const rangeVal = Math.round(get('Drivetrain.FuelSystem.DTE.Total') || 0);
    if(els.range) {
        els.range.innerText = rangeVal;
        els.range.className = "status-value"; 
        if(rangeVal >= 300) els.range.classList.add('stat-green');
        else if(rangeVal < 50) els.range.classList.add('stat-red');
        else els.range.classList.add('stat-orange');
    }

    // 3a. 12V Batterie
    const auxFail = get('Electronics.Battery.Auxiliary.FailWarning'); 
    const battStatusOld = get('LowVoltageBattery.BatteryStatus');
    let is12vOk = true;
    if (auxFail !== undefined) is12vOk = (auxFail === 0);
    else if (battStatusOld !== undefined) is12vOk = (battStatusOld === 1);
    
    if(els.stat12v) {
        if (is12vOk) {
            els.stat12v.innerHTML = '<i class="fa-solid fa-car-battery"></i> 12V: OK';
            els.stat12v.className = 'info-badge active';
        } else {
            els.stat12v.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 12V: Prüfen';
            els.stat12v.className = 'info-badge warning';
        }
    }

    // 3b. Stecker & Laden
    const seq = get('Green.ChargingInformation.SequenceDetails');
    const remainTime = get('Green.ChargingInformation.Charging.RemainTime') || 0;
    
    let plugText = "Nicht angesteckt";
    let plugClass = "info-badge"; 
    let plugIcon = "fa-plug-circle-xmark";

    if (seq === 8) {
        plugText = "Lädt...";
        plugClass = "info-badge active stat-green";
        plugIcon = "fa-bolt";
    } else if (seq === 12) {
        plugText = "Pausiert";
        plugClass = "info-badge warning";
        plugIcon = "fa-pause";
    } else if (seq === 2) {
        plugText = "Fertig";
        plugClass = "info-badge active stat-green";
        plugIcon = "fa-check";
    } else if (seq === 0) {
        const fast = get('Green.ChargingInformation.ConnectorFastening.State');
        if (fast === 1) {
            plugText = "Angesteckt";
            plugClass = "info-badge active";
            plugIcon = "fa-plug";
        } else {
            plugText = "Nicht angesteckt";
        }
    } else if (remainTime > 0) {
        plugText = "Lädt...";
        plugClass = "info-badge active stat-green";
        plugIcon = "fa-bolt";
    }

    if(els.statPlug) {
        els.statPlug.innerHTML = `<i class="fa-solid ${plugIcon}"></i> ${plugText}`;
        els.statPlug.className = plugClass;
        if(plugClass.includes('stat-green')) els.statPlug.style.borderColor = 'var(--success)';
        else if(plugClass.includes('warning')) els.statPlug.style.borderColor = 'var(--danger)';
        else if(plugClass.includes('active')) els.statPlug.style.borderColor = 'var(--accent)';
        else els.statPlug.style.borderColor = '';
    }

    // 4. Zentralverriegelung (0 = ZU, 1 = OFFEN)
    const lockV1 = get('Body.Door.Row1.Driver.Lock');
    const lockV2 = get('Cabin.Door.Row1.Driver.Lock');
    const lockVal = (lockV2 !== undefined) ? lockV2 : (lockV1 !== undefined ? lockV1 : 0);
    const isLocked = (lockVal === 0);

    if(isLocked) {
        els.car.classList.add('locked');
        if(els.lockIcon) { els.lockIcon.className = "fa-solid fa-lock"; els.lockIcon.style.color = ""; }
    } else {
        els.car.classList.remove('locked');
        if(els.lockIcon) { els.lockIcon.className = "fa-solid fa-lock-open"; els.lockIcon.style.color = "var(--danger)"; }
    }

    if(els.statLock) {
        if(isLocked) {
            els.statLock.innerHTML = '<i class="fa-solid fa-lock"></i> Verriegelt';
            els.statLock.className = 'info-badge active'; 
        } else {
            els.statLock.innerHTML = '<i class="fa-solid fa-lock-open"></i> Entsperrt';
            els.statLock.className = 'info-badge warning';
        }
    }

    // 5. Türen
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

    // 6. Klima (FIX: Blower Speed > 0 ist das Kriterium)
    const blowerSpeed = get('Cabin.HVAC.Row1.Driver.Blower.SpeedLevel');
    // Temperatur nur für Anzeige lesen
    const hvacTemp = get('Cabin.HVAC.Row1.Driver.Temperature.Value');
    
    // Logik: Wenn Lüfter an ist, läuft die Klima/Heizung
    currentState.isClimateOn = (blowerSpeed > 0);

    if(els.climateVal) {
        if (currentState.isClimateOn) {
            // Wenn an, zeigen wir die Zieltemperatur (falls verfügbar, sonst "AN")
            const tempText = (hvacTemp && hvacTemp !== 'OFF') ? hvacTemp : "AN";
            els.climateVal.innerText = `AN (${tempText})`; 
            els.climateVal.style.color = '#007aff';
        } else {
            els.climateVal.innerText = "AUS";
            els.climateVal.style.color = 'inherit';
        }
    }
    const btnFan = document.getElementById('btnFanStatus');
    if(btnFan) btnFan.style.color = currentState.isClimateOn ? '#007aff' : 'var(--primary)';

    // 7. Interieur (Sitz 2 = AUS)
    const isSeatActive = (val) => val > 0 && val !== 2;
    toggleActive(els.interior.seatDriver, isSeatActive(get('Cabin.Seat.Row1.Driver.Climate.State')));
    toggleActive(els.interior.steering, get('SteeringWheel.Heat.State') > 0);
    toggleActive(els.interior.rearHeat, get('Body.Windshield.Rear.Defog.State') > 0);

    // 8. Zeit
    const rawDate = get('Location.Date') || get('lastUpdateTime'); 
    if (rawDate && els.updateTime) {
        let dateStr = "--:--";
        if (rawDate.length >= 14) {
            const d = rawDate.substring(6,8), m = rawDate.substring(4,6), h = rawDate.substring(8,10), min = rawDate.substring(10,12);
            dateStr = `${d}.${m}. ${h}:${min}`;
        }
        els.updateTime.innerText = dateStr;
    }
}

// --- HELPER ---
function toggleDoor(el, s) { if(el) s ? el.classList.add('open') : el.classList.remove('open'); }
function toggleActive(el, s) { if(el) s ? el.classList.add('active') : el.classList.remove('active'); }
function showLoader(s) { if(els.loader) els.loader.style.display = s ? 'flex' : 'none'; }

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
            const info = json.serverInfo;
            document.getElementById('confIp').innerText = info.ip; 
            document.getElementById('confPort').innerText = info.port; 
            document.getElementById('confVer').innerText = info.version;
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
            if(statEl && info.mqttStatus) {
                statEl.innerText = info.mqttStatus;
                if(info.mqttStatus.includes('Verbunden')) { statEl.style.background = '#d4edda'; statEl.style.color = '#155724'; }
                else if(info.mqttStatus.includes('Fehler') || info.mqttStatus.includes('Offline')) { statEl.style.background = '#f8d7da'; statEl.style.color = '#721c24'; }
                else { statEl.style.background = '#eee'; statEl.style.color = '#333'; }
            }
        }
    } catch(e) { console.error(e); }
}

window.saveConfig = async () => {
    const config = {
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
        if (json.restartRequired) alert("Gespeichert! Bitte Container neu starten für Login-Änderung.");
        else { alert("Gespeichert! MQTT verbindet neu..."); loadConfig(); }
    } catch(e) { alert("Fehler beim Speichern"); }
};

window.downloadLoxoneTemplate = () => {
    const port = document.getElementById('udpPort').value || 7888;
    const xml = `<?xml version="1.0" encoding="utf-8"?><VirtualInUdp Title="Hyundai Bridge" Address="" Port="${port}"><Info templateType="1" minVersion="16011106"/><VirtualInUdpCmd Title="Hyundai SOC" Check="Hyundai_BatSoc: \\v" Analog="true" Unit="%" /><VirtualInUdpCmd Title="Hyundai Range" Check="Hyundai_Range: \\v" Analog="true" Unit="km" /><VirtualInUdpCmd Title="Hyundai Locked" Check="Hyundai_Locked: \\v" Analog="true" /><VirtualInUdpCmd Title="Hyundai Climate" Check="Hyundai_Climate: \\v" Analog="true" /><VirtualInUdpCmd Title="Hyundai Charging" Check="Hyundai_Charging: \\v" Analog="true" /></VirtualInUdp>`;
    const blob = new Blob([xml], { type: 'text/xml' }); const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = "Hyundai.xml"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

// --- ACTIONS ---
window.actionClimateToggle = () => { currentState.isClimateOn ? sendCmd('/climate/stop', {}, document.getElementById('btnFanStatus')) : actionClimate(false, document.getElementById('btnFanStatus')); };
window.actionClimate = (isWinter = false, btn = null) => { sendCmd('/climate/start', { temperature: parseFloat(els.tempRange.value), duration: parseInt(els.durRange.value), defrost: isWinter ? true : (els.defrostCheck ? els.defrostCheck.checked : false), heating: true }, btn || (window.event ? window.event.currentTarget : null)); };
window.actionClimateStop = () => sendCmd('/climate/stop', {}, window.event.currentTarget);
window.actionLock = () => sendCmd('/lock', {}, window.event.currentTarget);
window.actionUnlock = () => sendCmd('/unlock', {}, window.event.currentTarget);
window.actionChargeStart = () => sendCmd('/charge/start', {}, window.event.currentTarget);
window.actionForce = () => { if(confirm("Live Update?")) fetchStatus(true); };
window.actionRefresh = () => fetchStatus(false);
window.updateDisplays = () => { if(els.tempDisplay) els.tempDisplay.innerText = els.tempRange.value + '°C'; if(els.durDisplay) els.durDisplay.innerText = els.durRange.value + 'm'; };

fetchStatus();