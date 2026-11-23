/* =====================================================================
   Socle v2 — fabrication de vidéos (MP4) et d'images animées (GIF) à partir d'images dessinées dans le navigateur
   Sans bibliothèque ni service extérieur : le MP4 est encodé par le navigateur (WebCodecs, H.264) puis rangé dans un
   fichier MP4 classique (non fragmenté, lisible par PowerPoint) ; le GIF est encodé ici (palette, compression LZW).

   Définit : window.Video = { mp4(images), gif(images), mp4Possible() }
     images : [{ canvas, duree }] — canvas : image de même taille pour toutes ; duree : durée d'affichage en millisecondes.
     mp4 et gif rendent une promesse de Blob ; mp4 échoue (message en français) si le navigateur ne sait pas encoder.
   Utilise : rien d'autre que le navigateur (VideoEncoder, VideoFrame, canvas).
   ===================================================================== */
(function () {
  "use strict";

  // ------------------------------------------------------------------ MP4
  // Profils H.264 essayés dans l'ordre : « baseline » d'abord (pas d'images B, donc ordre d'affichage = ordre de lecture)
  const CODECS_H264 = ["avc1.42e028", "avc1.42e01f", "avc1.4d0028", "avc1.640028"];

  async function choisirCodec(largeur, hauteur) {
    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
    for (const codec of CODECS_H264) {
      const config = { codec, width: largeur, height: hauteur, bitrate: 2500000, framerate: 30, avc: { format: "avc" } };
      try { if ((await VideoEncoder.isConfigSupported(config)).supported) return config; } catch (_) { /* codec suivant */ }
    }
    return null;
  }
  async function mp4Possible() {
    return !!(await choisirCodec(640, 480));
  }

  async function mp4(images) {
    if (!images.length) throw new Error("aucune image à enregistrer");
    const largeur = images[0].canvas.width, hauteur = images[0].canvas.height;
    if (largeur % 2 || hauteur % 2) throw new Error("la largeur et la hauteur doivent être paires");
    const config = await choisirCodec(largeur, hauteur);
    if (!config) throw new Error("ce navigateur ne sait pas produire de vidéo MP4 : utilisez Edge ou Chrome à jour");
    const echantillons = []; let description = null, erreur = null;
    const encodeur = new VideoEncoder({
      output: (morceau, meta) => {
        if (meta && meta.decoderConfig && meta.decoderConfig.description && !description) {
          const d = meta.decoderConfig.description;
          description = new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
        }
        const donnees = new Uint8Array(morceau.byteLength); morceau.copyTo(donnees);
        echantillons.push({ donnees, cle: morceau.type === "key", debut: morceau.timestamp });
      },
      error: e => { erreur = e; },
    });
    encodeur.configure(config);
    let t = 0;                                                     // en millisecondes
    images.forEach((im, i) => {
      const image = new VideoFrame(im.canvas, { timestamp: t * 1000, duration: im.duree * 1000 });   // microsecondes
      encodeur.encode(image, { keyFrame: i % 20 === 0 });
      image.close(); t += im.duree;
    });
    await encodeur.flush(); encodeur.close();
    if (erreur) throw erreur;
    if (!description) throw new Error("l'encodeur n'a pas fourni sa configuration (avcC)");
    if (echantillons.length !== images.length) throw new Error(`${echantillons.length} images encodées sur ${images.length}`);
    // durée de chaque échantillon : celle de l'image (pas d'images B : l'ordre de sortie est celui des images)
    echantillons.forEach((e, i) => { e.duree = images[i].duree; });
    return new Blob([ecrireMp4(echantillons, description, largeur, hauteur)], { type: "video/mp4" });
  }

  // Fichier MP4 : ftyp, moov (avant les données, pour une lecture immédiate), mdat. Échelle de temps : la milliseconde.
  function ecrireMp4(echantillons, avcC, largeur, hauteur) {
    const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const u16 = n => [(n >>> 8) & 255, n & 255];
    const txt = s => [...s].map(c => c.charCodeAt(0));
    const boite = (type, ...contenus) => {
      const corps = contenus.flatMap(c => c instanceof Uint8Array ? [...c] : c);
      return [...u32(8 + corps.length), ...txt(type), ...corps];
    };
    const pleine = (type, version, drapeaux, ...contenus) => boite(type, [version, ...u32(drapeaux).slice(1)], ...contenus);
    const MATRICE = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].flatMap(u32);
    const duree = echantillons.reduce((a, e) => a + e.duree, 0);
    const tailleDonnees = echantillons.reduce((a, e) => a + e.donnees.length, 0);

    const stts = [];                                               // durées, regroupées quand elles se suivent
    echantillons.forEach(e => { const der = stts[stts.length - 1]; if (der && der[1] === e.duree) der[0]++; else stts.push([1, e.duree]); });
    const cles = echantillons.map((e, i) => e.cle ? i + 1 : 0).filter(Boolean);

    const moov = decalage => boite("moov",
      pleine("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(duree), u32(0x10000), u16(0x100), new Array(10).fill(0), MATRICE, new Array(24).fill(0), u32(2)),
      boite("trak",
        pleine("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(duree), new Array(8).fill(0), u16(0), u16(0), u16(0), u16(0), MATRICE, u32(largeur * 65536), u32(hauteur * 65536)),
        boite("mdia",
          pleine("mdhd", 0, 0, u32(0), u32(0), u32(1000), u32(duree), u16(0x55c4), u16(0)),
          pleine("hdlr", 0, 0, u32(0), txt("vide"), new Array(12).fill(0), txt("VideoHandler"), [0]),
          boite("minf",
            pleine("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0)),
            boite("dinf", pleine("dref", 0, 0, u32(1), pleine("url ", 0, 1))),
            boite("stbl",
              pleine("stsd", 0, 0, u32(1), boite("avc1", new Array(6).fill(0), u16(1), u16(0), u16(0), new Array(12).fill(0),
                u16(largeur), u16(hauteur), u32(0x480000), u32(0x480000), u32(0), u16(1), new Array(32).fill(0), u16(0x18), u16(0xffff),
                boite("avcC", avcC))),
              pleine("stts", 0, 0, u32(stts.length), stts.flatMap(([n, d]) => [...u32(n), ...u32(d)])),
              pleine("stss", 0, 0, u32(cles.length), cles.flatMap(u32)),
              pleine("stsc", 0, 0, u32(1), u32(1), u32(echantillons.length), u32(1)),
              pleine("stsz", 0, 0, u32(0), u32(echantillons.length), echantillons.flatMap(e => u32(e.donnees.length))),
              pleine("stco", 0, 0, u32(1), u32(decalage)))))));
    const ftyp = boite("ftyp", txt("isom"), u32(0x200), txt("isom"), txt("iso2"), txt("avc1"), txt("mp41"));
    const tailleMoov = moov(0).length;
    const tete = new Uint8Array([...ftyp, ...moov(ftyp.length + tailleMoov + 8), ...u32(8 + tailleDonnees), ...txt("mdat")]);
    const sortie = new Uint8Array(tete.length + tailleDonnees);
    sortie.set(tete, 0);
    let p = tete.length; echantillons.forEach(e => { sortie.set(e.donnees, p); p += e.donnees.length; });
    return sortie;
  }

  // ------------------------------------------------------------------ GIF
  // Palette commune à toutes les images : les couleurs les plus fréquentes (aplats des cartes, textes), complétées par
  // un cube de 4 × 4 × 4 couleurs pour les bords lissés ; chaque pixel prend la couleur la plus proche.
  function palette(pixelsParImage) {
    const compte = new Map();
    pixelsParImage.forEach(px => { for (let i = 0; i < px.length; i += 4 * 3) { const c = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]; compte.set(c, (compte.get(c) || 0) + 1); } });
    const frequentes = [...compte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 192).map(e => e[0]);
    const pal = [...frequentes];
    for (let r = 0; r < 4 && pal.length < 256; r++) for (let g = 0; g < 4 && pal.length < 256; g++) for (let b = 0; b < 4 && pal.length < 256; b++) {
      const c = (r * 85 << 16) | (g * 85 << 8) | (b * 85); if (!pal.includes(c)) pal.push(c);
    }
    while (pal.length < 256) pal.push(0);
    return pal;
  }
  function indexeur(pal) {
    const cache = new Map(), R = pal.map(c => c >> 16 & 255), G = pal.map(c => c >> 8 & 255), B = pal.map(c => c & 255);
    return (r, g, b) => {
      const c = (r << 16) | (g << 8) | b; let k = cache.get(c);
      if (k === undefined) {
        let meilleur = Infinity; k = 0;
        for (let j = 0; j < 256; j++) { const d = (R[j] - r) ** 2 * 3 + (G[j] - g) ** 2 * 4 + (B[j] - b) ** 2 * 2; if (d < meilleur) { meilleur = d; k = j; } }
        cache.set(c, k);
      }
      return k;
    };
  }
  // Compression LZW du GIF (codes de 9 à 12 bits, taille minimale 8), écrite en sous-blocs de 255 octets
  function lzw(indices, sortie) {
    const MIN = 8, CLEAR = 256, FIN = 257;
    const table = new Int32Array(4096 * 256), marque = new Int32Array(4096 * 256);
    let generation = 1, suivant = FIN + 1, taille = MIN + 1, accu = 0, nbits = 0;
    const octets = [];
    const ecrire = code => { accu |= code << nbits; nbits += taille; while (nbits >= 8) { octets.push(accu & 255); accu >>>= 8; nbits -= 8; } };
    ecrire(CLEAR);
    let prefixe = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], cle = prefixe * 256 + k;
      if (marque[cle] === generation) { prefixe = table[cle]; continue; }
      ecrire(prefixe);
      if (suivant < 4096) {
        table[cle] = suivant; marque[cle] = generation;
        if (suivant === (1 << taille) && taille < 12) taille++;   // le code suivant ne tient plus : un bit de plus
        suivant++;
      } else { ecrire(CLEAR); generation++; suivant = FIN + 1; taille = MIN + 1; }
      prefixe = k;
    }
    ecrire(prefixe); ecrire(FIN);
    if (nbits > 0) octets.push(accu & 255);
    sortie.push(MIN);
    for (let i = 0; i < octets.length; i += 255) { const n = Math.min(255, octets.length - i); sortie.push(n); for (let j = 0; j < n; j++) sortie.push(octets[i + j]); }
    sortie.push(0);
  }

  async function gif(images) {
    if (!images.length) throw new Error("aucune image à enregistrer");
    const L = images[0].canvas.width, H = images[0].canvas.height;
    const pixels = images.map(im => im.canvas.getContext("2d").getImageData(0, 0, L, H).data);
    const pal = palette(pixels), indice = indexeur(pal);
    const s = [];
    const u16 = n => s.push(n & 255, (n >> 8) & 255);
    s.push(..."GIF89a".split("").map(c => c.charCodeAt(0)));
    u16(L); u16(H); s.push(0xf7, 0, 0);                            // palette globale de 256 couleurs
    pal.forEach(c => s.push(c >> 16 & 255, c >> 8 & 255, c & 255));
    s.push(0x21, 0xff, 11, ..."NETSCAPE2.0".split("").map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0);   // boucle sans fin
    let avant = null;
    for (let n = 0; n < images.length; n++) {
      const px = pixels[n], idx = new Uint8Array(L * H);
      for (let i = 0, j = 0; i < idx.length; i++, j += 4) idx[i] = indice(px[j], px[j + 1], px[j + 2]);
      // seul le rectangle qui change par rapport à l'image précédente est écrit
      let x0 = 0, y0 = 0, x1 = L - 1, y1 = H - 1;
      if (avant) {
        x0 = L; y0 = H; x1 = -1; y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) if (idx[y * L + x] !== avant[y * L + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }            // image identique : un pixel suffit
      }
      const l = x1 - x0 + 1, h = y1 - y0 + 1, partie = new Uint8Array(l * h);
      for (let y = 0; y < h; y++) partie.set(idx.subarray((y0 + y) * L + x0, (y0 + y) * L + x0 + l), y * l);
      const delai = Math.max(2, Math.round(images[n].duree / 10));  // centièmes de seconde
      s.push(0x21, 0xf9, 4, 0x04, delai & 255, delai >> 8, 0, 0);   // image gardée sous la suivante
      s.push(0x2c); u16(x0); u16(y0); u16(l); u16(h); s.push(0);
      lzw(partie, s);
      avant = idx;
      if (n % 5 === 4) await new Promise(r => setTimeout(r, 0));    // laisse la page respirer
    }
    s.push(0x3b);
    return new Blob([new Uint8Array(s)], { type: "image/gif" });
  }

  window.Video = { mp4, gif, mp4Possible };
})();
