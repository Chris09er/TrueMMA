<!--
ENTWURF — vor Veröffentlichung von einem Anwalt/einer Anwältin prüfen lassen.
Kein Ersatz für Rechtsberatung. Basiert auf dem in docs/ARCHITECTURE.md
dokumentierten Datenmodell (Stand 2026-07-23, nach der Gruppe-C-Überarbeitung:
die früheren Favoriten/Follow-Tabellen sind durch die geräteverankerten
`saved_*`-Tabellen + `notification_prefs` ersetzt) — bei jeder Änderung am
Datenmodell (neue Tabelle, neues Feld mit Personenbezug, neuer
Drittanbieter) hier nachziehen.
-->

# Datenschutzerklärung — True MMA

Stand: 23. Juli 2026

## 1. Verantwortlicher

Christoph Ickels
Hegholt 17
22179 Hamburg
Deutschland

E-Mail: support@true-mma.com

## 2. Übersicht

True MMA ist ohne Registrierung nutzbar. Ein Nutzerkonto ist optional und
schaltet keine Funktionen frei, die sonst gesperrt wären — es ermöglicht
lediglich, deine Merkliste (gespeicherte Kämpfer, Events und Ligen)
geräteübergreifend zu synchronisieren und einen Spitznamen zu hinterlegen.
Das Speichern selbst funktioniert auch ohne Konto und ist dann an eine
zufällige Geräte-Kennung gebunden (siehe 3.1). Es werden keine Werbe- oder
Analyse-SDKs eingesetzt, es findet kein Tracking zu Werbezwecken statt.

## 3. Welche Daten wir verarbeiten

### 3.1 Ohne Nutzerkonto (anonyme Nutzung)

| Daten | Zweck | Speicherort |
|---|---|---|
| Spracheinstellung | App-Anzeige in Deutsch/Englisch | Nur lokal auf dem Gerät (AsyncStorage) |
| Geräte-Kennung + gespeicherte Kämpfer/Events/Ligen ("Merkliste") | Anzeige und Sortierung der Merkliste; sofern Benachrichtigungen erlaubt, Push zu neuen Kämpfen, Event-/Liga-Start und Ergebnissen | Tabellen `saved_fighters` / `saved_events` / `saved_organizations` in unserer Datenbank (Supabase, EU) |
| Push-Token (sobald Benachrichtigungen erlaubt) | Zustellung der Push-Benachrichtigungen zu den gespeicherten Objekten | Als Attribut auf den `saved_*`-Zeilen dieses Geräts (Supabase, EU) |
| Benachrichtigungs-Einstellungen (pro Kategorie) | Steuern, welche Push-Kategorien dieses Gerät erhält | Tabelle `notification_prefs` (Supabase, EU) |
| Geräte-Kennung + abgegebene Stimme ("Wer gewinnt?") | Anzeige der Community-Abstimmung zu einem Kampf | Tabelle `fight_votes` (Supabase, EU) |

Der Push-Token ist eine von Apple/Google/Firebase vergebene, geräte- und
app-spezifische Kennung ohne direkten Namens- oder Kontobezug. Er wird erst
gespeichert, wenn du Benachrichtigungen erlaubst, und ist ohne Login nur mit
diesem Gerät verknüpft, nicht mit einer Identität.

Die Geräte-Kennung ist eine von der App selbst zufällig erzeugte Kennung
(kein Push-Token, keine Geräte-ID des Betriebssystems). Sie wird lokal
erzeugt und als Anker deiner Merkliste, deiner Benachrichtigungs-Einstellungen
und deiner Abstimmungen an unseren Server übertragen — bewusst getrennt vom
Push-Token, damit das Speichern oder Abstimmen nie die Berechtigungsabfrage
für Benachrichtigungen auslöst. Ohne Login ist sie mit keiner Identität
verknüpft. Der Zugriff auf diese Tabellen erfolgt ausschließlich über
abgesicherte Server-Funktionen; die Geräte-Kennungen anderer Nutzer sind für
Clients nicht auslesbar.

Hinweis: Der frühere rein lokale Event-Reminder wurde durch den serverseitigen
„Es geht los!"-Push für gespeicherte Events/Ligen ersetzt.

### 3.2 Mit Nutzerkonto (optional)

Registrierung erfordert eine E-Mail-Adresse und ein Passwort. Zusätzlich
freiwillig: ein Spitzname.

| Daten | Zweck | Speicherort |
|---|---|---|
| E-Mail-Adresse | Login, Passwort-Reset, Kontoverwaltung | Supabase Auth (EU, Frankfurt) |
| Passwort | Login (nur als Hash gespeichert, uns nicht im Klartext bekannt) | Supabase Auth |
| Spitzname (optional) | Anzeige im Profil | Tabelle `profiles` |
| Verknüpfung deiner Merkliste mit dem Konto | Geräteübergreifende Synchronisierung deiner gespeicherten Kämpfer/Events/Ligen und Benachrichtigungs-Einstellungen | `user_id`-Attribut auf den bestehenden `saved_*`-Zeilen und auf `notification_prefs` |

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
  Login, Synchronisierung der Merkliste.
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
- `saved_*`-Zeilen (Merkliste; Geräte-Kennung, ohne oder mit Konto): bis du den
  Eintrag über die App entfernst. Wird der Push-Token durch das Betriebssystem
  ungültig (erkannt an der Zustellquittung von Expo), entfernen wir bei anonymen
  Zeilen die Zeile und bei kontogebundenen Zeilen nur den Token — die Merkliste
  bleibt geräteübergreifend erhalten.
- `notification_prefs`-Zeile (Benachrichtigungs-Einstellungen des Geräts): bis
  zur Kontolöschung bzw. solange das Gerät die App nutzt.
- `fight_votes`-Zeilen (Geräte-Kennung + Stimme): unbegrenzt, da an keine
  Löschauslöser gekoppelt — es gibt aktuell keine Funktion zum Zurückziehen
  einer Stimme außer dem Ändern der eigenen Wahl.
- Lokale Daten (Sprache): verbleiben auf dem Gerät, bis die App-Daten gelöscht
  oder die App deinstalliert wird.

## 7. Deine Rechte

Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16),
Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
Datenübertragbarkeit (Art. 20) sowie Widerspruch (Art. 21) gegen die
Verarbeitung. Wende dich dazu an support@true-mma.com. Kontolöschung
(inkl. aller zugehörigen Daten in `profiles`, `saved_fighters`,
`saved_events`, `saved_organizations`, `notification_prefs`) kannst du
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
