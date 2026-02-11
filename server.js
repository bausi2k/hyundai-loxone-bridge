require('dotenv').config();
const express = require('express');
const { BlueLinky } = require('bluelinky'); 
const cors = require('cors');
const fs = require('fs');
const dgram = require('dgram'); 
const os = require('os');
const mqtt = require('mqtt'); 

// Version aus package.json
let packageJson = { version: "0.0.0" };
try { packageJson = require('./package.json'); } catch (e) {}

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// --- Request Logging ---
app.use((req, res, next) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/climate') || req.url.startsWith('/lock')) {
        console.log(`📡 API Request: [${req.method}] ${req.url}`);
    }
    next();
});

// --- KONFIGURATION LADEN ---
const CONFIG_FILE = 'config.json';
let appConfig = {
    bluelinkUser: '', bluelinkPass: '', bluelinkPin: '', bluelinkVin: '', region: 'EU', brand: 'hyundai',
    udpHost: '', udpPort: 0, enableUdp: false,
    mqttHost: '', mqttPort: 1883, mqttUser: '', mqttPass: '', mqttTopic: 'hyundai', enableMqtt: false
};

if (fs.existsSync(CONFIG_FILE)) {
    try {
        const diskConfig = JSON.parse(fs.readFileSync(CONFIG_FILE));
        appConfig = { ...appConfig, ...diskConfig };
        console.log("📂 Konfiguration geladen.");
    } catch (e) { console.error("Fehler beim Laden der Config:", e); }
}
// ENV Fallback
if (!appConfig.bluelinkUser && process.env.BLUELINK_USERNAME) appConfig.bluelinkUser = process.env.BLUELINK_USERNAME;
if (!appConfig.bluelinkPass && process.env.BLUELINK_PASSWORD) appConfig.bluelinkPass = process.env.BLUELINK_PASSWORD;
if (!appConfig.bluelinkPin && process.env.BLUELINK_PIN) appConfig.bluelinkPin = process.env.BLUELINK_PIN;
if (!appConfig.bluelinkVin && process.env.BLUELINK_VIN) appConfig.bluelinkVin = process.env.BLUELINK_VIN;

const PORT = process.env.PORT || 8444;

// --- MQTT SETUP ---
let mqttClient = null;
let mqttStatus = "Nicht konfiguriert"; 

function initMqtt() {
    if (mqttClient) { mqttClient.end(); mqttClient = null; }
    if (!appConfig.mqttHost) { mqttStatus = "Deaktiviert (Kein Host)"; return; }

    const url = `mqtt://${appConfig.mqttHost}:${appConfig.mqttPort}`;
    console.log(`🔌 MQTT: Verbinde zu ${url}...`);
    mqttStatus = "Verbinde...";

    const options = {
        clientId: 'hyundai_bridge_' + Math.random().toString(16).substr(2, 8),
        username: appConfig.mqttUser, password: appConfig.mqttPass,
        reconnectPeriod: 5000
    };

    mqttClient = mqtt.connect(url, options);
    mqttClient.on('connect', () => {
        console.log("✅ MQTT: Verbunden!");
        mqttStatus = "Verbunden";
        // Base Topic auch hier toLowerCase()
        const base = (appConfig.mqttTopic || 'hyundai').toLowerCase();
        mqttClient.publish(`${base}/bridge/status`, "online", { retain: true });
    });
    mqttClient.on('error', (err) => { console.error("❌ MQTT Fehler:", err.message); mqttStatus = "Fehler: " + err.message; });
    mqttClient.on('offline', () => { if(mqttStatus!=="Deaktiviert") mqttStatus = "Offline"; });
}
initMqtt();

// --- LOWERCASE REKURSION ---
const publishRecursive = (baseTopic, obj) => {
    if (!mqttClient || !mqttClient.connected) return;
    for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        const val = obj[key];
        
        // WICHTIG: Key in Kleinbuchstaben umwandeln
        const lowerKey = key.toLowerCase();
        const newTopic = `${baseTopic}/${lowerKey}`;

        if (val !== null && typeof val === 'object') {
            publishRecursive(newTopic, val);
        } else {
            const payload = (val === null || val === undefined) ? "null" : String(val);
            mqttClient.publish(newTopic, payload, { retain: true });
        }
    }
};

