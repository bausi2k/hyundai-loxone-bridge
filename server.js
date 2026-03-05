const express = require('express');
const BluelinkyModule = require('bluelinky');
const Bluelinky = BluelinkyModule.BlueLinky || BluelinkyModule.default || BluelinkyModule;

const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const mqtt = require('mqtt');

// --- KONFIGURATION ---
const CONFIG_FILE = path.join(__dirname, 'config.json');

let config = {
    bluelinkUser: "", bluelinkPass: "", bluelinkPin: "", bluelinkVin: "", brand: "hyundai",
    udpHost: "", udpPort: 7888, enableUdp: false,
    mqttHost: "", mqttPort: 1883, mqttUser: "", mqttPass: "", mqttTopic: "hyundai",
    presets: {
        winter: { temperature: 22, duration: 20, defrost: true, heating: true, climate: true, extras: '{"seatHeatingDriver":1, "steeringWheel":1}' },
        summer: { temperature: 22, duration: 15, defrost: false, heating: false, climate: true, extras: '{}' }
    }
};

try {
    if (fs.existsSync(CONFIG_FILE)) {
        const diskConfig = JSON.parse(fs.readFileSync(CONFIG_FILE));
        config = { ...config, ...diskConfig };
    }
} catch (e) { console.error("Config Load Error:", e); }

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let client, vehicle;
const udpClient = dgram.createSocket('udp4');
let mqttClient = null;


function pushToLoxone(rawData) {
    if (!config.enableUdp || !config.udpHost || !config.udpPort) return;

    // Wir nutzen die Struktur aus deinem JSON-Export
    const d = rawData; 

    const values = {
        'Hyundai_BatSoc': d.Green?.BatteryManagement?.BatteryRemain?.Ratio || 0,
        'Hyundai_Range': d.Drivetrain?.FuelSystem?.DTE?.Total || 0,
        'Hyundai_12vBat': d.Electronics?.Battery?.Level || 0,
        'Hyundai_Locked': d.Cabin?.Door?.Row1?.Driver?.Lock === 0 ? 1 : 0,
        'Hyundai_Charging': d.Green?.ChargingInformation?.SequenceDetails === 8 ? 1 : 0,
        'Hyundai_Plugged': d.Green?.ChargingInformation?.ConnectorFastening?.State === 1 ? 1 : 0
    };

    Object.entries(values).forEach(([key, val]) => {
        const message = Buffer.from(`${key}=${val}`);
        udpClient.send(message, config.udpPort, config.udpHost);
    });
    
    console.log(`📡 KONA UDP SUCCESS: SOC ${values.Hyundai_BatSoc}%, Range ${values.Hyundai_Range}km`);
}


// --- HELPER: VIN SICHER AUSLESEN ---
function getVin(v) {
    if (typeof v.vin === 'function') return v.vin();
    if (v.vehicleConfig && v.vehicleConfig.vin) return v.vehicleConfig.vin;
    return v.vin;
}

// --- BLUELINK INIT ---
async function initBluelink() {
    if (!config.bluelinkUser || !config.bluelinkPass) return;
    try {
        console.log(`🔧 Init Bluelinky für ${config.bluelinkUser}...`);
        client = new Bluelinky({ 
            username: config.bluelinkUser, 
            password: config.bluelinkPass, 
            region: 'EU', 
            brand: config.brand, 
            pin: config.bluelinkPin 
        });
        await client.login();
        console.log("✅ Hyundai Login erfolgreich!");
        const vehicles = await client.getVehicles();
        if (vehicles.length === 0) return;
        vehicle = config.bluelinkVin ? vehicles.find(v => getVin(v) === config.bluelinkVin) : vehicles[0];
        if (vehicle) console.log(`🚘 Verbunden mit: ${vehicle.vehicleConfig?.name || 'Fahrzeug'} (${getVin(vehicle)}) `);
    } catch (e) { console.error("❌ Login Fehler:", e.message); }
}

// --- MQTT INIT ---
function initMqtt() {
    if (mqttClient) { mqttClient.end(); mqttClient = null; }
    if (!config.mqttHost) return;
    mqttClient = mqtt.connect(`mqtt://${config.mqttHost}:${config.mqttPort}`, { username: config.mqttUser, password: config.mqttPass });
}

const requireVehicle = (req, res, next) => {
    if (!vehicle) return res.status(503).json({ success: false, error: "Nicht mit Fahrzeug verbunden." });
    next();
};

const handleCommandError = (res, e, cmd) => {
    console.error(`❌ '${cmd}' ERROR:`, e);
    const status = (e.message && e.message.includes('Duplicate')) ? 429 : 500;
    res.status(status).json({ success: false, error: e.message, details: e });
};

// ================= ROUTES =================

