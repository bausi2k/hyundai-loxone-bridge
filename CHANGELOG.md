# Changelog


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