const sendMqttToBroker = (data) => {
    if (!mqttClient || !mqttClient.connected) return;
    
    // WICHTIG: Base Topic in Kleinbuchstaben erzwingen
    const base = (appConfig.mqttTopic || 'hyundai').toLowerCase();
    
    //console.log(`📡 Sende vollen MQTT Baum an: ${base}/... (lowercase)`);
    
    mqttClient.publish(`${base}/json`, JSON.stringify(data), { retain: true });
    
    // WICHTIG: 'lastUpdate' -> 'lastupdate'
    mqttClient.publish(`${base}/lastupdate`, new Date().toISOString(), { retain: true });
    
    publishRecursive(base, data);
};

// --- HYUNDAI CLIENT SETUP ---
let client = null;
let vehicle = null;

function getProp(obj, prop) {
    if (!obj || !obj[prop]) return null;
    return (typeof obj[prop] === 'function') ? obj[prop]() : obj[prop];
}

async function initHyundai() {
    if (!appConfig.bluelinkUser || !appConfig.bluelinkPass || !appConfig.bluelinkPin) {
        console.warn("⚠️  KEINE ZUGANGSDATEN! Bitte Config prüfen.");
        return;
    }
    console.log(`🔧 Init Bluelinky: ${appConfig.bluelinkUser} | Region: ${appConfig.region}`);

    client = new BlueLinky({
        username: appConfig.bluelinkUser, password: appConfig.bluelinkPass,
        region: appConfig.region, pin: appConfig.bluelinkPin, brand: appConfig.brand
    });

    client.on('ready', async () => {
        console.log("✅ Hyundai Login erfolgreich!");
        try {
            const cars = await client.getVehicles();
            if (appConfig.bluelinkVin) vehicle = cars.find(c => getProp(c, 'vin') === appConfig.bluelinkVin);
            if (!vehicle) vehicle = cars[0];
            if(vehicle) console.log(`🚘 Verbunden mit: ${getProp(vehicle, 'nickname')}`);
        } catch(err) { console.error("❌ Fehler beim Laden der Fahrzeuge:", err); }
    });
    try { await client.login(); } catch (e) { console.log("⚠️ Login initiiert..."); }
}
initHyundai();

// --- UDP SENDER ---
const sendUdpToLoxone = (data) => {
    if (!appConfig.enableUdp || !appConfig.udpHost || !appConfig.udpPort) return;
    const state = data; 
    const get = (path) => path.split('.').reduce((acc, part) => acc && acc[part], state);

    const bat = Math.round(get('Green.BatteryManagement.BatteryRemain.Ratio') || 0);
    const range = Math.round(get('Drivetrain.FuelSystem.DTE.Total') || 0);
    const locked = get('Body.Door.Row1.Driver.Lock') === 1 ? 1 : 0;
    const temp = get('Cabin.HVAC.Row1.Driver.Temperature.Value');
    const isClimate = (temp && temp !== 'OFF' && temp !== 0 && temp !== '0') ? 1 : 0;
    const charging = get('Green.ChargingInformation.Charging.RemainTime') > 0 ? 1 : 0;
    
    const msg = [
        `Hyundai_BatSoc: ${bat}`, `Hyundai_Range: ${range}`, `Hyundai_Locked: ${locked}`,
        `Hyundai_Climate: ${isClimate}`, `Hyundai_Charging: ${charging}`
    ].join('\n');

    const socket = dgram.createSocket('udp4');
    const buffer = Buffer.from(msg);
    socket.send(buffer, 0, buffer.length, parseInt(appConfig.udpPort), appConfig.udpHost, (err) => {
        if (err) console.error("UDP Send Error:", err);
        socket.close();
    });
};

