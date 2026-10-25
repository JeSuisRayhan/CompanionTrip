// Reading addresses and map links out of the text of a video ("📍 Chez Moktar, Route de la Marina, Midoun").
//
// Pure functions, no network. The caption of a TikTok or the description of a YouTube video goes in; the addresses
// found in it come out, so that a place can be put on the map by what its author wrote and not by its name alone.
//
// In plain words, an address is recognised when it has one of these shapes:
//  - a house number and a street type: "12 rue de la Paix", "7 Carmine St", "29 Bd Saint-Germain";
//  - a street type with the number after: "Calle Mayor 17", "Via dei Vascellari, 29", "Waisenstraße 14-16";
//  - a house number, a name and a postal code with its town: "9 Carrefour de l'Odéon, 75006 Paris";
//  - a street type and a name followed by a town: "Route de la Marina, Midoun" (only with the comma and the town);
//  - the blocks of a Japanese address ("1-22-7 Jinnan, Shibuya City", "東京都渋谷区神南1-22-7").
// What follows the street (postal code, town, region, country) is kept as long as it looks like one.
// Anything else is not an address: the name of the place is still read, just without it.

const UPPER = /^\p{Lu}/u;
const LOWER_START = /^\p{Ll}/u;

// ---------- Words ----------

// Street types written before the name: "12 rue de la Paix", "5 via Roma".
const TYPE_FIRST = new Set([
  "rue", "avenue", "av", "ave", "boulevard", "bd", "bld", "bvd", "blvd", "quai", "chemin", "route", "rte", "allée", "allee", "impasse", "faubourg", "fbg", "ruelle", "corniche",
  "place", "pl", "cours", "square", "villa", "passage", "galerie", "cité", "cite", "parvis", "traverse", "résidence", "residence", "montée", "montee", "esplanade", "promenade", "sentier", "voie",
  "via", "viale", "piazza", "piazzale", "corso", "vicolo", "calle", "carrer", "avenida", "avda", "plaza", "paseo", "camino", "rua", "rúa", "travessa", "largo", "praça", "praca",
]);
// Types that are also ordinary words ("une place", "2 cours de cuisine"): after them the name must start with a capital letter.
const AMBIGUOUS = new Set(["place", "pl", "cours", "square", "villa", "passage", "galerie", "cité", "cite", "parvis", "traverse", "résidence", "residence", "montée", "montee", "voie", "sentier", "esplanade", "promenade", "via"]);
// Types that, without a house number, still say "address" when a town follows after a comma ("Route de la Marina, Midoun").
const NUMBERLESS = new Set(["rue", "avenue", "boulevard", "route", "quai", "chemin", "allée", "allee", "impasse", "corniche", "calle", "carrer", "avenida", "paseo", "camino", "piazza", "viale", "corso", "rua", "rúa", "largo"]);
// Italian, Spanish, Portuguese: the number comes after the name ("Calle Mayor 17").
const NUMBER_LAST = new Set(["via", "viale", "piazza", "piazzale", "corso", "vicolo", "calle", "carrer", "avenida", "avda", "av", "plaza", "paseo", "camino", "rua", "rúa", "travessa", "largo", "praça", "praca"]);
// English: "7 Carmine St", "1600 Pennsylvania Avenue NW".
const TYPE_LAST = new Set([
  "street", "st", "avenue", "ave", "road", "rd", "boulevard", "blvd", "drive", "dr", "lane", "ln", "way", "place", "pl", "court", "ct", "square", "sq", "highway", "hwy",
  "terrace", "ter", "alley", "plaza", "parkway", "pkwy", "crescent", "cres", "close", "gardens", "mews", "walk", "broadway", "bowery",
]);
const DIRECTIONS = /^(?:N|S|E|W|NE|NW|SE|SW)$/;
// German, Dutch: the type is the end of the name ("Waisenstraße 14").
const SUFFIX_STREET = /^\p{Lu}[\p{L}-]*(?:[Ss]tra(?:ß|ss)e|[Ss]tr\.?|[Gg]asse|[Ww]eg|[Pp]latz|[Aa]llee|[Ss]traat|[Ll]aan|[Pp]lein|[Gg]racht|[Kk]ade|[Dd]amm|[Uu]fer|[Rr]ing)$/u; // "Karl-Marx-Allee": the type may be capitalised after a hyphen
// The same types written as a word of their own: "Schönhauser Allee 44B", "Karl Marx Allee 12".
const SEPARATE_SUFFIX = new Set(["allee", "platz", "straße", "strasse", "weg", "damm", "ufer", "ring", "gasse", "chaussee", "markt", "plein", "straat", "laan", "gracht", "kade"]);

