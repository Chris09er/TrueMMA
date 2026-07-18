<!--
ENTWURF — vor Veröffentlichung von einem Anwalt/einer Anwältin prüfen lassen.
Kein Ersatz für Rechtsberatung. Basiert auf dem in docs/ARCHITECTURE.md
dokumentierten Datenmodell (Stand 2026-07-18) — bei jeder Änderung am
Datenmodell (neue Tabelle, neues Feld mit Personenbezug, neuer
Drittanbieter) hier nachziehen.
-->

# Datenschutzerklärung — True MMA

Stand: 18. Juli 2026

## 1. Verantwortlicher

Christoph Ickels
Hegholt 17
22179 Hamburg
Deutschland

E-Mail: support@true-mma.com

## 2. Übersicht

True MMA ist ohne Registrierung nutzbar. Ein Nutzerkonto ist optional und
schaltet keine Funktionen frei, die sonst gesperrt wären — es ermöglicht
lediglich, Favoriten/Follows geräteübergreifend zu synchronisieren und
einen Spitznamen zu hinterlegen. Es werden keine Werbe- oder
Analyse-SDKs eingesetzt, es findet kein Tracking zu Werbezwecken statt.

## 3. Welche Daten wir verarbeiten

### 3.1 Ohne Nutzerkonto (anonyme Nutzung)

| Daten | Zweck | Speicherort |
|---|---|---|
| Spracheinstellung | App-Anzeige in Deutsch/Englisch | Nur lokal auf dem Gerät (AsyncStorage) |
| Favorisierte Kämpfer/Events | Anzeige oben in der Liste | Nur lokal auf dem Gerät |
| Erinnerungen (Event-Reminder) | Lokale Benachrichtigung zum Event-Start | Nur lokal auf dem Gerät (`expo-notifications`), kein Server beteiligt |
| Push-Token + gefolgter Kämpfer | Zustellung einer Push-Benachrichtigung bei neuem Kampf eines gefolgten Kämpfers | Tabelle `push_subscriptions` in unserer Datenbank (Supabase, EU) |

Der Push-Token ist eine von Apple/Google/Firebase vergebene, geräte- und
app-spezifische Kennung ohne direkten Namens- oder Kontobezug. Ohne
Login ist die Zeile in `push_subscriptions` nicht mit einer Identität
verknüpft, nur mit diesem Gerät.

### 3.2 Mit Nutzerkonto (optional)

Registrierung erfordert eine E-Mail-Adresse und ein Passwort. Zusätzlich
freiwillig: ein Spitzname.

| Daten | Zweck | Speicherort |
|---|---|---|
| E-Mail-Adresse | Login, Passwort-Reset, Kontoverwaltung | Supabase Auth (EU, Frankfurt) |
| Passwort | Login (nur als Hash gespeichert, uns nicht im Klartext bekannt) | Supabase Auth |
| Spitzname (optional) | Anzeige im Profil | Tabelle `profiles` |
| Gefolgte Events | Anzeige im Profil, welche Events du verfolgst | Tabelle `event_follows` |
| Favorisierte Kämpfer/Events | Anzeige im Profil, Sortierung in Listen | Tabellen `fighter_favorites` / `event_favorites` |
| Push-Token (bei Kämpfer-Follow) | Zustellung von Push-Benachrichtigungen, jetzt mit Konto verknüpft | Tabelle `push_subscriptions` |

Wir erheben bewusst keine weiteren personenbezogenen Daten (kein Name,
keine Adresse, kein Geburtsdatum, keine Zahlungsdaten — die App ist
kostenlos und ohne In-App-Käufe).

## 4. Empfänger / Auftragsverarbeiter

Wir setzen folgende Dienstleister ein, die in unserem Auftrag Daten
verarbeiten (Auftragsverarbeitungsverträge nach Art. 28 DSGVO liegen vor
bzw. werden vor Live-Gang abgeschlossen):

- **Supabase** (Datenbank, Authentifizierung) — Serverstandort
  eu-central-1 (Frankfurt, Deutschland/EU).
- **IONOS** (Versand von Auth-E-Mails, z. B. Passwort-Reset) — Server in
  Deutschland.
- **Expo / 650 Industries, Inc.** (USA) — Zustellung von
  Push-Benachrichtigungen (`exp.host`) erhält den Push-Token und den
  Benachrichtigungsinhalt, um die Zustellung an Apple/Google
  weiterzuleiten.
- **Google LLC / Firebase Cloud Messaging** (USA) — technische
  Infrastruktur für die Zustellung von Push-Benachrichtigungen auf
  Android-Geräten.
- **Apple Inc.** (USA) — technische Infrastruktur für die Zustellung von
  Push-Benachrichtigungen auf iOS-Geräten (APNs).

Bei Diensten mit Sitz in den USA erfolgt die Übermittlung auf Grundlage
von Standardvertragsklauseln bzw., soweit zertifiziert, im Rahmen des
EU-U.S. Data Privacy Framework.

**Balldontlie.io** liefert uns öffentliche Sportdaten (Kämpfer, Events,
Kampfergebnisse) — hier werden keine Nutzerdaten übermittelt, die
Kommunikation läuft ausschließlich von unserem Server zu balldontlie,
nie mit Nutzerdaten angereichert.

## 5. Rechtsgrundlagen

- Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) — für Kontoerstellung,
  Login, Synchronisierung von Favoriten/Follows.
- Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse) — für die
  anonyme Push-Token-Speicherung ohne Konto (Interesse: Kernfunktion
  "Kämpfer folgen" ohne Registrierungszwang anzubieten) sowie für
  Sicherheits-/Missbrauchsprävention.
- Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) — für die Berechtigung zum
  Versand von Push-Benachrichtigungen, die das Betriebssystem
  (iOS/Android) separat abfragt, bevor eine Benachrichtigung zugestellt
  werden kann.

## 6. Speicherdauer

- Konto-Daten: bis zur Löschung des Kontos durch die Nutzerin/den Nutzer.
- Anonyme `push_subscriptions`-Zeilen (ohne Konto): bis zum expliziten
  Entfollowen über die App oder bis der Push-Token durch das Betriebssystem
  ungültig wird.
- Lokale Daten (Sprache, Favoriten vor Login, Erinnerungen): verbleiben auf
  dem Gerät, bis die App-Daten gelöscht oder die App deinstalliert wird.

## 7. Deine Rechte

Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16),
Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
Datenübertragbarkeit (Art. 20) sowie Widerspruch (Art. 21) gegen die
Verarbeitung. Wende dich dazu an support@true-mma.com. Kontolöschung
(inkl. aller zugehörigen Daten in `profiles`, `event_follows`,
`fighter_favorites`, `event_favorites`, `push_subscriptions`) kannst du
formlos per E-Mail anfragen.

Du hast außerdem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde
zu beschweren, z. B. beim Hamburgischen Beauftragten für Datenschutz und
Informationsfreiheit (zuständig für unseren Sitz in Hamburg).

## 8. Kinder

True MMA richtet sich nicht gezielt an Kinder unter 16 Jahren. Uns ist
bewusst kein Personenbezug von Kindern in unseren Daten, da lediglich
E-Mail-Adresse und optionaler Spitzname erhoben werden und keine
Altersabfrage stattfindet.

## 9. Änderungen dieser Erklärung

Wir passen diese Erklärung an, sobald sich unser Datenmodell oder die
eingesetzten Dienstleister ändern. Das Datum oben zeigt den Stand der
letzten Aktualisierung.
