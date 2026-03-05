# Changelog


## [1.4.0] - 2026-03-05

### 🚀 Added
- **Dual-Route Support**: Alle Steuerbefehle (`/lock`, `/unlock`, `/climate/stop`, `/status/refresh`) sind jetzt sowohl per **GET** als auch per **POST** erreichbar. Dies ermöglicht die einfachere Integration in Loxone über virtuelle Ausgänge ohne komplexe Header-Konfiguration.
- **Enhanced Loxone UDP Push**: Native Unterstützung für das Kona-Datenmodell. Die Bridge sendet nun aktiv folgende Werte an Loxone:
  - `Hyundai_BatSoc` (Hochvolt-Batterie %)
  - `Hyundai_Range` (Restreichweite in km)
  - `Hyundai_12vBat` (12V-Batterie in %)
  - `Hyundai_Locked` (Verriegelungsstatus)
  - `Hyundai_Charging` (Ladeaktivität)
  - `Hyundai_Plugged` (Kabel gesteckt)

### 🔧 Fixed
- **Kona Data Mapping**: Umstellung auf Case-Sensitive Pfade (`Green.BatteryManagement`, `Drivetrain.FuelSystem`), da neuere Kona-Modelle die Standard-Bluelinky-Pfade oft leer zurückgeben.
- **UI Data Consistency**: Die `client.js` nutzt nun die gleichen robusten Pfade wie das Backend, um Nullen ("0%") im Dashboard bei Kona-Modellen zu vermeiden.
- **Timestamp Parsing**: Korrektur der Zeitanzeige im UI; extrahiert nun korrekt Tag/Monat/Uhrzeit aus dem herstellerspezifischen Datumsformat.

### 🧹 Changed
- **UI Cleanup**: `autocomplete` Attribute zu Passwortfeldern hinzugefügt, um Browser-Warnungen zu reduzieren.
- **Error Handling**: Verbessertes Logging bei UDP-Übertragungsfehlern.

## [1.3.2] - 2026-03-05
### Geändert

- Docker fixes

## [1.3.0] - 2026-03-05
### Geändert
- **Komplettes UI/UX Redesign:** Das Layout ist nun für Desktop-Bildschirme sauber zentriert (max-width) und nicht mehr verzerrt.
- **Modernes Button-Design:** Die Presets und Status-Aktionen haben ein neues "Pill-Design" mit passenden Icons und Farbverläufen erhalten.
- CSS-Konflikte bei den runden Schnellzugriffs-Buttons rund um das Auto behoben.
- DOM-Warnungen für fehlende Form-Tags im Login-Bereich entfernt.


## [1.2.0] - 2026-03-05
### Hinzugefügt
- **Szenen-basierte Steuerung:** Sommer- und Winter-Presets direkt via Web-UI konfigurierbar.
- **GET API für Loxone:** Volle Unterstützung für einfache GET-Requests (z.B. `/climate/start?temp=22&defrost=1`) ohne komplexes JSON.
- **Interieur Visualisierung:** Das Dashboard zeigt nun aktiv die Lenkradheizung, Heckscheibenheizung und Sitzheizung des Fahrers (rot markiert) an.
- Direkter Aufruf der Presets über `/climate/trigger/winter` und `/climate/trigger/summer`.

### Geändert
- Das Web-Interface ist nun auf maximal 600px Breite begrenzt (mobile-first / sauberes Desktop-Layout).
- Fehlerbehandlung für "Duplicate requests" bei der Hyundai API verbessert.
- Robusterer bluelinky-Import für verschiedene Node-Umgebungen.
- VIN-Auslese-Logik repariert (behebt den Fehler "vin is a function").

## [1.1.0] - 2025-10-10
- Initiales Release der Bridge mit Dashboard und UDP Push.