// Small words inside a street name: "rue de la Paix", "calle del Pez", "Via dei Vascellari".
const CONNECTORS = new Set(["de", "du", "des", "la", "le", "les", "del", "della", "dei", "delle", "di", "da", "do", "dos", "das", "el", "los", "las", "von", "van", "der", "den", "y", "e", "et", "of", "the", "sur", "sous", "en", "aux", "au"]);
const ELIDED_CAP = /^(?:[lLdD]|[dD]ell|[aA]ll|[nN]ell|[sS]ull)['’]\p{Lu}/u; // "l'Odéon", "d'Orsay": a connector and a name in one word
const ELIDED_LOW = /^[lLdD]['’]\p{Ll}/u; // "l'ancienne": a connector
// Words that end an address in a sentence ("12 rue X à Paris, je recommande").
const STOP = new Set(["à", "a", "au", "aux", "dans", "in", "at", "près", "pres", "vers", "pour", "avec", "ou", "or", "and", "je", "on", "nous", "il", "elle", "ils", "qui", "que", "car", "mais", "très", "super", "trop", "ouvert", "ouverte", "fermé", "ferme", "open", "closed", "from", "to", "by", "is", "are", "et"]);
const LOCALITY_MARKERS = new Set(["à", "a", "in", "en", "dans", "at"]);
const ABBREVIATIONS = new Set(["st", "bd", "av", "ave", "avda", "rd", "dr", "ln", "ct", "str", "pl", "rte", "blvd", "sq", "hwy", "ter", "cres", "pkwy", "fbg", "no", "n"]);

// Countries: they close an address, they are not its town.
const COUNTRIES = new Set([
  "france", "tunisie", "tunisia", "japon", "japan", "italie", "italy", "italia", "espagne", "spain", "españa", "portugal", "maroc", "morocco", "algérie", "algerie", "algeria", "allemagne", "germany", "deutschland",
  "royaume-uni", "united kingdom", "uk", "england", "angleterre", "usa", "united states", "états-unis", "etats-unis", "grèce", "grece", "greece", "turquie", "turkey", "thaïlande", "thailande", "thailand", "vietnam",
  "indonésie", "indonesie", "indonesia", "belgique", "belgium", "suisse", "switzerland", "pays-bas", "netherlands", "égypte", "egypte", "egypt", "mexique", "mexico", "canada", "chine", "china", "corée", "korea", "inde", "india",
]);

// ---------- Tokens ----------

// Emoji, hashtags and mentions are blanked out (same length, so positions still match the original text).
const EMOJI_UNIT = /[\uD800-\uDFFF‍️☀-➿⬀-⯿•■-◿]/g;
function blank(s) {
  return String(s || "")
    .replace(EMOJI_UNIT, " ")
    .replace(/[#@]\S+/g, (m) => " ".repeat(m.length));
}

// Words, and the commas that separate the parts of an address.
function tokenize(s) {
  const out = [];
  const re = /[^\s,;]+|[,;]/g;
  let m;
  while ((m = re.exec(s))) out.push({ w: m[0], i: m.index, j: m.index + m[0].length });
  return out;
}

// The word without the punctuation around it ("Paris.", "(Kyoto)", "«Gion»").
const bare = (w) => String(w).replace(/^[("'«“\[]+|[)"'»”\].!?:…]+$/g, "");
const low = (w) => bare(w).toLowerCase();
const hasDigit = (w) => /\d/.test(w);
const isHouseNumber = (w) => /^\d{1,4}(?:-\d{1,4})?(?:bis|ter|quater)?[a-dA-D]?$/.test(bare(w));
const isPostalCode = (w) => /^(?:\d{4,5}|\d{3}-\d{4}|\d{4}-\d{3})$/.test(bare(w));
const isUkPostcodePart = (w) => /^[A-Z]{1,2}\d[A-Z\d]?$/.test(bare(w)) || /^\d[A-Z]{2}$/.test(bare(w));
const isConnector = (w) => CONNECTORS.has(low(w)) || ELIDED_LOW.test(bare(w));
const isNameWord = (w) => UPPER.test(bare(w)) || ELIDED_CAP.test(bare(w));
const isOrdinal = (w) => /^\d{1,2}(?:er|e|ème|eme)?$/i.test(bare(w));
const endsSentence = (w) => /[!?…]$/.test(w) || (/\.$/.test(w) && !ABBREVIATIONS.has(low(w)));

// ---------- Anchors: where an address starts ----------

// Is there a street name after the type at tokens[j]? A capital letter ("rue Sainte-Anne", "rue de la Paix"), or, for the
// types that are never an ordinary word, a lowercase name after a connector ("rue des petits champs").
function hasName(tokens, j, needsCapital) {
  let q = j + 1;
  let connectors = 0;
  while (tokens[q] && isConnector(tokens[q].w) && connectors < 4) {
    connectors += 1;
    q += 1;
  }
  const next = tokens[q];
  if (!next || next.w === "," || next.w === ";") return false;
  if (isNameWord(next.w)) return true;
  if (connectors > 0 && isOrdinal(next.w)) return true; // "rue du 8 Mai 1945"
  return !needsCapital && connectors > 0 && LOWER_START.test(bare(next.w)) && !STOP.has(low(next.w)) && !hasDigit(next.w);
}

// The index of the token after the street name that follows the type at tokens[j].
function nameEnd(tokens, j) {
  let q = j + 1;
  let inLower = false; // after a connector, lowercase words still belong to the name ("des petits champs")
  let lowRun = 0;
  while (tokens[q]) {
    const w = tokens[q].w;
    if (w === "," || w === ";") break;
    const b = bare(w);
    if (isConnector(w)) {
      inLower = true;
      lowRun = 0;
    } else if (isNameWord(w)) {
      inLower = false;
      lowRun = 0;
    } else if (isOrdinal(b) && q > j + 1 && isConnector(tokens[q - 1].w)) {
      // "du 8 Mai"
    } else if (/^\d{4}$/.test(b) && q > j + 2 && isOrdinal(tokens[q - 2].w)) {
      // "1945" after "8 Mai"
    } else if (inLower && LOWER_START.test(b) && !STOP.has(b.toLowerCase()) && !hasDigit(b) && lowRun < 3) {
      lowRun += 1;
    } else {
      break;
    }
    q += 1;
    if (endsSentence(w)) break;
  }
  return q;
}

// "Calle Mayor 17" / "Via dei Vascellari, 29": the index of the number after the name, or null.
function numberAfterName(tokens, k) {
  const after = nameEnd(tokens, k);
  let q = after;
  if (tokens[q] && tokens[q].w === ",") q += 1;
  if (tokens[q] && isHouseNumber(tokens[q].w) && !isPostalCode(tokens[q].w)) return q;
  return null;
}

// A house number, a name, then a postal code and a town: "9 Carrefour de l'Odéon, 75006 Paris".
function postalAfterNumber(tokens, k, strong) {
  if (tokens[k + 1] && tokens[k + 1].w === ",") return null;
  let q = k + 1;
  for (; tokens[q] && q <= k + 9; q++) {
    const w = tokens[q].w;
    if (w === ";") return null;
    if (w === ",") continue;
    if (isPostalCode(w)) break;
    if (!(isNameWord(w) || isConnector(w) || isOrdinal(w))) return null;
    if (endsSentence(w)) return null;
  }
  const code = tokens[q];
  const town = tokens[q + 1];
  if (!code || !isPostalCode(code.w) || q === k + 1) return null;
  if (town && isNameWord(town.w)) return q + 1;
  return strong && q - k >= 3 ? q : null; // Japan: "59-1 Yoshida Shimoadachicho, Sakyo Ward, Kyoto, 606-8314" (the code comes last)
}

// "Route de l'Aéroport km 5": the kilometre mark closes the name.
function skipKm(tokens, q) {
  return tokens[q] && /^km$/i.test(bare(tokens[q].w)) && tokens[q + 1] && isHouseNumber(tokens[q + 1].w) ? q + 2 : q;
}

// Looks for the beginning of an address at token k. Returns { start, core, kind } (token indexes: the first token of the
// address, and the last token that is certainly part of it), or null.
function anchorAt(tokens, k, strong) {
  const t = tokens[k];
  const w = bare(t.w);
  const lw = w.toLowerCase();

  if (isHouseNumber(w)) {
    // "12 rue de la Paix", "12, rue de la Paix", "12 bis rue X": a house number, then a street type.
    let j = k + 1;
    const comma = tokens[j] && tokens[j].w === ",";
    // "Da Enzo al 29, Via dei Vascellari": a number that ends a name is not the house number of what follows the comma.
    const afterWord = k > 0 && LOWER_START.test(bare(tokens[k - 1].w));
    if (comma && !afterWord) j += 1;
    if (!comma || !afterWord) {
      if (tokens[j] && /^(bis|ter|quater)$/i.test(bare(tokens[j].w))) j += 1;
      const type = tokens[j];
      if (type && TYPE_FIRST.has(low(type.w)) && hasName(tokens, j, AMBIGUOUS.has(low(type.w)))) return { start: k, core: j, kind: "typeFirst" };
    }

    // English: "7 Carmine St", "127 Ledbury Rd", "1600 Pennsylvania Avenue NW": 1 to 4 capitalised words, then a type.
    let q = k + 1;
    let n = 0;
    while (tokens[q] && isNameWord(tokens[q].w) && !TYPE_LAST.has(low(tokens[q].w)) && n < 4) {
      n += 1;
      q += 1;
    }
    if (n >= 1 && tokens[q] && TYPE_LAST.has(low(tokens[q].w)) && UPPER.test(bare(tokens[q].w))) {
      // "5 Hidden Gems Road Trip" is not an address: after the type comes the end, a comma, a direction or a number.
      const nx = tokens[q + 1];
      if (!nx || nx.w === "," || nx.w === ";" || endsSentence(tokens[q].w) || DIRECTIONS.test(bare(nx.w)) || isHouseNumber(nx.w) || isPostalCode(nx.w) || isUkPostcodePart(nx.w)) {
        return { start: k, core: q, kind: "typeLast" };
      }
    }

    // "9 Carrefour de l'Odéon, 75006 Paris": any name, as long as a postal code and a town follow.
    const end = postalAfterNumber(tokens, k, strong);
    if (end != null) return { start: k, core: end, kind: "postal" };

    // Japan: "1 Chome-22-7 Jinnan" ("chome" is a district number: nothing else is written like this).
    if (tokens[k + 1] && /^chome(?:-\d{1,3}){0,2}$/i.test(bare(tokens[k + 1].w))) return { start: k, core: k + 1, kind: "jp" };
    return null;
  }

  // "1Chome-22-7": the same, written in one word.
  if (/^\d{1,2}-?chome(?:-\d{1,3}){0,2}$/i.test(w)) return { start: k, core: k, kind: "jp" };
  // "1-22-7": blocks of a Japanese address. Strong context only (a bare "1-22-7" could be anything).
  if (strong && /^\d{1,3}[-‐–]\d{1,3}[-‐–]\d{1,3}$/.test(w)) return { start: k, core: k, kind: "jp" };

  // "Via dei Vascellari, 29", "Calle Mayor 17", "Av. Brasil 4": a type, a name, then the number.
  if (NUMBER_LAST.has(lw) && (UPPER.test(w) || k === 0 || tokens[k - 1].w === ",") && hasName(tokens, k, AMBIGUOUS.has(lw))) {
    const num = numberAfterName(tokens, k);
    if (num != null) return { start: k, core: num, kind: "numberLast" };
  }

  // "Waisenstraße 14-16", "Prinsengracht 263".
  if (SUFFIX_STREET.test(w) && tokens[k + 1] && isHouseNumber(tokens[k + 1].w)) return { start: k, core: k + 1, kind: "suffix" };
  // "Schönhauser Allee 44B": one to three capitalised words, the type as a word of its own, then the number.
  if (UPPER.test(w) && !hasDigit(w)) {
    for (let n = 0; n <= 2; n++) {
      if (n > 0 && !(tokens[k + n] && isNameWord(tokens[k + n].w))) break;
      const type = tokens[k + 1 + n];
      const num = tokens[k + 2 + n];
      if (type && num && SEPARATE_SUFFIX.has(low(type.w)) && UPPER.test(bare(type.w)) && isHouseNumber(num.w) && !isPostalCode(num.w)) return { start: k, core: k + 2 + n, kind: "suffix" };
    }
  }

  // "Route de la Marina, Midoun": a street type with a capitalised name, then a comma and a town. No number needed.
  if (NUMBERLESS.has(lw) && (UPPER.test(w) || k === 0 || tokens[k - 1].w === ",") && hasName(tokens, k, true)) {
    const after = skipKm(tokens, nameEnd(tokens, k));
    const comma = tokens[after];
    const town = tokens[after + 1];
    if (comma && comma.w === "," && town && (isNameWord(town.w) || isPostalCode(town.w))) return { start: k, core: k, kind: "numberless" };
    if (strong && after > k + 1) return { start: k, core: k, kind: "numberless" };
  }

  // "75001 Paris" after a pin or a label: a postal code and a town, with nothing before.
  if (strong && isPostalCode(w) && tokens[k + 1] && isNameWord(tokens[k + 1].w)) return { start: k, core: k + 1, kind: "postal" };

  return null;
}

// ---------- Extending the address ----------

function acceptsAfterComma(tok) {
  return isNameWord(tok.w) || isPostalCode(tok.w) || isHouseNumber(tok.w) || isUkPostcodePart(tok.w);
}

// Takes the tokens that follow the core: the street name, then the postal code, the town, the region, the country.
// Returns the index of the last token that belongs to the address.
function extendFrom(tokens, anchor) {
  let last = anchor.core;
  let q = anchor.core + 1;

  if (anchor.kind === "typeFirst" || anchor.kind === "numberless") {
    const stop = nameEnd(tokens, anchor.core);
    if (stop > q) last = stop - 1;
    q = stop;
  }

  let guard = 0;
  let townWords = 0; // capitalised words in a row after a postal code ("Le Havre")
  while (tokens[q] && guard++ < 16) {
    const w = tokens[q].w;
    const b = bare(w);
    if (w === ";" || endsSentence(tokens[last].w)) break;
    if (w === ",") {
      const next = tokens[q + 1];
      if (!next || !acceptsAfterComma(next)) break;
      townWords = 0;
      q += 1;
      continue;
    }
    if (isPostalCode(b) || isUkPostcodePart(b)) {
      last = q;
      townWords = 0;
      q += 1;
      continue;
    }
    if (isNameWord(w) && townWords < 4) {
      last = q;
      townWords += 1;
      q += 1;
      continue;
    }
    if (isConnector(w) && townWords > 0 && tokens[q + 1] && isNameWord(tokens[q + 1].w) && q === last + 1) {
      last = q + 1; // "Boulogne sur Mer", "Aix en Provence"
      q += 2;
      continue;
    }
    if (LOCALITY_MARKERS.has(low(w)) && tokens[q + 1] && isNameWord(tokens[q + 1].w) && q === last + 1) {
      last = q + 1; // "12 rue des Martyrs à Paris"
      townWords = 1;
      q += 2;
      continue;
    }
    if (isHouseNumber(b) && !isPostalCode(b) && tokens[q - 1] && tokens[q - 1].w === ",") {
      last = q; // "Calle Cuchilleros, 17"
      q += 1;
      continue;
    }
    if (b.toLowerCase() === "km" && tokens[q + 1] && isHouseNumber(tokens[q + 1].w)) {
      last = q + 1; // "Route de l'Aéroport km 5"
      q += 2;
      continue;
    }
    break;
  }
  return last;
}

// ---------- The Japanese script ----------

const KANA_KANJI = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\u30fc";
const JP_UNITS = "丁目番地号の\\-‐－ー";
const JP_ADDRESS = new RegExp(`(?:〒\\s*\\d{3}[-‐－]?\\d{4}\\s*)?[${KANA_KANJI}]{1,8}[都道府県市区町村][${KANA_KANJI}\\d０-９${JP_UNITS}]*[\\d０-９][${KANA_KANJI}\\d０-９${JP_UNITS}]*`);
const CJK_TEST = /[぀-ヿ㐀-䶿一-鿿]/;

// ---------- Public: the address of a piece of text ----------

// { start, end, text, city, postal } or null. `strong`: the text follows a pin or an "Adresse :" label, which allows the
// weaker shapes (a bare "1-22-7" block, a postal code and a town).
export function findAddress(text, { strong = false } = {}) {
  const original = String(text || "");
  if (!original.trim()) return null;
  const s = blank(original);
  const tokens = tokenize(s);
  let found = null;
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k].w === "," || tokens[k].w === ";") continue;
    const anchor = anchorAt(tokens, k, strong);
    if (!anchor) continue;
    const last = extendFrom(tokens, anchor);
    found = { start: tokens[anchor.start].i, end: tokens[last].j };
    break;
  }
  const jp = JP_ADDRESS.exec(original);
  if (jp && (!found || jp.index < found.start)) found = { start: jp.index, end: jp.index + jp[0].length };
  if (!found) return null;

  let address = original.slice(found.start, found.end).replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
  address = address
    .replace(/\s+(?:à|a|in|en|dans|at)\s+(?=\p{Lu})/u, ", ") // "12 rue des Martyrs à Paris"
    .replace(/^(\d{1,4}(?:\s?(?:bis|ter))?),\s+/i, "$1 ") // "12, rue de la Paix"
    .replace(/[,.;:\s]+$/, "");
  return { start: found.start, end: found.end, text: address, ...cityOf(address) };
}

// The town of an address, and its postal code. "29 rue Sainte-Anne, 75001 Paris" -> Paris / 75001;
// "7 Carmine St, New York, NY 10014" -> New York; "Route de la Marina, Midoun, Djerba" -> Midoun.
export function cityOf(address) {
  const out = { city: null, postal: null };
  const a = String(address || "").replace(/^(\d{1,4}),\s+/, "$1 ");
  if (!a || CJK_TEST.test(a)) return out;
  const parts = a.split(",").map((p) => p.trim()).filter(Boolean);
  let first = 0;
  while (first < parts.length && /^\d+[a-z]?$/i.test(parts[first])) first += 1; // "12, rue X": the number alone is not the street
  const POSTAL = /(?:^|\s)(\d{4}-\d{3}|\d{3}-\d{4}|\d{4,5}|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})(?=\s|$)/;
  const town = (v) => {
    const t = String(v || "").replace(POSTAL, " ").replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 30 || hasDigit(t) || /^[A-Z]{2}$/.test(t)) return null;
    if (COUNTRIES.has(t.toLowerCase())) return null;
    if (TYPE_FIRST.has(t.split(" ")[0].toLowerCase())) return null; // another street, not a town
    return t;
  };

  // A part with a postal code: the town is beside it ("75001 Paris", "Tokyo 150-0041", "NY 10014" -> the part before).
  for (let i = parts.length - 1; i >= first; i--) {
    const m = POSTAL.exec(parts[i]);
    if (!m) continue;
    out.postal = m[1];
    const after = parts[i].slice(m.index + m[0].length).trim();
    const before = i === first ? "" : parts[i].slice(0, m.index).trim(); // in the street part, only what follows the code is a town
    out.city = town(after) || town(before) || (i - 1 > first ? town(parts[i - 1]) : null);
    if (out.city) return out;
    break;
  }
  // No postal code: the first part after the street that is a town.
  for (let i = first + 1; i < parts.length; i++) {
    const c = town(parts[i]);
    if (c) {
      out.city = c;
      return out;
    }
  }
  return out;
}

// ---------- Labels ----------

// "Adresse : …" — the label says what follows. `address`: the value is an address even if no street is recognised;
// `soft`: it is one only when a street is recognised ("Lieu : Fushimi Inari" is a name); `name`: the value is a name.
const LABELS = [
  ["address", /^(?:adresses?|address(?:es)?|adresse\s+compl[èe]te|localisation|coordonn[ée]es|emplacement|gps)\s*[:：=]\s*/i],
  ["soft", /^(?:lieu|o[ùu]|where|location|loc|situ[ée]e?|situation|plan|maps?|itin[ée]raire|direction|acc[èe]s|spot|endroit)\s*[:：=]\s*/i],
  ["name", /^(?:nom|name|resto|restaurant|h[ôo]tel|hotel|caf[ée]|le\s+lieu)\s*[:：=]\s*/i],
];

export function stripLabel(text) {
  const t = String(text || "").trim();
  for (const [kind, re] of LABELS) {
    const m = re.exec(t);
    if (m) return { kind, rest: t.slice(m[0].length).trim() };
  }
  return { kind: null, rest: t };
}

// ---------- Map links ----------

const MAPS_URL = /https?:\/\/(?:(?:www\.|maps\.|m\.)?google\.[a-z.]+\/maps[^\s<>"'`]*|maps\.google\.[a-z.]+[^\s<>"'`]*|maps\.app\.goo\.gl\/[^\s<>"'`]+|goo\.gl\/maps\/[^\s<>"'`]+|maps\.apple\.com\/[^\s<>"'`]*|(?:www\.)?waze\.com\/[^\s<>"'`]+|g\.co\/kgs\/[^\s<>"'`]+)/gi;

export function mapsUrlsIn(text) {
  const found = String(text || "").match(MAPS_URL) || [];
  return [...new Set(found.map((u) => u.replace(/[),.;:!?]+$/, "")))];
}

// A short link ("maps.app.goo.gl/…") says nothing by itself: it has to be followed to the real address.
export function isShortMapsUrl(url) {
  return /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(String(url || ""));
}

function decodePart(s) {
  try {
    return decodeURIComponent(String(s).replace(/\+/g, " ")).trim();
  } catch {
    return String(s).replace(/\+/g, " ").trim();
  }
}

function coords(a, b) {
  const lat = parseFloat(a);
  const lng = parseFloat(b);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null;
}

const PAIR = /^(?:loc:)?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;

// What a map link says: { name?, text?, lat?, lng? } or null.
//   .../maps/place/Ichiran+Shibuya/@35.66,139.70,17z   -> name + position
//   .../maps?q=48.85,2.35  or  ?ll=48.85,2.35           -> position
//   .../maps/search/?api=1&query=Chez+Moktar+Midoun     -> text (a name and/or an address, to be read like any text)
//   maps.apple.com/?q=Name&ll=lat,lng  and  waze.com/ul?ll=lat,lng&q=Name
export function parseMapsUrl(url) {
  const u = String(url || "");
  if (!/^https?:\/\//i.test(u)) return null;
  const host = ((/^https?:\/\/([^/?#]+)/i.exec(u) || [])[1] || "").toLowerCase();
  const isGoogle = /(^|\.)google\.[a-z.]+$/.test(host) || /(^|\.)goo\.gl$/.test(host);
  const isApple = host === "maps.apple.com";
  const isWaze = /(^|\.)waze\.com$/.test(host);
  if (!isGoogle && !isApple && !isWaze) return null;

  const [beforeQuery, afterQuery = ""] = u.split("#")[0].split("?");
  const query = {};
  afterQuery.split("&").forEach((kv) => {
    const eq = kv.indexOf("=");
    if (eq > 0) query[kv.slice(0, eq)] = decodePart(kv.slice(eq + 1));
  });

  let name = null;
  let text = null;
  let pos = null;

  // The exact position of the place first (!3d…!4d…), then the one of the view (@…), then ?ll=.
  const exact = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(u);
  const view = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(u);
  if (exact) pos = coords(exact[1], exact[2]);
  if (!pos && view) pos = coords(view[1], view[2]);
  for (const key of ["ll", "sll", "center"]) {
    const m = !pos && query[key] ? PAIR.exec(query[key]) : null;
    if (m) pos = coords(m[1], m[2]);
  }

  const place = /\/maps\/place\/([^/@?]+)/.exec(beforeQuery);
  if (place) name = decodePart(place[1]);

  const q = query.q || query.query || query.destination || query.daddr || query.address || null;
  if (q) {
    const m = PAIR.exec(q);
    if (m) {
      if (!pos) pos = coords(m[1], m[2]);
    } else {
      text = q;
    }
  }
  const search = /\/maps\/search\/([^/@?]+)/.exec(beforeQuery);
  if (!text && search) {
    const t = decodePart(search[1]);
    const m = PAIR.exec(t);
    if (m) {
      if (!pos) pos = coords(m[1], m[2]);
    } else {
      text = t;
    }
  }
  const dir = /\/maps\/dir\/(?:[^/@?]*\/)?([^/@?]+)/.exec(beforeQuery);
  if (!text && !name && dir) text = decodePart(dir[1]);
  if (isApple && query.name && !name) name = query.name;

  if (name && PAIR.test(name)) name = null;
  if (!name && !text && !pos) return null;
  return { name, text, ...(pos || {}) };
}

// The real address behind a redirect to a consent page: "https://consent.google.com/m?continue=<the map link>&…".
export function unwrapConsentUrl(url) {
  const m = /^https?:\/\/consent\.[a-z.]*google\.[a-z.]+\/[^?]*\?(?:[^#]*&)?continue=([^&#]+)/i.exec(String(url || ""));
  return m ? decodePart(m[1]) : url;
}
