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
        if (vehicles.length === 0) {
            console.error("❌ Kein Fahrzeug gefunden!");
            return;
        }

        if (config.bluelinkVin) {
            vehicle = vehicles.find(v => getVin(v) === config.bluelinkVin);
        } else {
            vehicle = vehicles[0];
        }

        if (vehicle) {
            console.log(`🚘 Verbunden mit: ${vehicle.vehicleConfig?.name || 'Fahrzeug'} (${getVin(vehicle)}) `);
            try { await vehicle.status(false); } catch(e) {}
        }
    } catch (e) { console.error("❌ Login Fehler:", e.message); }
}

// --- MQTT INIT ---
function initMqtt() {
    if (mqttClient) { mqttClient.end(); mqttClient = null; }
    if (!config.mqttHost) return;

    mqttClient = mqtt.connect(`mqtt://${config.mqttHost}:${config.mqttPort}`, { username: config.mqttUser, password: config.mqttPass });
    mqttClient.on('connect', () => console.log("✅ MQTT: Verbunden!"));
    mqttClient.on('error', (e) => console.error("❌ MQTT Fehler:", e.message));
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

// --- NEU: GET REQUEST FÜR LOXONE MIT URL PARAMETERN ---
app.get('/climate/start', requireVehicle, async (req, res) => {
    try {
        const q = req.query; // Hier stecken alle ?temp=22&defrost=1 Variablen drin

        // 1. Grund-Konfiguration mit sicheren Standardwerten
        const conf = {
            temperature: 21,
            duration: 15,
            defrost: false,
            heating: true,
            climate: true,
            windscreenHeating: false
        };

        // Hilfsfunktionen für Loxone (die oft 1 oder 0 als String senden)
        const isTrue = (val) => val === '1' || val === 'true' || val === 'on';

        // 2. Bekannte Werte aus der URL überschreiben
        if (q.temp !== undefined) conf.temperature = parseFloat(q.temp);
        if (q.duration !== undefined) conf.duration = parseInt(q.duration);
        
        if (q.defrost !== undefined) {
            conf.defrost = isTrue(q.defrost);
            conf.windscreenHeating = conf.defrost; // Meistens sinnvoll das zu koppeln
        }
        if (q.heating !== undefined) conf.heating = isTrue(q.heating);
        if (q.climate !== undefined) conf.climate = isTrue(q.climate);

        // 3. Unbekannte Werte (wie seatHeatingDriver) dynamisch anhängen
        const ignoreKeys = ['temp', 'duration', 'defrost', 'heating', 'climate'];
        for (const [key, value] of Object.entries(q)) {
            if (!ignoreKeys.includes(key)) {
                // Wenn Loxone "1" oder "0" schickt, wandeln wir das in eine echte Zahl um
                if (!isNaN(value) && value.trim() !== '') {
                    conf[key] = Number(value); 
                } else if (value === 'true' || value === 'false') {
                    conf[key] = isTrue(value);
                } else {
                    conf[key] = value; // Falls es doch mal normaler Text ist
                }
            }
        }

        console.log(`🚀 Sende URL-Klimabefehl an Auto:`, JSON.stringify(conf, null, 2));
        
        await vehicle.start(conf);
        res.json({ success: true, message: `Climate GET Request gestartet`, configSent: conf });

    } catch (e) { handleCommandError(res, e, `Climate GET Start`); }
});


// (Bestehende Routen)
app.get('/climate/trigger/:mode', requireVehicle, async (req, res) => {
    const mode = req.params.mode; 
    const preset = config.presets ? config.presets[mode] : null;
    if (!preset) return res.status(404).json({ success: false, error: `Preset '${mode}' nicht gefunden.` });

    try {
        console.log(`🚀 Starte Preset '${mode}'...`);
        let extras = {};
        try { if (preset.extras) extras = JSON.parse(preset.extras); } catch(e) {}

        const conf = {
            temperature: parseFloat(preset.temperature),
            duration: parseInt(preset.duration),
            defrost: !!preset.defrost,
            heating: !!preset.heating,
            climate: !!preset.climate,
            windscreenHeating: !!preset.defrost,
            ...extras 
        };
        console.log(`📦 Sende Config:`, JSON.stringify(conf));
        await vehicle.start(conf);
        res.json({ success: true, message: `Preset ${mode} gestartet`, configSent: conf });
    } catch (e) { handleCommandError(res, e, `Trigger ${mode}`); }
});

app.get('/api/config', (req, res) => {
    const safeConfig = { ...config, bluelinkPass: config.bluelinkPass ? "***" : "", bluelinkPin: config.bluelinkPin ? "****" : "" };
    res.json({ success: true, config: safeConfig, serverInfo: { ip: "Lokal", port: 8444, version: "2.6 GET Support", mqttStatus: mqttClient && mqttClient.connected ? "Verbunden" : "Offline" } });
});

app.post('/api/config', (req, res) => {
    const newC = req.body;
    if (!newC.bluelinkPass && config.bluelinkPass) newC.bluelinkPass = config.bluelinkPass;
    if (!newC.bluelinkPin && config.bluelinkPin) newC.bluelinkPin = config.bluelinkPin;
    if (newC.presets) config.presets = newC.presets;
    config = { ...config, ...newC };
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch(e) {}
    initMqtt();
    if (newC.bluelinkUser) initBluelink();
    res.json({ success: true, restartRequired: true });
});

app.get('/status', requireVehicle, async (req, res) => { 
    try { res.json({ success: true, data: await vehicle.status(false) }); } 
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/status/refresh', requireVehicle, async (req, res) => { 
    try { res.json({ success: true, data: await vehicle.status(true) }); } 
    catch(e) { handleCommandError(res, e, 'Refresh'); } 
});

// Klima stoppen geht jetzt auch per einfachem GET (für Loxone)
app.get('/climate/stop', requireVehicle, async (req, res) => { try { await vehicle.stop(); res.json({ success: true }); } catch(e) { handleCommandError(res, e, 'Stop GET'); } });
app.post('/climate/stop', requireVehicle, async (req, res) => { try { await vehicle.stop(); res.json({ success: true }); } catch(e) { handleCommandError(res, e, 'Stop POST'); } });

app.post('/lock', requireVehicle, async (req, res) => { try { await vehicle.lock(); res.json({ success: true }); } catch(e) { handleCommandError(res, e, 'Lock'); } });
app.post('/unlock', requireVehicle, async (req, res) => { try { await vehicle.unlock(); res.json({ success: true }); } catch(e) { handleCommandError(res, e, 'Unlock'); } });

app.listen(8444, '0.0.0.0', () => {
    console.log("🚀 Server läuft auf Port 8444");
    initBluelink();
    initMqtt();
});