// La fiche pays: the practical facts a traveller from France looks up before leaving (money, language, time,
// plugs, emergency numbers, tipping, water). General information that changes slowly, written by hand: the sheet
// says to check the official advice. The country of a trip is found from what is written in it, or chosen.
import { tripRange } from "./dates";

export const ADVICE_URL = "https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/conseils-par-pays-destination/";

// key, name, money (+ ISO code), lang (what is spoken) and phrases (the key of the ready-made phrases, or null),
// tz (an IANA zone) + utc (standard offset in hours, used when the phone cannot compute zones) + dst (summer time:
// "eu" like France, "none", or "other" rules) + multiTz,
// drive (side of the road), plug (types) + volts, emergency (null when not sure), tip, water, phone, aliases
// (written without accents, lower case: the country and its well-known places).
export const COUNTRIES = [
  { key: "JP", name: "Japon", dst: "none", currency: "JPY", money: "yen", lang: "japonais", phrases: "ja", tz: "Asia/Tokyo", utc: 9, drive: "gauche", plug: "A, B", volts: [100], emergency: "110 police · 119 pompiers et ambulance", tip: "Pas de pourboire : cela peut même mettre mal à l'aise.", water: "Potable au robinet.", phone: "+81",
    aliases: ["japon", "japan", "tokyo", "kyoto", "osaka", "nara", "hiroshima", "hokkaido", "sapporo", "okinawa", "nagoya", "yokohama", "fukuoka", "kobe", "nikko", "hakone", "kanazawa", "tokyo disneyland", "tokyo disneysea", "mont fuji", "takayama", "nagasaki", "kamakura", "miyajima", "naoshima"] },
  { key: "KR", name: "Corée du Sud", dst: "none", currency: "KRW", money: "won", lang: "coréen", phrases: "ko", tz: "Asia/Seoul", utc: 9, drive: "droite", plug: "C, F", volts: [220], emergency: "112 police · 119 pompiers et ambulance", tip: "Pas d'usage du pourboire.", water: "Potable au robinet (beaucoup de Coréens boivent de l'eau filtrée).", phone: "+82",
    aliases: ["coree", "coree du sud", "korea", "south korea", "seoul", "busan", "jeju", "incheon", "gyeongju"] },
  { key: "CN", name: "Chine", dst: "none", currency: "CNY", money: "yuan", lang: "chinois (mandarin)", phrases: "zh", tz: "Asia/Shanghai", utc: 8, drive: "droite", plug: "A, C, I", volts: [220], emergency: "110 police · 120 ambulance · 119 pompiers", tip: "Pas d'usage du pourboire.", water: "Non potable : eau en bouteille ou bouillie.", phone: "+86",
    aliases: ["chine", "china", "pekin", "beijing", "shanghai", "guangzhou", "shenzhen", "xi an", "xian", "chengdu", "hangzhou", "guilin", "yangshuo", "muraille de chine"] },
  { key: "TH", name: "Thaïlande", dst: "none", currency: "THB", money: "baht", lang: "thaï", phrases: "th", tz: "Asia/Bangkok", utc: 7, drive: "gauche", plug: "A, B, C, F, O", volts: [230], emergency: "191 police · 1669 urgences médicales · 1155 police du tourisme", tip: "Pas obligatoire : laisser la monnaie, ou 20 à 50 THB, fait plaisir.", water: "Non potable : eau en bouteille.", phone: "+66",
    aliases: ["thailande", "thailand", "bangkok", "phuket", "chiang mai", "krabi", "pattaya", "koh samui", "ko samui", "koh phi phi", "ayutthaya", "koh tao", "koh lanta"] },
  { key: "VN", name: "Vietnam", dst: "none", currency: "VND", money: "dông", lang: "vietnamien", phrases: null, tz: "Asia/Ho_Chi_Minh", utc: 7, drive: "droite", plug: "A, C", volts: [220], emergency: "113 police · 114 pompiers · 115 ambulance", tip: "Pas obligatoire, apprécié dans les restaurants fréquentés par les touristes.", water: "Non potable : eau en bouteille.", phone: "+84",
    aliases: ["vietnam", "viet nam", "hanoi", "ho chi minh", "saigon", "hoi an", "da nang", "ha long", "halong", "sapa", "nha trang", "dalat", "phu quoc"] },
  { key: "ID", name: "Indonésie", dst: "none", currency: "IDR", money: "roupie indonésienne", lang: "indonésien", phrases: null, tz: "Asia/Jakarta", utc: 7, multiTz: true, drive: "gauche", plug: "C, F", volts: [230], emergency: "112 (numéro d'urgence national)", tip: "Le service est parfois ajouté à l'addition ; sinon 5 à 10 % font plaisir.", water: "Non potable : eau en bouteille.", phone: "+62",
    aliases: ["indonesie", "indonesia", "bali", "jakarta", "ubud", "lombok", "yogyakarta", "komodo", "gili", "seminyak", "canggu", "nusa penida", "borobudur"] },
  { key: "SG", name: "Singapour", dst: "none", currency: "SGD", money: "dollar de Singapour", lang: "anglais (aussi chinois, malais, tamoul)", phrases: "en", tz: "Asia/Singapore", utc: 8, drive: "gauche", plug: "G", volts: [230], emergency: "999 police · 995 pompiers et ambulance", tip: "Pas de pourboire : le service est généralement compris.", water: "Potable au robinet.", phone: "+65",
    aliases: ["singapour", "singapore"] },
  { key: "MY", name: "Malaisie", dst: "none", currency: "MYR", money: "ringgit", lang: "malais (l'anglais est très répandu)", phrases: "en", tz: "Asia/Kuala_Lumpur", utc: 8, drive: "gauche", plug: "G", volts: [240], emergency: "999 (police, ambulance, pompiers) · 112 depuis un mobile", tip: "Pas obligatoire, le service est parfois compris.", water: "Mieux vaut boire de l'eau en bouteille.", phone: "+60",
    aliases: ["malaisie", "malaysia", "kuala lumpur", "penang", "langkawi", "kota kinabalu", "sabah", "sarawak", "malacca", "cameron highlands"] },
  { key: "PH", name: "Philippines", dst: "none", currency: "PHP", money: "peso philippin", lang: "filipino et anglais", phrases: "en", tz: "Asia/Manila", utc: 8, drive: "droite", plug: "A, B, C", volts: [220], emergency: "911 (numéro d'urgence national)", tip: "10 % font plaisir si le service n'est pas compris.", water: "Non potable : eau en bouteille.", phone: "+63",
    aliases: ["philippines", "manille", "manila", "cebu", "boracay", "palawan", "el nido", "siargao", "bohol", "coron"] },
  { key: "IN", name: "Inde", dst: "none", currency: "INR", money: "roupie indienne", lang: "hindi et anglais", phrases: "en", tz: "Asia/Kolkata", utc: 5.5, drive: "gauche", plug: "C, D, M", volts: [230], emergency: "112 (numéro d'urgence national)", tip: "10 % au restaurant si le service n'est pas compris ; un peu de monnaie pour les petits services.", water: "Non potable : eau en bouteille capsulée.", phone: "+91",
    aliases: ["inde", "india", "delhi", "new delhi", "mumbai", "bombay", "jaipur", "agra", "goa", "kerala", "udaipur", "varanasi", "benares", "bangalore", "rajasthan", "calcutta", "kolkata", "jodhpur", "taj mahal"] },
  { key: "TR", name: "Turquie", dst: "none", currency: "TRY", money: "livre turque", lang: "turc", phrases: "tr", tz: "Europe/Istanbul", utc: 3, drive: "droite", plug: "C, F", volts: [230], emergency: "112 (numéro unique)", tip: "Le service est parfois compris ; sinon 5 à 10 %.", water: "Mieux vaut boire de l'eau en bouteille.", phone: "+90",
    aliases: ["turquie", "turkey", "turkiye", "istanbul", "ankara", "cappadoce", "antalya", "izmir", "bodrum", "pamukkale", "ephese", "goreme", "fethiye"] },
  { key: "AE", name: "Émirats arabes unis", dst: "none", currency: "AED", money: "dirham des Émirats", lang: "arabe et anglais", phrases: "en", tz: "Asia/Dubai", utc: 4, drive: "droite", plug: "G", volts: [230], emergency: "999 police · 998 ambulance · 997 pompiers", tip: "10 % si le service n'est pas compris.", water: "Potable mais dessalée : beaucoup préfèrent l'eau en bouteille.", phone: "+971",
    aliases: ["emirats", "emirats arabes unis", "uae", "dubai", "abu dhabi", "abou dabi", "sharjah", "ras al khaimah"] },
  { key: "MA", name: "Maroc", dst: "other", currency: "MAD", money: "dirham marocain", lang: "arabe et français", phrases: null, tz: "Africa/Casablanca", utc: 1, drive: "droite", plug: "C, E", volts: [220], emergency: "19 police (en ville) · 177 gendarmerie · 15 pompiers et ambulance", tip: "Usage courant : environ 10 % au restaurant, quelques dirhams pour un petit service.", water: "Mieux vaut boire de l'eau en bouteille.", phone: "+212",
    aliases: ["maroc", "morocco", "marrakech", "casablanca", "fes", "rabat", "essaouira", "tanger", "agadir", "chefchaouen", "ouarzazate", "merzouga", "meknes"] },
  { key: "TN", name: "Tunisie", dst: "none", currency: "TND", money: "dinar tunisien", lang: "arabe et français", phrases: null, tz: "Africa/Tunis", utc: 1, drive: "droite", plug: "C, E", volts: [230], emergency: null, tip: "Usage courant : environ 10 % au restaurant.", water: "Mieux vaut boire de l'eau en bouteille.", phone: "+216",
    aliases: ["tunisie", "tunisia", "tunis", "djerba", "hammamet", "sousse", "sidi bou said", "carthage", "tozeur", "monastir"] },
  { key: "EG", name: "Égypte", dst: "other", currency: "EGP", money: "livre égyptienne", lang: "arabe", phrases: null, tz: "Africa/Cairo", utc: 2, drive: "droite", plug: "C, F", volts: [220], emergency: "122 police · 123 ambulance · 180 pompiers · 126 police du tourisme", tip: "Le bakchich est d'usage : de petites coupures pour chaque service, 10 à 15 % au restaurant.", water: "Non potable : eau en bouteille.", phone: "+20",
    aliases: ["egypte", "egypt", "le caire", "cairo", "louxor", "luxor", "assouan", "aswan", "hurghada", "charm el cheikh", "sharm el sheikh", "alexandrie", "gizeh", "giza", "marsa alam", "dahab"] },
  { key: "ZA", name: "Afrique du Sud", dst: "none", currency: "ZAR", money: "rand", lang: "anglais (onze langues officielles)", phrases: "en", tz: "Africa/Johannesburg", utc: 2, drive: "gauche", plug: "M, N", volts: [230], emergency: "10111 police · 10177 ambulance · 112 depuis un mobile", tip: "10 à 15 % au restaurant : le service n'est pas compris.", water: "Potable dans la plupart des villes.", phone: "+27",
    aliases: ["afrique du sud", "south africa", "le cap", "cape town", "johannesburg", "kruger", "durban", "pretoria", "stellenbosch", "route des jardins"] },
  { key: "US", name: "États-Unis", dst: "other", currency: "USD", money: "dollar américain", lang: "anglais", phrases: "en", tz: "America/New_York", utc: -5, multiTz: true, drive: "droite", plug: "A, B", volts: [120], emergency: "911", tip: "15 à 20 % au restaurant et pour la plupart des services : le pourboire n'est jamais compris.", water: "Potable au robinet.", phone: "+1",
    aliases: ["etats unis", "usa", "united states", "new york", "los angeles", "san francisco", "las vegas", "miami", "chicago", "floride", "californie", "hawai", "hawaii", "washington", "boston", "orlando", "seattle", "nashville", "new orleans", "la nouvelle orleans", "san diego", "texas", "yellowstone", "grand canyon", "disneyland california", "walt disney world", "route 66", "alaska", "new mexico", "arizona", "colorado", "utah", "portland", "denver", "atlanta", "philadelphie", "philadelphia", "dallas", "houston", "austin"] },
  { key: "CA", name: "Canada", dst: "other", currency: "CAD", money: "dollar canadien", lang: "anglais et français", phrases: "en", tz: "America/Toronto", utc: -5, multiTz: true, drive: "droite", plug: "A, B", volts: [120], emergency: "911", tip: "15 à 20 % au restaurant : le service n'est pas compris.", water: "Potable au robinet.", phone: "+1",
    aliases: ["canada", "montreal", "quebec", "toronto", "vancouver", "ottawa", "banff", "calgary", "niagara", "whistler", "jasper", "tadoussac"] },
  { key: "MX", name: "Mexique", dst: "none", currency: "MXN", money: "peso mexicain", lang: "espagnol", phrases: "es", tz: "America/Mexico_City", utc: -6, multiTz: true, drive: "droite", plug: "A, B", volts: [127], emergency: "911", tip: "10 à 15 % au restaurant : le service n'est pas compris.", water: "Non potable : eau en bouteille.", phone: "+52",
    aliases: ["mexique", "mexico", "cancun", "tulum", "playa del carmen", "oaxaca", "yucatan", "guadalajara", "chichen itza", "puerto vallarta", "los cabos", "san miguel de allende", "merida", "chiapas"] },
  { key: "BR", name: "Brésil", dst: "none", currency: "BRL", money: "real", lang: "portugais (Brésil)", phrases: null, tz: "America/Sao_Paulo", utc: -3, multiTz: true, drive: "droite", plug: "N", volts: [127, 220], emergency: "190 police · 192 ambulance · 193 pompiers", tip: "10 % le plus souvent déjà ajoutés à l'addition (« serviço »).", water: "Non potable : eau en bouteille ou filtrée.", phone: "+55",
    aliases: ["bresil", "brazil", "rio", "rio de janeiro", "sao paulo", "salvador de bahia", "iguazu", "foz do iguacu", "fortaleza", "brasilia", "recife", "florianopolis", "amazonie", "lencois maranhenses"] },
  { key: "AR", name: "Argentine", dst: "none", currency: "ARS", money: "peso argentin", lang: "espagnol", phrases: "es", tz: "America/Argentina/Buenos_Aires", utc: -3, drive: "droite", plug: "C, I", volts: [220], emergency: null, tip: "Environ 10 % au restaurant : le service n'est pas compris.", water: "Potable dans les grandes villes.", phone: "+54",
    aliases: ["argentine", "argentina", "buenos aires", "patagonie", "patagonia", "mendoza", "ushuaia", "el calafate", "bariloche", "perito moreno", "cordoba argentine"] },
  { key: "PE", name: "Pérou", dst: "none", currency: "PEN", money: "sol", lang: "espagnol", phrases: "es", tz: "America/Lima", utc: -5, drive: "droite", plug: "A, B, C", volts: [220], emergency: null, tip: "Environ 10 % au restaurant si le service n'est pas compris.", water: "Non potable : eau en bouteille.", phone: "+51",
    aliases: ["perou", "peru", "lima", "cusco", "cuzco", "machu picchu", "arequipa", "lac titicaca", "vallee sacree", "ollantaytambo", "huacachina"] },
  { key: "GB", name: "Royaume-Uni", dst: "eu", currency: "GBP", money: "livre sterling", lang: "anglais", phrases: "en", tz: "Europe/London", utc: 0, drive: "gauche", plug: "G", volts: [230], emergency: "999 ou 112", tip: "Le service est souvent compris (regardez l'addition) ; sinon 10 à 12,5 %.", water: "Potable au robinet.", phone: "+44",
    aliases: ["royaume uni", "uk", "united kingdom", "angleterre", "england", "londres", "london", "ecosse", "scotland", "edimbourg", "edinburgh", "pays de galles", "wales", "manchester", "liverpool", "cornouailles", "cornwall", "oxford", "cambridge", "highlands", "glasgow", "belfast", "irlande du nord"] },
  { key: "IE", name: "Irlande", dst: "eu", currency: "EUR", money: "euro", lang: "anglais (et irlandais)", phrases: "en", tz: "Europe/Dublin", utc: 0, drive: "gauche", plug: "G", volts: [230], emergency: "112 ou 999", tip: "10 % si le service n'est pas compris ; facultatif au pub.", water: "Potable au robinet.", phone: "+353",
    aliases: ["irlande", "ireland", "dublin", "galway", "cork", "connemara", "falaises de moher", "dingle", "limerick"] },
  { key: "ES", name: "Espagne", dst: "eu", currency: "EUR", money: "euro", lang: "espagnol", phrases: "es", tz: "Europe/Madrid", utc: 1, drive: "droite", plug: "C, F", volts: [230], emergency: "112", tip: "Facultatif : arrondir ou laisser quelques euros.", water: "Potable au robinet.", phone: "+34",
    aliases: ["espagne", "spain", "madrid", "barcelone", "barcelona", "seville", "sevilla", "valencia", "majorque", "mallorca", "ibiza", "grenade", "granada", "malaga", "andalousie", "canaries", "tenerife", "bilbao", "saint sebastien", "san sebastian", "cordoue", "tolede", "minorque", "formentera"] },
  { key: "PT", name: "Portugal", dst: "eu", currency: "EUR", money: "euro", lang: "portugais", phrases: "pt", tz: "Europe/Lisbon", utc: 0, drive: "droite", plug: "C, F", volts: [230], emergency: "112", tip: "Facultatif : environ 5 à 10 % si le service vous a plu.", water: "Potable au robinet.", phone: "+351",
    aliases: ["portugal", "lisbonne", "lisbon", "lisboa", "porto", "algarve", "madere", "madeira", "acores", "azores", "sintra", "faro", "lagos", "coimbra", "evora"] },
  { key: "IT", name: "Italie", dst: "eu", currency: "EUR", money: "euro", lang: "italien", phrases: "it", tz: "Europe/Rome", utc: 1, drive: "droite", plug: "C, F, L", volts: [230], emergency: "112", tip: "Facultatif (le « coperto » est un couvert, pas un pourboire) : arrondir suffit.", water: "Potable au robinet.", phone: "+39",
    aliases: ["italie", "italy", "rome", "roma", "venise", "venezia", "florence", "firenze", "milan", "milano", "naples", "napoli", "toscane", "sicile", "sardaigne", "cinque terre", "amalfi", "capri", "turin", "bologne", "verone", "pise", "lac de come", "dolomites", "pompei", "sienne"] },
  { key: "DE", name: "Allemagne", dst: "eu", currency: "EUR", money: "euro", lang: "allemand", phrases: "de", tz: "Europe/Berlin", utc: 1, drive: "droite", plug: "C, F", volts: [230], emergency: "112 · 110 police", tip: "Arrondir ou laisser 5 à 10 % ; on annonce le montant total en payant.", water: "Potable au robinet.", phone: "+49",
    aliases: ["allemagne", "germany", "berlin", "munich", "hambourg", "hamburg", "francfort", "frankfurt", "cologne", "dresde", "baviere", "heidelberg", "stuttgart", "dusseldorf", "nuremberg", "europa park", "foret noire", "neuschwanstein", "leipzig"] },
  { key: "NL", name: "Pays-Bas", dst: "eu", currency: "EUR", money: "euro", lang: "néerlandais", phrases: null, tz: "Europe/Amsterdam", utc: 1, drive: "droite", plug: "C, F", volts: [230], emergency: "112", tip: "Facultatif : arrondir ou 5 à 10 %.", water: "Potable au robinet.", phone: "+31",
    aliases: ["pays bas", "netherlands", "hollande", "amsterdam", "rotterdam", "la haye", "utrecht", "keukenhof", "delft", "haarlem"] },
  { key: "BE", name: "Belgique", dst: "eu", currency: "EUR", money: "euro", lang: "français, néerlandais et allemand", phrases: null, tz: "Europe/Brussels", utc: 1, drive: "droite", plug: "C, E", volts: [230], emergency: "112", tip: "Service compris : arrondir si vous le souhaitez.", water: "Potable au robinet.", phone: "+32",
    aliases: ["belgique", "belgium", "bruxelles", "brussels", "bruges", "gand", "anvers", "liege", "namur", "dinant", "ostende"] },
  { key: "CH", name: "Suisse", dst: "eu", currency: "CHF", money: "franc suisse", lang: "français, allemand et italien", phrases: null, tz: "Europe/Zurich", utc: 1, drive: "droite", plug: "C, J", volts: [230], emergency: "112 · 117 police · 144 ambulance · 118 pompiers", tip: "Service compris : arrondir si vous le souhaitez.", water: "Potable au robinet.", phone: "+41",
    aliases: ["suisse", "switzerland", "geneve", "zurich", "berne", "lausanne", "zermatt", "lucerne", "interlaken", "bale", "lugano", "montreux", "jungfrau"] },
  { key: "GR", name: "Grèce", dst: "eu", currency: "EUR", money: "euro", lang: "grec", phrases: null, tz: "Europe/Athens", utc: 2, drive: "droite", plug: "C, F", volts: [230], emergency: "112 · 100 police · 166 ambulance · 199 pompiers", tip: "Arrondir ou laisser 5 à 10 %.", water: "Potable à beaucoup d'endroits ; sur les îles, l'eau en bouteille est la norme.", phone: "+30",
    aliases: ["grece", "greece", "athenes", "athens", "santorin", "santorini", "crete", "mykonos", "rhodes", "corfou", "naxos", "milos", "delphes", "thessalonique", "meteores", "paros"] },
  { key: "HR", name: "Croatie", dst: "eu", currency: "EUR", money: "euro", lang: "croate", phrases: null, tz: "Europe/Zagreb", utc: 1, drive: "droite", plug: "C, F", volts: [230], emergency: "112", tip: "Arrondir ou laisser 10 % au restaurant.", water: "Potable au robinet.", phone: "+385",
    aliases: ["croatie", "croatia", "dubrovnik", "zagreb", "hvar", "plitvice", "zadar", "istrie", "korcula"] },
  { key: "IS", name: "Islande", dst: "none", currency: "ISK", money: "couronne islandaise", lang: "islandais (l'anglais est très répandu)", phrases: null, tz: "Atlantic/Reykjavik", utc: 0, drive: "droite", plug: "C, F", volts: [230], emergency: "112", tip: "Pas d'usage du pourboire : le service est compris.", water: "Potable au robinet.", phone: "+354",
    aliases: ["islande", "iceland", "reykjavik", "blue lagoon", "jokulsarlon", "golden circle", "cercle d or", "akureyri"] },
  { key: "AU", name: "Australie", dst: "other", currency: "AUD", money: "dollar australien", lang: "anglais", phrases: "en", tz: "Australia/Sydney", utc: 10, multiTz: true, drive: "gauche", plug: "I", volts: [230], emergency: "000 (112 depuis un mobile)", tip: "Pas d'usage : facultatif, 10 % pour un service remarquable.", water: "Potable au robinet.", phone: "+61",
    aliases: ["australie", "australia", "sydney", "melbourne", "brisbane", "perth", "cairns", "uluru", "great barrier reef", "grande barriere de corail", "tasmanie", "adelaide", "gold coast", "darwin", "great ocean road"] },
  { key: "NZ", name: "Nouvelle-Zélande", dst: "other", currency: "NZD", money: "dollar néo-zélandais", lang: "anglais (et maori)", phrases: "en", tz: "Pacific/Auckland", utc: 12, drive: "gauche", plug: "I", volts: [230], emergency: "111", tip: "Pas d'usage du pourboire.", water: "Potable au robinet.", phone: "+64",
    aliases: ["nouvelle zelande", "new zealand", "auckland", "queenstown", "wellington", "rotorua", "christchurch", "milford sound", "fiordland"] },
];

