# Lychee

Hol deine [Lychee](https://lycheeorg.dev)-Fotogalerie in Gladys, über dein
lokales Netzwerk: die Anzahl der Fotos, Alben und Benutzer, das zuletzt
hinzugefügte Foto, ein Gerät pro Album, das du verfolgen möchtest, Szenen, die
auf neue Fotos oder ein wachsendes Album reagieren, eine Szenenaktion, die die
letzten Fotos liest, und ein Dashboard-Widget mit den neuesten Fotos.

Die Integration wurde mit einer echten Lychee-Galerie getestet (dem
Docker-Image `lycheeorg/lychee`, Lychee 7.12, mit MariaDB), noch nicht in einer
echten Gladys-Installation: Rückmeldungen sind im
[Gladys-Forum](https://community.gladysassistant.com) oder in den
[Issues](https://github.com/guim31/gladys-lychee/issues) willkommen.

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Eine **Lychee**-Galerie (Version 6 oder neuer, mit der API `/api/v2`), die von
  Gladys aus erreichbar ist (gleiches Netzwerk).
- Ein Konto, das **Admin** ist oder **hochladen darf**: Lychee zeigt das Album
  „Zuletzt hinzugefügt“, in dem die Integration die neuen Fotos findet, nur
  diesen Konten. Ein Admin liefert außerdem die Anzahl der Benutzer und die
  genauen Summen der Galerie.
- Am besten: ein **API-Token** dieses Kontos: Öffne in Lychee dein **Profil**,
  dann **API-Token**, erstelle eines und kopiere es (Lychee zeigt es nur einmal
  an).
- Sonst Benutzername und Passwort des Kontos.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib unter **Konfiguration** die **Adresse der Galerie** mit Port und Ordner
   ein (zum Beispiel `http://192.168.1.20:8000`; das offizielle Docker-Image
   lauscht auf Port 8000, und eine aus dem Browser kopierte Seite der Galerie
   geht auch) und füge das **API-Token** in das Passwortfeld ein, ohne
   Benutzernamen. Mit einem Konto gibst du stattdessen Benutzername und
   Passwort ein.
3. Optional listest du die **Zu verfolgenden Alben** auf: Namen oder IDs, durch
   Kommas getrennt (`Urlaub`); ein Unteralbum über seinen Pfad
   (`Urlaub / Strand`). Die ID sind die 24 Zeichen am Ende der Albumadresse
   (`/gallery/<ID>`); nutze sie für einen Namen mit Komma.
4. Wähle die **Aktualisierung** (standardmäßig 5 Minuten) und die **Sprache der
   Namen** und speichere. **Verbindung testen** liest die Galerie sofort und
   meldet die nicht gefundenen Alben.
5. Füge unter **Entdecken** das Gerät **Lychee** und die gewünschten
   Albumgeräte hinzu.

## Geräte

Das Gerät **Lychee** zeigt die ganze Galerie (nur lesend):

| Funktion                   | Was sie zeigt                                                    |
| -------------------------- | ---------------------------------------------------------------- |
| Fotos                      | Fotos der Galerie (Admin) oder der Alben, die du siehst          |
| Alben                      | Alben der Galerie (Admin) oder die, die du siehst                |
| Benutzer                   | Benutzer der Galerie (nur Admin-Konto)                           |
| Zuletzt hinzugefügtes Foto | Name, Album (falls bekannt) und Tag: `Abend · Strand · 25. Okt.` |

Jedes verfolgte Album ergibt ein Gerät **Lychee – Albumpfad**:

| Funktion         | Was sie zeigt                                                           |
| ---------------- | ----------------------------------------------------------------------- |
| Fotos            | Fotos des Albums selbst, wie Lychee sie zählt                           |
| Letzte Ergänzung | Tag und Uhrzeit des zuletzt hochgeladenen Fotos: `25. Okt. 2026, 17:07` |

Die Integration liest die Galerie selbst (einige kleine Anfragen pro Abfrage,
eine mehr pro Album mit Unteralben und pro verfolgtem Album): Auf der Seite von
Gladys ist nichts einzustellen. Das Verbindungssymbol der Geräte wird rot, wenn
die Galerie nicht mehr antwortet.

## Dashboard

Das Widget **Neueste Fotos** zeigt die Zähler (Fotos, Alben, Benutzer) und die
zuletzt hochgeladenen Fotos: Name, Album (falls bekannt), Tag; ein Tippen zeigt
die Uhrzeit des Hochladens und den Aufnahmetag. Mit der Einstellung
**Verfolgtes Album** zeigt es eines deiner verfolgten Alben statt der ganzen
Galerie.

Vorschaubilder sind **standardmäßig aus**: Mit der Einstellung
**Vorschaubilder anzeigen** erscheint das kleine quadratische Vorschaubild
jedes Fotos, und deine Fotos sind dann auf jedem Bildschirm mit diesem
Dashboard zu sehen (ein geteiltes Tablet, ein öffentliches Dashboard, Gladys
Plus). Der Browser lädt Lychee nie direkt: Gladys fragt die Integration, die
nur die Fotos des Widgets ausliefert.

## Szenen

### Auslöser

- **Neue Fotos hinzugefügt**: Fotos wurden in die Galerie hochgeladen, egal auf
  welchem Weg (Web-Upload, Import, Synchronisierung), bei der nächsten Abfrage
  erkannt. Variablen: Anzahl hinzugefügter Fotos, Name, Album (leer bei einem
  unsortierten Foto), Datum und Seite des letzten.
- **Fotos zu einem Album hinzugefügt**: Ein Album enthält mehr Fotos als bei
  der letzten Abfrage (ohne Unteralben; ein neues Album zählt ab null). Filter:
  der Albumname, genau wie in Lychee, ohne übergeordnete Alben. Variablen:
  Name, Pfad und ID des Albums, hinzugefügte Fotos, Fotos im Album, Seite des
  Albums.

### Aktionen

- **Letzte Fotos lesen**: Liest sofort die zuletzt hochgeladenen Fotos der
  ganzen Galerie (das Album „Zuletzt hinzugefügt“ von Lychee) oder eines Albums
  (Name, Pfad oder ID). Ausgaben für die nächsten Aktionen der Szene: in 24
  Stunden hinzugefügte Fotos, Fotos insgesamt, Name, Album, Datum und Seite des
  letzten. In Lychee ändert sich nichts.

### Szenenideen

- Bei **Neue Fotos hinzugefügt** der Familie eine Nachricht schicken:
  „{{count}} neue Fotos, das letzte: {{name}} in {{album}}“.
- Jeden Abend um 21 Uhr die **Letzte Fotos lesen** des Albums „Familie“, und
  wenn **In 24 Stunden hinzugefügte Fotos** über 0 liegt, eine Nachricht auf
  dem Tablet im Wohnzimmer anzeigen.
- Bei **Fotos zu einem Album hinzugefügt** „Urlaub 2026“ den Flur blau
  beleuchten.

## Fehlerbehebung

- **„API-Token, Benutzername oder Passwort abgelehnt“**: Das Token wurde neu
  erzeugt oder nicht vollständig eingefügt; prüfe bei einem Konto Benutzername
  und Passwort.
- **„dieses Konto darf „Zuletzt hinzugefügt“ nicht lesen“**: Gib dem Konto in
  der Benutzerverwaltung von Lychee das Recht zum Hochladen, oder nimm einen
  Admin. Das Album „Zuletzt hinzugefügt“ darf in den Einstellungen von Lychee
  nicht deaktiviert sein.
- **„zu viele Anmeldeversuche“**: Lychee erlaubt 10 Anmeldungen pro Stunde.
  Prüfe das Passwort, oder nimm lieber ein API-Token, das keine Anmeldung
  braucht.
- **„die Galerie antwortet nicht“**: Prüfe Adresse und Port vom Gladys-Rechner
  aus.
- **„keine Lychee-Galerie unter dieser Adresse“**: Die Adresse führt zu einer
  anderen Seite (Anmeldeseite eines Reverse-Proxys, andere Anwendung): Gib die
  Adresse der Galerie selbst ein.
- **„Zertifikat abgelehnt“**: ein selbstsigniertes Zertifikat; verwende die
  `http://`-Adresse in deinem Netzwerk.
- **Neue Fotos erscheinen nicht**: Das Album „Zuletzt hinzugefügt“ enthält nur
  die Fotos der letzten Tage (Einstellung „recent_age“ von Lychee, standardmäßig
  1 Tag); Fotos, die mit einem alten Hochladedatum importiert werden, werden
  nicht gemeldet.
- **Die Anzahl der Benutzer bleibt leer**: Das Konto ist kein Admin.
- `LOG_LEVEL=debug` in den Protokollen der Integration zeigt jede Abfrage.

## Grenzen

- Neue Fotos werden bei der nächsten Abfrage erkannt (standardmäßig 5
  Minuten), und nur die, die das Konto sehen kann.
- Die Anzahl eines Albums enthält keine Unteralben: Lychee zählt jedes Album
  für sich. Der Albumbaum wird bis zu 300 Alben gelesen.
- Die Integration liest nur: In Lychee wird nie etwas geändert, hochgeladen oder gelöscht.
- Kein Foto verlässt dein Netzwerk über die Integration, außer du schaltest die
  Vorschaubilder des Widgets ein.
- Datumsangaben erscheinen in der Zeitzone von Gladys.
- Nicht mit dem Lychee-Projekt verbunden.
