# Fremde Bausteine in Tracery

Tracery selbst ist urheberrechtlich geschützt (`© 2026 Nils Kriege. Alle Rechte vorbehalten.`, siehe [`LICENSE`](../LICENSE)).
Die folgenden mitgelieferten fremden Bausteine unterliegen weiterhin ihren jeweiligen eigenen Lizenzen.

## Übersicht

| Name | Version | Pfad im Repository | Lizenz | Quelle |
| --- | --- | --- | --- | --- |
| three.js | r169 | `app/lib/three/build/three.module.js`, `app/lib/three/examples/jsm/controls/OrbitControls.js`, `app/lib/three/examples/jsm/lines/LineMaterial.js`, `app/lib/three/examples/jsm/lines/LineSegments2.js`, `app/lib/three/examples/jsm/lines/LineSegmentsGeometry.js` | MIT-Lizenz (MIT) | https://github.com/mrdoob/three.js |
| Schrift „Inter“ | Regular & Fett | `app/data/schrift-inter.json`, `app/data/schrift-inter-fett.json`, `app/data/schrift-LIZENZ.txt` | SIL Open Font License 1.1 (OFL-1.1) | https://github.com/rsms/inter |
| replicad | – | `app/kernel/replicad/` | MIT-Lizenz (MIT) | https://github.com/sgenoud/replicad |
| Open CASCADE Technology (OCCT) / replicad-opencascadejs | – | `app/occ-kernel.wasm`, `app/kernel/occ.js` | LGPL-2.1-only mit Open CASCADE Exception 1.0 (Emscripten: MIT / NCSA) | https://dev.opencascade.org/ · https://github.com/sgenoud/replicad-opencascadejs |

## Bitte prüfen

- **Kein Baustein mit GPL oder AGPL vorhanden.** Alle im Repository mitgelieferten fremden Bausteine nutzen entweder freizügige Lizenzen (`MIT`, `SIL OFL 1.1`) oder eine schwache Copyleft-Lizenz (`LGPL-2.1-only` mit Ausnahme).
- **Open CASCADE Technology (OCCT) / `replicad-opencascadejs`** (`app/occ-kernel.wasm`, `app/kernel/occ.js`): steht unter **LGPL-2.1-only mit Open CASCADE Exception 1.0** (keine GPL/AGPL). Bei geschlossener Weitergabe von Tracery müssen die LGPL-2.1-Bedingungen eingehalten bleiben – insbesondere müssen die WebAssembly- und Loader-Dateien (`app/occ-kernel.wasm`, `app/kernel/occ.js`) als getrennte, austauschbare Bausteine erhalten bleiben, der Hinweis auf OpenCascade sichtbar mitgeliefert werden und eventuelle eigene Änderungen am OpenCascade-Kern selbst unter LGPL-2.1 bereitgestellt werden.
- **Web-Schriften in `app/src/head.html`** (`Barlow`, `Barlow Semi Condensed`, `IBM Plex Mono`, jeweils SIL OFL 1.1): werden über Google Fonts verlinkt und liegen nicht als Dateien im Repository. Falls eine komplett netzunabhängige Auslieferung gewünscht ist, sollten diese Schriften lokal eingebettet oder durch Systemschriften ersetzt werden.
- **Veralteter Hinweis bereinigt:** Im bisherigen „Über Tracery“-Fenster war noch `jsPDF (MIT)` genannt; eine solche Datei ist nicht mehr im Repository enthalten (die PDF-Ausgabe wird direkt in `app/src/js/70-drawing.js` erzeugt), der Hinweis wurde entsprechend aktualisiert.

## Lizenztexte im Einzelnen

### three.js (r169)

- **Zweck:** 3D-Darstellung, Kamera-Steuerung (OrbitControls) und Kantenlinien im Browser
- **Dateien:** `app/lib/three/build/three.module.js`, `app/lib/three/examples/jsm/controls/OrbitControls.js`, `app/lib/three/examples/jsm/lines/LineMaterial.js`, `app/lib/three/examples/jsm/lines/LineSegments2.js`, `app/lib/three/examples/jsm/lines/LineSegmentsGeometry.js`
- **Urheber:** Copyright © 2010–2024 Three.js Authors
- **Lizenz:** MIT-Lizenz (MIT)
- **Quelle:** https://github.com/mrdoob/three.js

