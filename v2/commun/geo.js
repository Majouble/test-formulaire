/* =====================================================================
   Socle v2 — fond de carte commun (tableau de bord, cartographie)
   Départements et académies en Lambert-93, avec encarts pour Paris et la petite couronne et pour l'outre-mer.
   window.Geo : données du fond (lues dans commun/geo-fond.js), correspondances département ↔ académie,
   placement d'un point (latitude, longitude).
   ===================================================================== */
(function () {
  "use strict";
  const GEO = window.GEO_FOND;
  if (!GEO) throw new Error("commun/geo-fond.js doit être chargé avant commun/geo.js");

  /* ---------- Noms et correspondances ---------- */
  const norm = (s) =>
    String(s ?? "")
      .replace(/\*/g, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  const geoNorm = (s) =>
    norm(s)
      .replace(/[\s\-'’_.]+/g, " ")
      .trim();
  const DEP_NAMES = {},
    DEP_ACA = {};
  GEO.dep.forEach((d) => {
    if (d.i !== "pc") {
      DEP_NAMES[d.k] = d.n;
      DEP_ACA[d.k] = d.a;
    }
  });
  const ACA_NAMES = [...new Set(GEO.aca.map((a) => a.k))];
  const DEP_BY_NAME = new Map(Object.entries(DEP_NAMES).map(([k, n]) => [geoNorm(n), k]));
  const ACA_BY_NAME = new Map(ACA_NAMES.map((a) => [geoNorm(a), a]));
  [
    ["reunion", "La Réunion"],
    ["la reunion", "La Réunion"],
    ["caen", "Normandie"],
    ["rouen", "Normandie"],
    ["orleans tours", "Orléans-Tours"],
    ["aix marseille", "Aix-Marseille"],
    ["nancy metz", "Nancy-Metz"],
    ["clermont", "Clermont-Ferrand"],
    ["clermont ferrand", "Clermont-Ferrand"],
    ["besancon", "Besançon"],
    ["creteil", "Créteil"],
  ].forEach(([k, v]) => ACA_BY_NAME.set(k, v));
  // code département à partir d'un code (93, 093, 2A, 974…) ou d'un nom
  function depKey(v) {
    const s0 = String(v ?? "").trim();
    if (!s0) return null;
    const s = s0.toUpperCase();
    const m = s.match(/^0?(2A|2B)(?![A-Z0-9])/) || s.match(/^(97[1-6])(?!\d)/) || s.match(/^0?(\d{1,2})(?!\d)/);
    if (m) {
      let k = m[1];
      if (/^\d$/.test(k)) k = "0" + k;
      if (DEP_NAMES[k]) return k;
    }
    return DEP_BY_NAME.get(geoNorm(s0.replace(/^\d+[A-B]?\s*[-–·]\s*/i, ""))) || null;
  }
  function acaKey(v) {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const n = geoNorm(s.replace(/^acad[ée]mie\s+(de\s+|d['’]\s*)?/i, ""));
    return ACA_BY_NAME.get(n) || DEP_ACA[depKey(s)] || null;
  }
  // département à partir d'un numéro UAI (0930125F -> 93 ; 620… -> 2A ; 720… -> 2B ; 974… -> 974)
  function depFromUai(v) {
    const s = String(v ?? "")
      .trim()
      .toUpperCase();
    const m = s.match(/^(\d{3})\d{4}[A-Z]$/);
    if (!m) return null;
    const c = m[1];
    const k = c === "620" ? "2A" : c === "720" ? "2B" : c.startsWith("97") ? c : c.slice(1);
    return DEP_NAMES[k] ? k : null;
  }
  const nomAcademie = (a) => `Académie ${/^[AEIOUÉ]/.test(a) ? "d'" : "de "}${a}`;

  /* ---------- Placement d'un point (latitude, longitude) sur le fond de carte ---------- */
  // Hexagone et Corse : Lambert-93 puis mise à l'échelle ; encart de Paris : idem, plus grand ;
  // Outre-mer : longitude et latitude mises à l'échelle de chaque encart (écart < 1 px à cette échelle).
  function lambert93(lat, lon) {
    const e = 0.0818191910428158,
      n = 0.725607765053267,
      c = 11754255.426096,
      xs = 700000,
      ys = 12655612.049876;
    const phi = (lat * Math.PI) / 180,
      es = e * Math.sin(phi);
    const L = Math.log(Math.tan(Math.PI / 4 + phi / 2) * Math.pow((1 - es) / (1 + es), e / 2));
    const R = c * Math.exp(-n * L),
      g = (n * (lon - 3) * Math.PI) / 180;
    return [xs + R * Math.sin(g), ys - R * Math.cos(g)];
  }
  const METRO = { s: 0.0010587506786, tx: 274.68303362, ty: 7555.19501851 };
  const PETITE_COURONNE = {
    s: 0.0069254742524,
    tx: -4347.78668095,
    ty: 47694.24715756,
    deps: ["75", "92", "93", "94"],
  };
  const OUTRE_MER = {
    // emprise (degrés, avec marge) et mise à l'échelle de chaque encart
    971: {
      lon: [-61.9, -60.9],
      lat: [15.8, 16.6],
      lon0: -61.80958,
      lat1: 16.51429,
      x0: 29,
      y0: 362,
      sx: 163.4675,
      sy: 167.1089,
    },
    972: {
      lon: [-61.3, -60.7],
      lat: [14.3, 14.95],
      lon0: -61.22927,
      lat1: 14.87878,
      x0: 226,
      y0: 362,
      sx: 233.4556,
      sy: 232.6008,
    },
    973: {
      lon: [-54.7, -51.5],
      lat: [2.0, 5.9],
      lon0: -54.60155,
      lat1: 5.74816,
      x0: 33,
      y0: 537,
      sx: 41.5761,
      sy: 41.2446,
    },
    974: {
      lon: [55.1, 56.0],
      lat: [-21.5, -20.8],
      lon0: 55.21653,
      lat1: -20.87174,
      x0: 198,
      y0: 544,
      sx: 248.327,
      sy: 262.741,
    },
    976: {
      lon: [44.9, 45.4],
      lat: [-13.1, -12.55],
      lon0: 45.01833,
      lat1: -12.63659,
      x0: 52,
      y0: 747,
      sx: 305.3327,
      sy: 306.5072,
    },
  };
  const nombre = (v) => {
    if (typeof v === "number") return v;
    const n = parseFloat(
      String(v ?? "")
        .replace(",", ".")
        .trim(),
    );
    return isFinite(n) ? n : NaN;
  };
  // Polygones des départements (coordonnées du fond), pour retrouver le département d'un point
  let polygones = null;
  function lirePolygones() {
    if (polygones) return polygones;
    polygones = [];
    GEO.dep.forEach((d) => {
      const anneaux = [];
      for (const [, cmd, args] of d.d.matchAll(/([Mlz])([^Mlz]*)/g)) {
        if (cmd === "z") continue;
        const n = args
          .trim()
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(Number);
        if (cmd === "M") anneaux.push([[n[0], n[1]]]);
        else {
          const a = anneaux[anneaux.length - 1];
          let [x, y] = a[a.length - 1];
          for (let j = 0; j + 1 < n.length; j += 2) {
            x += n[j];
            y += n[j + 1];
            a.push([x, y]);
          }
        }
      }
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      anneaux.flat().forEach(([x, y]) => {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      });
      polygones.push({ k: d.k, i: d.i, anneaux, boite: [x0, y0, x1, y1] });
    });
    return polygones;
  }
  function dansPolygone(x, y, p) {
    const [x0, y0, x1, y1] = p.boite;
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    let dedans = false;
    p.anneaux.forEach((a) => {
      for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
        const [xi, yi] = a[i],
          [xj, yj] = a[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
      }
    });
    return dedans;
  }
  // Département sous un point du fond (couche principale, hors encart de Paris) ; à défaut, le plus proche à 6 px près (côtes simplifiées)
  function departementSous(x, y, encart) {
    const ps = lirePolygones().filter((p) => (encart ? p.k === encart : p.i !== "pc"));
    const p = ps.find((q) => dansPolygone(x, y, q));
    if (p) return p.k;
    let best = null,
      dmin = 6;
    ps.forEach((q) => {
      const [x0, y0, x1, y1] = q.boite;
      if (x < x0 - dmin || x > x1 + dmin || y < y0 - dmin || y > y1 + dmin) return;
      q.anneaux.forEach((a) =>
        a.forEach(([px, py]) => {
          const dd = Math.hypot(px - x, py - y);
          if (dd < dmin) {
            dmin = dd;
            best = q.k;
          }
        }),
      );
    });
    return best;
  }
  // { x, y, dep, encart } pour la couche principale (hexagone ou encart d'outre-mer) et, à Paris et en petite couronne,
  // { x, y } dans l'encart agrandi ; null si le point est hors du territoire couvert.
  function placer(lat, lon) {
    lat = nombre(lat);
    lon = nombre(lon);
    if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) return null;
    for (const [k, o] of Object.entries(OUTRE_MER)) {
      if (lon >= o.lon[0] && lon <= o.lon[1] && lat >= o.lat[0] && lat <= o.lat[1]) {
        const x = o.x0 + (lon - o.lon0) * o.sx,
          y = o.y0 + (o.lat1 - lat) * o.sy;
        return { x, y, dep: k, encart: k };
      }
    }
    if (lat < 41 || lat > 51.5 || lon < -5.5 || lon > 10) return null;
    const [E, N] = lambert93(lat, lon),
      x = METRO.s * E + METRO.tx,
      y = -METRO.s * N + METRO.ty;
    const dep = departementSous(x, y);
    const r = { x, y, dep, encart: null };
    if (PETITE_COURONNE.deps.includes(dep))
      r.paris = { x: PETITE_COURONNE.s * E + PETITE_COURONNE.tx, y: -PETITE_COURONNE.s * N + PETITE_COURONNE.ty };
    return r;
  }
  // Département et académie d'un point (codes du fond de carte), ou null
  function localiser(lat, lon) {
    const p = placer(lat, lon);
    if (!p || !p.dep) return null;
    return { dep: p.dep, departement: DEP_NAMES[p.dep], academie: DEP_ACA[p.dep] };
  }
  // Fond de carte en SVG (départements gris clair, limites d'académie), à l'échelle k ; options : { fond, trait, academies }
  function fondSvg(k, o) {
    o = o || {};
    const fond = o.fond || "#eef0f5",
      trait = o.trait || "#ffffff",
      aca =
        o.academies === false
          ? ""
          : GEO.aca
              .map(
                (e) =>
                  `<path d="${e.d}" fill="none" stroke="${o.traitAcademie || "#8a8fa3"}" stroke-width="${(0.9 / k).toFixed(2)}" stroke-linejoin="round" pointer-events="none"></path>`,
              )
              .join("");
    const deps = GEO.dep
      .map(
        (e) =>
          `<path d="${e.d}" fill="${fond}" stroke="${trait}" stroke-width="${(0.7 / k).toFixed(2)}" stroke-linejoin="round" data-dep="${e.k}"><title>${e.k} · ${e.n}</title></path>`,
      )
      .join("");
    return `<g transform="scale(${k.toFixed(5)})">${deps}${aca}</g>`;
  }

  window.Geo = {
    GEO,
    norm,
    geoNorm,
    DEP_NAMES,
    DEP_ACA,
    ACA_NAMES,
    DEP_BY_NAME,
    ACA_BY_NAME,
    depKey,
    acaKey,
    depFromUai,
    nomAcademie,
    lambert93,
    placer,
    localiser,
    fondSvg,
    nombre,
  };
})();