app.get('/status', requireVehicle, async (req, res) => { 
    try { 
        const status = await vehicle.status(false);
        pushToLoxone(status); // <--- TRIGGER FÜR LOXONE
        res.json({ success: true, data: status }); 
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/status/refresh', requireVehicle, async (req, res) => { 
    try { 
        const status = await vehicle.status(true);
        pushToLoxone(status); // <--- TRIGGER FÜR LOXONE
        res.json({ success: true, data: status }); 
    } catch(e) { handleCommandError(res, e, 'Refresh'); } 
});

// Klima Start via URL Parameter (Loxone GET)
app.get('/climate/start', requireVehicle, async (req, res) => {
    try {
        const q = req.query;
        const conf = { temperature: 21, duration: 15, defrost: false, heating: true, climate: true, windscreenHeating: false };
        const isTrue = (val) => val === '1' || val === 'true' || val === 'on';
        if (q.temp !== undefined) conf.temperature = parseFloat(q.temp);
        if (q.duration !== undefined) conf.duration = parseInt(q.duration);
        if (q.defrost !== undefined) { conf.defrost = isTrue(q.defrost); conf.windscreenHeating = conf.defrost; }
        if (q.heating !== undefined) conf.heating = isTrue(q.heating);
        if (q.climate !== undefined) conf.climate = isTrue(q.climate);
        
        // Dynamische Parameter (z.B. seatHeatingDriver)
        for (const [key, value] of Object.entries(q)) {
            if (!['temp', 'duration', 'defrost', 'heating', 'climate'].includes(key)) {
                conf[key] = isNaN(value) ? value : Number(value);
            }
        }
        await vehicle.start(conf);
        res.json({ success: true, configSent: conf });
    } catch (e) { handleCommandError(res, e, `Climate GET Start`); }
});

// Restliche Routen bleiben gleich...
app.get('/climate/trigger/:mode', requireVehicle, async (req, res) => {
    const mode = req.params.mode; 
    const preset = config.presets ? config.presets[mode] : null;
    if (!preset) return res.status(404).json({ success: false, error: `Preset '${mode}' nicht gefunden.` });
    try {
        let extras = {};
        try { if (preset.extras) extras = JSON.parse(preset.extras); } catch(e) {}
        const conf = { temperature: parseFloat(preset.temperature), duration: parseInt(preset.duration), defrost: !!preset.defrost, heating: !!preset.heating, climate: !!preset.climate, windscreenHeating: !!preset.defrost, ...extras };
        await vehicle.start(conf);
        res.json({ success: true, configSent: conf });
    } catch (e) { handleCommandError(res, e, `Trigger ${mode}`); }
});

app.get('/api/config', (req, res) => {
    const safeConfig = { ...config, bluelinkPass: config.bluelinkPass ? "***" : "", bluelinkPin: config.bluelinkPin ? "****" : "" };
    res.json({ success: true, config: safeConfig });
});

app.post('/api/config', (req, res) => {
    const newC = req.body;
    if (!newC.bluelinkPass && config.bluelinkPass) newC.bluelinkPass = config.bluelinkPass;
    if (!newC.bluelinkPin && config.bluelinkPin) newC.bluelinkPin = config.bluelinkPin;
    config = { ...config, ...newC };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    initMqtt();
    initBluelink();
    res.json({ success: true });
});

// In der server.js hinzufügen/korrigieren:
app.get('/climate/stop', requireVehicle, async (req, res) => { 
    try { await vehicle.stop(); res.json({ success: true }); } 
    catch(e) { handleCommandError(res, e, 'Stop GET'); } 
});

app.post('/climate/stop', requireVehicle, async (req, res) => { 
    try { await vehicle.stop(); res.json({ success: true }); } 
    catch(e) { handleCommandError(res, e, 'Stop POST'); } 
});
// Schloss verriegeln (GET & POST)
app.get('/lock', requireVehicle, async (req, res) => { try { await vehicle.lock(); res.json({ success: true }); } catch(e) { handleCommandError(res, e, 'Lock GET'); } });
app.post('/lock', requireVehicle, async (req, res) => { try { await vehicle.lock(); res.json({ success: true }); } catch(e) { handleCommandError(res, e, 'Lock POST'); } });

// Schloss entriegeln (GET & POST)
app.get('/unlock', requireVehicle, async (req, res) => { try { await vehicle.unlock(); res.json({ success: true }); } catch(e) { handleCommandError(res, e, 'Unlock GET'); } });
app.post('/unlock', requireVehicle, async (req, res) => { try { await vehicle.unlock(); res.json({ success: true }); } catch(e) { handleCommandError(res, e, 'Unlock POST'); } });
app.listen(8444, '0.0.0.0', () => {
    console.log("🚀 Server läuft auf Port 8444");
    initBluelink();
    initMqtt();
});