const els = {
    hvBat: document.getElementById('hvBat'),
    range: document.getElementById('range'),
    statLock: document.getElementById('statLock'),
    stat12v: document.getElementById('stat12v'),
    statPlug: document.getElementById('statPlug'),
    updateTime: document.getElementById('updateTime'),
    car: document.querySelector('.car-container'),
    doors: { 
        fl: document.querySelector('.door-fl'), 
        fr: document.querySelector('.door-fr'), 
        rl: document.querySelector('.door-rl'), 
        rr: document.querySelector('.door-rr'), 
        trunk: document.querySelector('.trunk'), 
        hood: document.querySelector('.hood') 
    },
    interior: { 
        seatDriver: document.getElementById('seatDriver'), 
        steering: document.getElementById('steering'), 
        rearHeat: document.getElementById('rearHeat') 
    },
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
        // Bluelinky liefert die Daten oft in einem .data oder .status Feld
        if(json.success) updateUI(json.data || json);
    } catch(e) { console.error("Fetch Error:", e); }
    showLoader(false);
}

async function triggerPreset(mode) {
    if(!confirm(mode.toUpperCase() + " Modus starten?")) return;
    showLoader(true);
    try {
        const res = await fetch(`/climate/trigger/${mode}`);
        const json = await res.json();
        if(json.success) {
            alert("OK! Befehl gesendet.");
            setTimeout(() => fetchStatus(false), 2000);
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

async function simplePost(url) {
    showLoader(true);
    try { 
        await fetch(url, {method:'POST'}); 
        setTimeout(() => fetchStatus(false), 2000); 
    } catch(e){ console.error(e); }
    showLoader(false);
}

// --- UI Logic ---
function updateUI(data) {
    console.log("🔥 UI UPDATE mit DATA:", data);
    
    // Hilfsfunktion für sicheren Zugriff (Case-Sensitive für Kona!)
    const get = (path) => path.split('.').reduce((acc, part) => acc && acc[part], data);

    // 1. Batterie (SOC) - Dein Node-Red Pfad
    const batVal = Math.round(get('Green.BatteryManagement.BatteryRemain.Ratio') || 0);
    els.hvBat.innerText = batVal + '%';
    els.hvBat.className = "status-value " + (batVal >= 60 ? 'stat-green' : (batVal < 20 ? 'stat-red' : 'stat-orange'));
    
    // 2. Reichweite (Range) - Dein Node-Red Pfad
    const rangeVal = Math.round(get('Drivetrain.FuelSystem.DTE.Total') || 0);
    els.range.innerText = rangeVal;

    // 3. Status Badges & Icons
    // Verriegelung: Kona nutzt oft Cabin.Door.Row1.Driver.Lock (0 = Verriegelt)
    const isLocked = (get('Cabin.Door.Row1.Driver.Lock') === 0);
    
    els.statLock.innerHTML = isLocked ? '<i class="fa-solid fa-lock"></i> Verriegelt' : '<i class="fa-solid fa-lock-open"></i> Offen';
    els.statLock.className = isLocked ? 'info-badge active' : 'info-badge warning';
    
    if(els.car) {
        isLocked ? els.car.classList.add('locked') : els.car.classList.remove('locked');
    }
    if(els.lockIcon) {
        els.lockIcon.className = isLocked ? "fa-solid fa-lock" : "fa-solid fa-lock-open";
        els.lockIcon.style.color = isLocked ? "" : "var(--danger)";
    }

    // 12V Batterie (Electronics.Battery.Level)
    const auxLevel = get('Electronics.Battery.Level');
    if (auxLevel !== undefined) {
        els.stat12v.innerHTML = `<i class="fa-solid fa-car-battery"></i> 12V: ${auxLevel}%`;
    }

    // Stecker & Laden (SequenceDetails 8 = Laden, ConnectorFastening 1 = Gesteckt)
    const seq = get('Green.ChargingInformation.SequenceDetails');
    const plugged = get('Green.ChargingInformation.ConnectorFastening.State') === 1;
    
    let plugText = plugged ? "Angesteckt" : "Nicht angesteckt";
    let plugIcon = plugged ? "fa-plug" : "fa-plug-circle-xmark";
    let plugClass = plugged ? "info-badge active" : "info-badge";

    if (seq === 8) {
        plugText = "Lädt...";
        plugIcon = "fa-bolt";
        plugClass = "info-badge active stat-green";
    }

    if(els.statPlug) {
        els.statPlug.innerHTML = `<i class="fa-solid ${plugIcon}"></i> ${plugText}`;
        els.statPlug.className = plugClass;
    }

    // 4. Türen & Klappen (0 = Zu, 1 = Auf)
    const isDoorOpen = (p) => get(`Cabin.Door.${p}.Open`) === 1 || get(`Body.Door.${p}.Open`) === 1;
    
    toggleDoor(els.doors.fl, isDoorOpen('Row1.Driver'));
    toggleDoor(els.doors.fr, isDoorOpen('Row1.Passenger'));
    toggleDoor(els.doors.rl, isDoorOpen('Row2.Left'));
    toggleDoor(els.doors.rr, isDoorOpen('Row2.Right'));
    toggleDoor(els.doors.trunk, get('Body.Trunk.Open') === 1);
    toggleDoor(els.doors.hood, get('Body.Hood.Open') === 1);

    // 5. Interieur (Sitzheizung, Lenkrad, Heckscheibe)
    // Sitzheizung: State 2 ist Aus, alles andere (Heizen) markieren wir
    const seatVal = get('Cabin.Seat.Row1.Driver.Climate.State');
    if (seatVal && seatVal !== 2) els.interior.seatDriver.classList.add('active');
    else els.interior.seatDriver.classList.remove('active');

    if (get('Cabin.SteeringWheel.Heat.State') === 1) els.interior.steering.classList.add('active');
    else els.interior.steering.classList.remove('active');

    if (get('Body.Windshield.Rear.Defog.State') === 1) els.interior.rearHeat.classList.add('active');
    else els.interior.rearHeat.classList.remove('active');

    // 6. Zeit-Stempel (Format: 20260305121206.000)
    const rawDate = get('Location.Date') || get('Date');
    if (rawDate && rawDate.length >= 12) {
        const d = rawDate.substring(6, 8), m = rawDate.substring(4, 6), h = rawDate.substring(8, 10), min = rawDate.substring(10, 12);
        els.updateTime.innerText = `${d}.${m}. ${h}:${min}`;
    }
}

function toggleDoor(el, s) { if(el) s ? el.classList.add('open') : el.classList.remove('open'); }
function showLoader(s) { if(els.loader) els.loader.style.display = s ? 'flex' : 'none'; }

// --- Tabs & Config ---
window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    const btnIdx = (tabId === 'dashboard' ? 0 : 1);
    document.querySelectorAll('.tab-btn')[btnIdx].classList.add('active');
    if(tabId === 'config') loadConfig();
};

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const json = await res.json();
        if(json.success) {
            const c = json.config;
            const p = c.presets || {};
            // Befüllen der Formularfelder (Winter/Sommer)
            if(p.winter) {
                document.getElementById('win_temp').value = p.winter.temperature;
                document.getElementById('win_dur').value = p.winter.duration;
                document.getElementById('win_heat').checked = p.winter.heating;
                document.getElementById('win_extras').value = p.winter.extras;
            }
            // ... (restliche Felder wie gehabt)
            document.getElementById('bluelinkUser').value = c.bluelinkUser || '';
            document.getElementById('udpHost').value = c.udpHost || '';
            document.getElementById('enableUdp').checked = c.enableUdp || false;
        }
    } catch(e) { console.error(e); }
}

// Initialer Start
fetchStatus();