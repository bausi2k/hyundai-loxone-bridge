# 🚗 Hyundai & Kia Bluelink Bridge

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/bausi2k)


Eine moderne **Node.js** Bridge, um Hyundai/Kia Fahrzeuge in das Smart Home (z.B. Loxone, Home Assistant, ioBroker) zu integrieren.
Das Projekt bietet ein **responsives Web-Dashboard**, eine **Loxone UDP-Schnittstelle**, eine **MQTT-Integration** und eine **simple REST API** zur einfachen Automatisierung.

## ✨ Features

* **Modernes Web-Dashboard:**
    * Sauberes UI/UX Design (Desktop & Mobile optimiert).
    * Visuelle Darstellung von Türen, Schlössern und Klima.
    * **Interieur-Visualisierung:** Aktive Anzeige von Sitzheizung (Fahrer), Lenkradheizung und Heckscheibenheizung.
    * Große Anzeige für Akku (%) und Reichweite (km) mit Farbskalierung.
    * Status für 12V-Batterie und Ladekabel.
* **Klima-Presets (Winter/Sommer):**
    * Profile bequem im Web-UI konfigurieren (Temperatur, Laufzeit, Heizung, Defrost, Extras).
    * Mit einem simplen Klick oder GET-Request abrufbar.
* **Loxone Integration:** Sendet Statusänderungen per UDP direkt an den Miniserver (inkl. XML-Template Generator für den Import).
* **MQTT Integration:** Gibt den kompletten Fahrzeugstatus als rekursiven JSON-Baum aus (Lowercase Topics).
* **Batterieschonend:** Unterscheidung zwischen "Cache Status" (server-seitig) und "Live Refresh" (weckt das Fahrzeug auf).
* **In-App Konfiguration:** Zugangsdaten und Schnittstellen direkt im Browser konfigurierbar.

---

## 🚀 Installation & Start (Docker)

Die einfachste Methode ist die Nutzung von Docker Compose. Das fertige Image (für AMD64 und ARM64/Raspberry Pi) wird direkt von der GitHub Registry geladen.

1.  **`docker-compose.yml` erstellen:**
    Erstelle einen Ordner auf deinem Server und lege dort eine `docker-compose.yml` mit folgendem Inhalt an:

    ```yaml
    version: '3.8'

    services:
      hyundai-bridge:
        image: ghcr.io/bausi2k/hyundai-loxone-bridge:latest
        container_name: hyundai-loxone-bridge
        restart: unless-stopped
        ports:
          - "8444:8444"
        volumes:
          - ./config.json:/app/config.json
        environment:
          - TZ=Europe/Vienna
    ```

2.  **Container starten:**
    ```bash
    docker-compose up -d
    ```

3.  **Aufrufen & Einrichten:**
    Öffne `http://<DEINE-IP>:8444` im Browser. Gehe auf den Tab **Config**, gib deine Hyundai/Kia Zugangsdaten ein und speichere. 
    *(Hinweis: Nach der ersten Eingabe der Login-Daten startet der Container die Verbindung automatisch neu).*

---

## ⚙️ Konfiguration

Die Konfiguration wird in der Datei `config.json` gespeichert, die via Docker-Volume persistiert wird, damit sie bei Updates erhalten bleibt.

**Wichtige Felder im UI:**
* **Marke:** Hyundai oder Kia.
* **VIN:** Optional. Wenn leer, wird das erste im Account gefundene Fahrzeug genutzt.
* **UDP Host/Port:** IP deines Loxone Miniservers (z.B. 192.168.1.10) und Port des virtuellen UDP Eingangs (z.B. 7888).
* **MQTT Broker:** IP, Port, User und Passwort deines Brokers.

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

*Tipp: Im Config-Tab kannst du dir ein fertiges `.xml` Template für den einfachen Loxone-Import herunterladen!*

### 2. MQTT
Wenn MQTT aktiviert ist, wird der gesamte Fahrzeugstatus als rekursiver Baum ausgegeben. Alle Topics sind **lowercase**.
Basis-Topic (Standard): `hyundai`

**Beispiele:**
* `hyundai/green/batterymanagement/batteryremain/ratio` -> `80`
* `hyundai/drivetrain/fuelsystem/dte/total` -> `345`
* `hyundai/body/door/row1/driver/open` -> `0`
* `hyundai/bridge/status` -> `online`

### 3. REST API (Ideal für Loxone / Webhooks)
Das System bietet extrem einfache GET-Endpunkte, ideal für Smart Home Systeme, die sich mit komplexen JSON-Bodys schwer tun.

* **GET `/status`**
    Holt den Status aus dem Server-Cache (schnell, weckt Auto nicht auf).
* **GET `/status/refresh`**
    Erzwingt eine Aktualisierung vom Fahrzeug (langsam, weckt Auto auf).
* **GET `/climate/trigger/winter`** (oder `/summer`)
    Startet das Klima-Profil, das bequem über das Web-UI konfiguriert wurde.
* **GET `/climate/start?temp=21&duration=15&defrost=1`**
    Startet die Klimaanlage mit dynamischen URL-Parametern (ideal für Loxone `<v>` Variablen).
* **GET `/climate/stop`**
    Stoppt die Klimatisierung.
* **POST `/lock`** oder **`/unlock`**
    Türen verriegeln oder entriegeln.

---

## ⚠️ Wichtige Hinweise

* **12V Batterie schonen:** Nutze den Button **"Live Update"** (oder den Endpunkt `/status/refresh`) sparsam! Jedes Live-Update weckt das Auto auf und zieht Strom aus der kleinen 12V Starterbatterie. Nutze im Normalfall den Cache (`/status`).
* **API Limits:** Die Hyundai/Kia Server sperren Accounts temporär (Duplicate Request Error), wenn zu viele Befehle in extrem kurzer Zeit gesendet werden. Lasse dem Fahrzeug nach einem Befehl ca. 1-2 Minuten Zeit, bevor du den nächsten sendest.

---
**Lizenz:** MIT