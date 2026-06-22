# TRMNL X – zuerst lesen

Dieser Ordner ist das **aktive Müllabfuhr-Plugin (AWRM Remshalden) für den
TRMNL X** – aufgebaut auf der verifizierten X-Startvorlage. Er löst die alten
OG-Templates unter `../templates/` ab (nur noch Referenz, nicht mehr gepflegt).

Datenquelle bleibt unverändert der Serverless-Transform aus `../transform/`
(siehe Haupt-`README.md`, Abschnitt 3): die vier Markup-Felder hier konsumieren
dasselbe Anzeige-JSON (`next`, `upcoming`, `has_pickups`, `next.badge` =
`HEUTE`/`MORGEN`, `next.is_soon` für die invertierte Hervorhebung). Im TRMNL-
Plugin als Gerät **TRMNL X** wählen und als Polling-URL die Transform-URL setzen.

Der untenstehende Abschnitt ist die verbindliche Struktur-Doku der X-Vorlage.

## Die verbindliche Struktur

TRMNL erzeugt `Screen` und `View` selbst. Plugin-Markup beginnt deshalb mit
genau einer `layout`-Ebene und einem eigenen inneren Canvas:

```text
Screen              von TRMNL
└── View             von TRMNL
    └── Layout       vom Plugin
        └── Canvas   vom Plugin
            └── eigener Inhalt
```

Minimal:

```html
<div class="layout layout--col">
  <div class="x-canvas">
    <!-- Plugin-Inhalt -->
  </div>
</div>
```

Der innere Canvas ist kein optionales Detail. Er verhindert, dass TRMNL die
direkten Kinder des Layouts horizontal nebeneinander anordnet.

## Warum frühere Ansätze verzerrt wurden

Das TRMNL X besitzt ein Panel mit **1872×1404 Pixeln**. Das Framework arbeitet
jedoch mit einem logischen **1040×780-Canvas** und skaliert diesen über den
Gerätekontext mit Faktor **1,8** auf das Panel.

Die problematischen Ansätze waren:

- eine zweite `.screen`-Ebene im Plugin;
- eigene `.view`-Wrapper;
- `100vw` / `100vh`;
- `position: fixed`;
- Überschreiben von `transform`, `width` oder `height` der Plattform-`.screen`;
- mehrere direkte Kinder in einer normalen `.layout` ohne `layout--col`;
- alleinige Verwendung von `height: 100%` für ein Flex-Kind.

Diese Eingriffe umgehen oder verdoppeln die Geräte-Skalierung. Typische Folgen
sind ein winziger Inhalt in der Mitte, ein auf 800×480 begrenzter Ausschnitt,
Clipping oben links oder auseinandergezogene Mashup-Views.

## Shared Markup

Den Inhalt von `markup/shared.liquid` vollständig in das TRMNL-Feld
**Shared** kopieren.

Die entscheidende Regel ist:

```css
.trmnl .layout > .x-canvas {
  flex: 1 1 100% !important;
  align-self: stretch !important;
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  max-height: 100% !important;
}
```

Die hohe Spezifität ist beabsichtigt: Sie stellt sicher, dass der Plugin-Canvas
den vom TRMNL-Framework bereitgestellten Layout-Slot vollständig ausfüllt.

Die Variable `--starter-revision` dient als sichtbarer Cache-/Copy-Test. Beim
Ändern von Shared sollte die Revision erhöht werden. Meldet der TRMNL-Editor
trotz einer neuen Revision „No changes to save“, wurde nicht der neue Inhalt in
das Shared-Feld übernommen.

## Layout-Dateien

Die vier Dateien unter `markup/` gehören in die gleichnamigen TRMNL-Felder:

| Datei | TRMNL-Feld |
|---|---|
| `full.liquid` | Full |
| `half_horizontal.liquid` | Half horizontal |
| `half_vertical.liquid` | Half vertical |
| `quadrant.liquid` | Quadrant |
| `shared.liquid` | Shared |

Jede Datei enthält:

```html
<div class="layout layout--col">
  <div class="x-canvas ...">
    ...
  </div>
</div>
```

Keine zusätzliche `.screen` oder `.view` ergänzen.

## Größen und responsive Gestaltung

Das Framework setzt auf `.layout`:

```css
container-type: size;
```