```text
The MIT License

Copyright © 2010-2024 Three.js Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### Schrift „Inter“ (Regular & Fett)

- **Zweck:** Eingebaute Schriftart für das Text-Werkzeug in 2D-Skizzen
- **Dateien:** `app/data/schrift-inter.json`, `app/data/schrift-inter-fett.json`, `app/data/schrift-LIZENZ.txt`
- **Urheber:** Copyright 2016–2023 The Inter Project Authors (https://github.com/rsms/inter)
- **Lizenz:** SIL Open Font License 1.1 (OFL-1.1)
- **Quelle:** https://github.com/rsms/inter

```text
Copyright 2016-2023 The Inter Project Authors (https://github.com/rsms/inter)

This Font Software is licensed under the SIL Open Font License, Version 1.1.

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font
creation efforts of academic and linguistic communities, and to
provide a free and open framework in which fonts may be shared and
improved in partnership with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any
reserved names are not used by derivative works. The fonts and
derivatives, however, cannot be released under any other type of
license. The requirement for fonts to remain under this license
does not apply to any document created using the fonts or their
derivatives.

DEFINITIONS
Font Software refers to the set of files released by the
Copyright Holder(s) under this license and clearly marked as such.
This may include source files, build scripts and documentation.

Reserved Font Name refers to any names specified as such after
the copyright statement(s).

Original Version refers to the collection of Font Software
components as distributed by the Copyright Holder(s).

Modified Version refers to any derivative made by adding to,
deleting, or substituting in part or in whole any of the components
of the Original Version, by changing formats or by porting the Font
Software to a new environment.

Author refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person
obtaining a copy of the Font Software, to use, study, copy, merge,
embed, modify, redistribute, and sell modified and unmodified copies
of the Font Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
   in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
   redistributed and/or sold with any software, provided that each
   copy contains the above copyright notice and this license. These
   can be included either as stand-alone text files, human-readable
   headers or in the appropriate machine-readable metadata fields
   within text or binary files as long as those fields can be easily
   viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
   Name(s) unless explicit written permission is granted by the
   corresponding Copyright Holder. This restriction only applies to
   the primary font name as presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the
   Font Software shall not be used to promote, endorse or advertise
   any Modified Version, except to acknowledge the contribution(s)
   of the Copyright Holder(s) and the Author(s) or with their
   explicit written permission.

5) The Font Software, modified or unmodified, in part or in whole,
   must be distributed entirely under this license, and must not be
   distributed under any other license. The requirement for fonts to
   remain under this license does not apply to any document created
   using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions
are not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL
THE COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR
CONSEQUENTIAL DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF THE USE OR INABILITY TO USE THE FONT
SOFTWARE OR FROM OTHER DEALINGS IN THE FONT SOFTWARE.
```

### replicad

- **Zweck:** JavaScript-Bibliothek für parametrische 3D-CAD-Operationen auf Basis von OpenCascade
- **Dateien:** `app/kernel/replicad/`
- **Urheber:** Copyright (c) Steve Genoud
- **Lizenz:** MIT-Lizenz (MIT)
- **Quelle:** https://github.com/sgenoud/replicad

```text
MIT License

Copyright (c) Steve Genoud

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Open CASCADE Technology (OCCT) / replicad-opencascadejs

- **Zweck:** Exakter B-Rep-CAD-Geometrie-Kern als WebAssembly (inkl. Emscripten-Laufzeit)
- **Dateien:** `app/occ-kernel.wasm`, `app/kernel/occ.js`
- **Urheber:** OPEN CASCADE SAS; replicad-opencascadejs / opencascade.js Contributors; Emscripten Authors
- **Lizenz:** LGPL-2.1-only mit Open CASCADE Exception 1.0 (Emscripten: MIT / NCSA)
- **Quelle:** https://dev.opencascade.org/ · https://github.com/sgenoud/replicad-opencascadejs

```text
GNU Lesser General Public License, Version 2.1 (February 1999)
with Open CASCADE Exception, Version 1.0

Copyright (c) OPEN CASCADE SAS
Copyright (c) replicad-opencascadejs / opencascade.js Contributors
Copyright (c) Emscripten Authors (Laufzeit-Brücke in app/kernel/occ.js: MIT / University of Illinois/NCSA Open Source License)

This library is free software; you can redistribute it and/or
modify it under the terms of the GNU Lesser General Public
License as published by the Free Software Foundation; version 2.1 of
the License.

This library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Lesser General Public License for more details.

Vollständiger Text der LGPL-2.1:
https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html

---
Open CASCADE Exception (version 1.0):

As a special exception to the GNU Lesser General Public License version 2.1,
you may distribute such object code incorporating material from header files
provided with the Open CASCADE Technology libraries (including code of CDL
generic classes) under terms of your choice, provided that you give prominent
notice in supporting documentation to this code that it makes use of or is
based on facilities provided by the Open CASCADE Technology software.
```
