# 🚗 Hyundai & Kia Bluelink Bridge

Eine moderne **Node.js (v24)** Bridge, um Hyundai/Kia Fahrzeuge in das Smart Home zu integrieren.
Das Projekt bietet ein **Web-Dashboard**, eine **Loxone UDP-Schnittstelle** und eine **MQTT-Integration** (für Home Assistant, ioBroker, etc.).

## ✨ Features

* **Modernes Web-Dashboard:**
    * Visuelle Darstellung von Türen, Schlössern und Klima.
    * Große Anzeige für Akku (%) und Reichweite (km) mit Farbskalierung.
    * Status für 12V-Batterie und Ladekabel.
    * Steuerung: Klima (Temp/Dauer/Defrost), Verriegeln, Laden.
* **Loxone Integration:** Sendet Statusänderungen per UDP direkt an den Miniserver (inkl. XML-Template Generator).
* **MQTT Integration:** Gibt den kompletten Fahrzeugstatus als rekursiven JSON-Baum aus (Lowercase Topics).
* **Batterieschonend:** Unterscheidung zwischen "Cache Status" (server-seitig) und "Live Refresh" (weckt Fahrzeug auf).
* **Docker Ready:** Einfaches Deployment via Docker Compose.
* **In-App Konfiguration:** Zugangsdaten und Schnittstellen direkt im Browser konfigurierbar.

---

## 🚀 Installation & Start (Docker)

Die einfachste Methode ist die Nutzung von Docker Compose.

1.  **Dateien vorbereiten:**
    Erstelle ein Verzeichnis und kopiere `Dockerfile`, `docker-compose.yml`, `package.json` und den `public` Ordner hinein.

2.  **Container starten:**
    ```bash
    docker-compose up -d --build
    ```

3.  **Aufrufen:**
    Öffne `http://<DEINE-IP>:8444` im Browser.

4.  **Einrichten:**
    Gehe auf den Tab **Config**, gib deine Hyundai/Kia Zugangsdaten ein und speichere.
    *Hinweis: Nach der ersten Eingabe der Zugangsdaten empfiehlt sich ein Container-Neustart (`docker restart hyundai-bridge`).*

---

## ⚙️ Konfiguration

Die Konfiguration wird in der Datei `config.json` gespeichert, die via Docker-Volume persistiert wird.

**Wichtige Felder im UI:**
* **Marke:** Hyundai oder Kia.
* **VIN:** Optional. Wenn leer, wird das erste gefundene Fahrzeug genommen.
* **UDP Host/Port:** IP deines Loxone Miniservers (z.B. 192.168.1.10) und Port des virtuellen UDP Eingangs (z.B. 7888).
* **MQTT Broker:** IP, Port, User, Passwort deines Brokers.

---

## 📡 Schnittstellen

### 1. Loxone (UDP)
Wenn UDP aktiviert ist, sendet die Bridge bei jedem Update folgende Befehle:

| Befehl | Beschreibung | Beispiel |
| :--- | :--- | :--- |
| `Hyundai_BatSoc` | Ladestand Hochvoltbatterie (%) | `80` |
| `Hyundai_Range` | Reichweite (km) | `350` |
| `Hyundai_Locked` | Verriegelungsstatus (1=Zu, 0=Offen) | `1` |
| `Hyundai_Climate` | Klima Status (1=An, 0=Aus) | `0` |
| `Hyundai_Charging`| Lädt aktuell (1=Ja, 0=Nein) | `0` |

*Tipp: Im Config-Tab kannst du dir ein fertiges `.xml` Template für Loxone herunterladen!*

### 2. MQTT
Wenn MQTT aktiviert ist, wird der gesamte Fahrzeugstatus als rekursiver Baum ausgegeben. Alle Topics sind **lowercase**.
Basis-Topic (Standard): `hyundai`

**Beispiele:**
* `hyundai/green/batterymanagement/batteryremain/ratio` -> `80`
* `hyundai/drivetrain/fuelsystem/dte/total` -> `345`
* `hyundai/body/door/row1/driver/open` -> `0`
* `hyundai/bridge/status` -> `online`

### 3. REST API (Perfekt für Loxone)
Das System bietet einfache GET-Endpunkte, ideal für die Einbindung in Smart Home Systeme ohne komplexes JSON-Handling.

* **GET `/status`**
    Holt den Status aus dem Server-Cache (schnell, weckt Auto nicht).
* **GET `/status/refresh`**
    Erzwingt eine Aktualisierung vom Fahrzeug (langsam, weckt Auto).
* **GET `/climate/trigger/winter`** (oder `/summer`)
    Startet das Klima-Profil, das bequem über das Web-UI konfiguriert wurde (inkl. Sitz-/Lenkradheizung).
* **GET `/climate/start?temp=21&duration=15&defrost=1`**
    Startet die Klimaanlage mit dynamischen URL-Parametern (ideal für Loxone `<v>` Variablen).
* **GET `/climate/stop`**
    Stoppt die Klimatisierung.
* **POST `/lock`** oder **`/unlock`**
    Türen verriegeln oder entriegeln.

---

## ⚠️ Wichtige Hinweise

* **12V Batterie:** Nutze den Button **"Live"** (oder `/status/refresh`) sparsam! Jedes Live-Update weckt das Auto auf und verbraucht Strom der 12V Starterbatterie. Nutze im Normalfall den Cache.
* **API Limits:** Hyundai sperrt Accounts temporär, wenn zu viele Anfragen in kurzer Zeit gesendet werden.

## 🛠 Tech Stack

* **Backend:** Node.js 24, Express, Bluelinky (Library)
* **Frontend:** HTML5, CSS3, Vanilla JS (keine Frameworks)
* **Protokolle:** UDP (`dgram`), MQTT (`mqtt.js`)

---

**Lizenz:** MIT