Der innere Canvas kann deshalb `cqw` und `cqh` verwenden. Diese Einheiten
beziehen sich auf den tatsächlich verfügbaren View-Slot:

```css
.x-title {
  font-size: clamp(14px, 2.4cqw, 32px);
}
```

Das funktioniert sowohl in Full als auch in Half-/Quadrant-Mashups. Für
kritische Typografie immer `clamp()` verwenden, damit ein Wert weder auf dem OG
zu klein noch auf großen Panels übermäßig groß wird.

## Lokale Vorschau

```bash
make check     # Struktur-Lint der vier Layouts + Shared (muss grün sein)
make preview   # rendert Shared+Markup mit ../sample-Daten → preview/*.html
```

`preview/render.mjs` injiziert Shared + Markup mit den AWRM-Beispieldaten
(`../sample/output.json` = Normalfall, `../sample/output_today.json` = HEUTE)
in die echte Plattformstruktur und erzeugt `full`, `full_today`,
`half_horizontal`, `half_vertical`, `quadrant` als `.html`. Diese direkt im
Browser öffnen oder per Headless-Chrome screenshotten. `liquidjs` wird aus
`../tools/node_modules` aufgelöst (dort bereits installiert).

Der Preview-Wrapper bildet die Plattformstruktur nach:

```html
<body class="trmnl environment">
  <div class="screen screen--v2 screen--4bit">
    <div class="view view--full">
      <!-- Shared + Layout -->
    </div>
  </div>
</body>
```

Wichtig:

- Framework-CSS verwenden;
- `screen--v2` für TRMNL X;
- keine zusätzliche manuelle `scale(1.8)`-Regel – das Framework macht dies
  bereits über `--pixel-ratio`;
- Half-/Quadrant-Views zum realistischen Test in eine `mashup`-Struktur setzen.

Die Dateien in `preview/` sind eigenständige, statische Referenzen. Sie können
direkt im Browser geöffnet werden.

## Checkliste für ein neues Projekt

1. Diesen gesamten Ordner kopieren.
2. In `shared.liquid` einen projektbezogenen Klassennamen statt `x-...` wählen.
3. `--starter-revision` erhöhen.
4. Inhalt ausschließlich innerhalb von `.x-canvas` bauen.
5. Niemals `.screen` oder `.view` im Plugin-Markup erzeugen.
6. Niemals Plattform-Transforms oder Viewport-Abmessungen überschreiben.
7. Erst Full im Editor mit ausgewähltem Gerät **TRMNL X** prüfen.
8. Danach Half horizontal, Half vertical und Quadrant prüfen.
9. Plugin speichern, Force Refresh auslösen und zusätzlich den echten
   Server-/Geräte-Render kontrollieren.
10. Vor größeren Änderungen einen datierten Backup-Ordner erstellen.

## Fehlerdiagnose

### Inhalt ist klein und mittig

Der innere Canvas füllt das Layout nicht. Prüfen:

- `layout layout--col`;
- genau ein direktes Layout-Kind;
- spezifische `.trmnl .layout > .x-canvas`-Regel;
- aktuelle Shared-Revision wirklich gespeichert.

### Header, Inhalt und Footer stehen nebeneinander

Mehrere Elemente sind direkte Kinder einer normalen `.layout`. Alle Inhalte in
einen inneren Canvas verschieben und `layout--col` setzen.

### Nur oben links sind 800×480 sichtbar

Eine eigene `.screen` wurde eingefügt oder die Framework-Skalierung wurde
überschrieben. Eigene Screen-/View-Wrapper und alle Viewport-Hacks entfernen.

### Full funktioniert, Mashups sind verzerrt

Mit festen Pixelmaßen oder `vw/vh` wurde gegen den gesamten Browser-Viewport
gestaltet. Stattdessen im inneren Canvas `cqw/cqh`, Flexbox oder Grid verwenden.

### Editor sagt „No changes to save“

Eine eindeutige Revision in Shared ändern. Wird sie weiterhin nicht erkannt,
liegt der neue Inhalt nicht im Shared-Feld oder der falsche Tab ist aktiv.

## Verifizierter Referenzstand

Diese Vorlage wurde aus dem am **22. Juni 2026** erfolgreich auf einem
TRMNL X getesteten FIFA-K.-o.-Plugin abgeleitet.