// "Cancún", "Saint-Sébastien" -> "cancun", "saint sebastien": lower case, no accents, words separated by one space.
const ACCENTS = { à: "a", á: "a", â: "a", ä: "a", ã: "a", å: "a", ç: "c", è: "e", é: "e", ê: "e", ë: "e", ì: "i", í: "i", î: "i", ï: "i", ñ: "n", ò: "o", ó: "o", ô: "o", ö: "o", õ: "o", ù: "u", ú: "u", û: "u", ü: "u", ÿ: "y", œ: "oe", æ: "ae", ō: "o", ū: "u", ā: "a", ī: "i", ē: "e", ı: "i", ş: "s", ğ: "g" };
export function plain(text) {
  return String(text == null ? "" : text)
    .toLowerCase()
    .replace(/[^\u0000-\u007f]/g, (c) => ACCENTS[c] || " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function countryByKey(key) {
  return COUNTRIES.find((c) => c.key === key) || null;
}

// Whether the words of a text name a country: the number of words of the most specific alias found as whole words
// (0 when none): "new mexico" (2) outweighs "mexico" (1).
function mentions(text, country) {
  const pool = ` ${plain(text)} `;
  if (pool.trim() === "") return 0;
  let best = 0;
  for (const a of country.aliases) if (pool.includes(` ${a} `)) best = Math.max(best, a.split(" ").length);
  return best;
}

// The country of a trip: the one chosen (trip.country), else the one its name, places, days and addresses talk
// about most, else the one whose money the trip uses (when only one does). null when it cannot tell.
export function detectCountry(trip) {
  if (!trip) return null;
  const chosen = countryByKey(trip.country);
  if (chosen) return chosen;
  const fields = [];
  fields.push([trip.name, 3], [trip.defaultLocation, 3]);
  for (const day of trip.days || []) {
    fields.push([day.location, 2], [day.title, 1]);
    for (const a of day.activities || []) fields.push([a.address, 1], [a.title, 1]);
  }
  for (const idea of trip.ideas || []) fields.push([idea.address, 1], [idea.name, 1]);
  let best = null;
  let bestScore = 0;
  for (const c of COUNTRIES) {
    let score = 0;
    for (const [text, weight] of fields) if (text) score += weight * mentions(text, c);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  if (best) return best;
  const code = String(trip.currency || "").toUpperCase();
  const byMoney = COUNTRIES.filter((c) => c.currency === code);
  // the euro is the money of many countries, the dollar of one for us: only a single answer counts
  return byMoney.length === 1 ? byMoney[0] : code === "USD" ? countryByKey("US") : null;
}

// ---------- Time ----------
const FRANCE_TZ = "Europe/Paris";

function offsetMinutes(tz, date) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// France in summer time between the last Sunday of March and the last Sunday of October (UTC 01:00).
function franceOffsetMinutes(date) {
  const y = date.getUTCFullYear();
  const lastSunday = (month) => {
    const d = new Date(Date.UTC(y, month + 1, 0, 1));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.getTime();
  };
  return date.getTime() >= lastSunday(2) && date.getTime() < lastSunday(9) ? 120 : 60;
}

// How far the country's clock is from France's at `date`: { minutes (country minus France), approx }.
// Zones come from the phone; without them the standard offset of the country is used, with the summer time of
// Europe for the countries that follow it (approx: the summer time of the other countries is not known).
export function timeDifference(country, date = new Date(), { forceFallback = false } = {}) {
  if (!forceFallback) {
    try {
      const minutes = offsetMinutes(country.tz, date) - offsetMinutes(FRANCE_TZ, date);
      if (Number.isFinite(minutes) && Math.abs(minutes) <= 24 * 60) return { minutes, approx: false };
    } catch (e) {
      // no Intl on this phone: the fallback below
    }
  }
  const france = franceOffsetMinutes(date);
  const own = Math.round(country.utc * 60) + (country.dst === "eu" && france === 120 ? 60 : 0);
  return { minutes: own - france, approx: country.dst === "other" };
}

export function timeDifferenceText(diff, country) {
  const m = Math.abs(diff.minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  const amount = `${h} h${r ? ` ${String(r).padStart(2, "0")}` : ""}`;
  let text = m === 0 ? "Même heure qu'en France" : `${amount} ${diff.minutes > 0 ? "de plus" : "de moins"} qu'en France`;
  if (diff.approx && m !== 0) text = `Environ ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  if (country && country.multiTz) text += " (fuseau de la ville principale : le pays en compte plusieurs)";
  return text;
}

// The date the difference is worked out for: the start of the trip (summer time or not), else today.
export function timeDifferenceDate(trip, today = new Date()) {
  const start = trip ? tripRange(trip).start : null;
  return start ? new Date(start + "T12:00:00Z") : today;
}

// ---------- Plugs ----------
// A French plug (type E) goes into the sockets of types C, E and F; the others need an adapter.
export function plugAdvice(country) {
  const types = country.plug.split(",").map((s) => s.trim());
  const fits = types.some((t) => t === "C" || t === "E" || t === "F");
  const high = Math.max(...country.volts) >= 200;
  const parts = [fits ? "Vos fiches françaises passent en général, sans adaptateur." : "Prévoyez un adaptateur."];
  if (!high) parts.push("Tension plus faible qu'en France : la plupart des chargeurs de téléphone et d'ordinateur acceptent 100 à 240 V, vérifiez l'étiquette.");
  return { fits, high, text: parts.join(" ") };
}

export function plugText(country) {
  return `Type${country.plug.includes(",") ? "s" : ""} ${country.plug} · ${country.volts.join(" ou ")} V`;
}

// The facts of the sheet, in the order shown: [{ key, icon, label, value, note? }].
export function countryFacts(country, trip, today = new Date()) {
  const diff = timeDifference(country, timeDifferenceDate(trip, today));
  const plug = plugAdvice(country);
  const facts = [
    { key: "money", icon: "cash-outline", label: "Monnaie", value: `${country.money} (${country.currency})` },
    { key: "lang", icon: "language-outline", label: "Langue", value: country.lang },
    { key: "time", icon: "time-outline", label: "Décalage horaire", value: timeDifferenceText(diff, country) },
    { key: "plug", icon: "flash-outline", label: "Prises électriques", value: plugText(country), note: plug.text },
    { key: "drive", icon: "car-outline", label: "Conduite", value: `À ${country.drive}` },
  ];
  if (country.emergency) facts.push({ key: "emergency", icon: "call-outline", label: "Urgences", value: country.emergency });
  facts.push({ key: "tip", icon: "restaurant-outline", label: "Pourboire", value: country.tip });
  facts.push({ key: "water", icon: "water-outline", label: "Eau du robinet", value: country.water });
  facts.push({ key: "phone", icon: "keypad-outline", label: "Indicatif téléphonique", value: country.phone });
  return facts;
}