// --- API Helper ---
const sendJson = (res, success, data = null, err = null) => {
    res.status(success ? 200 : 500).json({ success, data, error: err ? String(err) : undefined });
};
const handleCommandError = (res, e, cmdName) => {
    const errString = String(e);
    if (errString.includes("4004") || errString.includes("Duplicate request")) {
        return res.json({ success: true, warning: "Vehicle busy", command_invoked: cmdName });
    }
    console.error(`❌ Fehler bei ${cmdName}:`, e);
    sendJson(res, false, null, e);
};
const requireVehicle = (req, res, next) => {
    if (!vehicle) return sendJson(res, false, null, "Vehicle not ready");
    next();
};

// --- ROUTES ---
app.get('/api/config', (req, res) => {
    const nets = os.networkInterfaces();
    let localIp = '127.0.0.1';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) { localIp = net.address; break; }
        }
    }
    res.json({ success: true, config: appConfig, serverInfo: { ip: localIp, port: PORT, version: packageJson.version, mqttStatus: mqttStatus } });
});

app.post('/api/config', (req, res) => {
    const oldUser = appConfig.bluelinkUser;
    appConfig = { ...appConfig, ...req.body };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
    initMqtt();
    res.json({ success: true, restartRequired: (oldUser !== appConfig.bluelinkUser) });
});

app.get('/status', requireVehicle, async (req, res) => {
    try {
        const stat = await vehicle.status({ refresh: false });
        sendUdpToLoxone(stat); sendMqttToBroker(stat);
        res.json({ success: true, data: stat });
    } catch(e) { sendJson(res, false, null, e); }
});

app.get('/status/refresh', requireVehicle, async (req, res) => {
    try {
        const stat = await vehicle.status({ refresh: true });
        sendUdpToLoxone(stat); sendMqttToBroker(stat);
        res.json({ success: true, data: stat });
    } catch(e) { sendJson(res, false, null, e); }
});

app.post('/lock', requireVehicle, async (req, res) => { try { await vehicle.lock(); res.json({success:true}); } catch(e){ handleCommandError(res,e,'lock'); } });
app.post('/unlock', requireVehicle, async (req, res) => { try { await vehicle.unlock(); res.json({success:true}); } catch(e){ handleCommandError(res,e,'unlock'); } });

app.post('/climate/start', requireVehicle, async (req, res) => { 
    try { 
        // 1. Standardwerte setzen (damit es nie crasht)
        const defaults = { 
            temperature: 21, 
            duration: 15, 
            defrost: false, 
            heating: true,
            climate: true,
            windscreenHeating: false
        };

        // 2. Deine gesendeten Daten (req.body) werden DARÜBER gelegt.
        // Das '...req.body' sorgt dafür, dass AUCH unbekannte Parameter (wie seatHeatingDriver)
        // mitgenommen werden!
        const conf = { ...defaults, ...req.body };
        
        // Spezial-Logik: Wenn du 'defrost' schickst, aktivieren wir meist auch die Scheibenheizung
        if (req.body.defrost) conf.windscreenHeating = true;

        console.log("🧪 TEST-MODUS: Starte Klima mit:", JSON.stringify(conf, null, 2));
        
        await vehicle.start(conf); 
        res.json({success:true, config_sent: conf}); 
    } catch(e){ handleCommandError(res,e,'climate_start'); } 
});

app.post('/climate/stop', requireVehicle, async (req, res) => { 
    try { 
        console.log("🛑 Sende 'Stop Climate' an Bluelink...");
        await vehicle.stop(); 
        console.log("✅ 'Stop Climate' erfolgreich abgesetzt.");
        res.json({success:true}); 
    } catch(e){ 
        console.error("❌ 'Stop Climate' FEHLGESCHLAGEN:", e);
        handleCommandError(res,e,'climate_stop'); 
    } 
});

app.post('/charge/start', requireVehicle, async (req, res) => { try { await vehicle.startCharge(); res.json({success:true}); } catch(e){ handleCommandError(res,e,'charge_start'); } });
app.post('/charge/stop', requireVehicle, async (req, res) => { try { await vehicle.stopCharge(); res.json({success:true}); } catch(e){ handleCommandError(res,e,'charge_stop'); } });

app.listen(PORT, () => { console.log(`🚀 Server läuft auf Port ${PORT}`); });