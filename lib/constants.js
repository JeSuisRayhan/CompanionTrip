// Shared constants ported from the web version. Icons are referenced by NAME
// (Ionicons, bundled with Expo) instead of imported component references,
// since React Native icon libraries work differently from lucide-react.
import { THEME } from "./theme";

export const TYPES = {
  activite: { label: "Activité", icon: "location", color: THEME.teal, dim: THEME.tealDim },
  repas: { label: "Repas", icon: "restaurant", color: THEME.gold, dim: THEME.goldDim },
  hotel: { label: "Hôtel", icon: "bed", color: THEME.stamp, dim: THEME.stampDim },
  transport: { label: "Transport", icon: "airplane", color: THEME.blue, dim: THEME.blueDim },
};

export const STORAGE_KEY = "trips:all";

export const BUDGET_TYPES = ["transport", "hotel", "repas"];
export const CONFIRMATION_TYPES = ["transport", "hotel"];

export const TRANSPORT_MODES = [
  { key: "avion", label: "Avion" },
  { key: "train", label: "Train" },
  { key: "bus", label: "Bus" },
  { key: "voiture", label: "Voiture" },
  { key: "bateau", label: "Bateau" },
  { key: "autre", label: "Autre" },
];

export function transportModeLabel(key) {
  const m = TRANSPORT_MODES.find((t) => t.key === key);
  return m ? m.label : null;
}

export const TRANSPORT_REMINDER_MINUTES = 180;

export function transportDeparturePlace(mode) {
  if (mode === "avion") return "l'aéroport";
  if (mode === "train") return "la gare";
  if (mode === "bus") return "l'arrêt";
  if (mode === "bateau") return "le port";
  return "votre point de départ";
}

export function formatDurationMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export const DEFAULT_PACKING_LIST = [
  "Passeport / carte d'identité",
  "Chargeurs et adaptateur électrique",
  "Trousse de toilette",
  "Vêtements adaptés au climat",
  "Ordonnances / médicaments",
  "Batterie externe",
];

export const DEFAULT_DEPARTURE_CHECKLIST = [
  "Passeport valide",
  "Visa si nécessaire",
  "Assurance voyage",
  "Billets d'avion / train",
  "Réservations d'hôtel confirmées",
  "Carte bancaire activée à l'étranger",
];

export const TRIP_TYPES = [
  { key: "long", label: "Voyage long", icon: "briefcase" },
  { key: "short", label: "Court / Week-end", icon: "calendar" },
  { key: "park", label: "Parc d'attractions", icon: "sparkles" },
];

export const PACKING_TEMPLATES = {
  long: DEFAULT_PACKING_LIST,
  short: ["Vêtements de rechange", "Trousse de toilette", "Chargeur téléphone", "Carte d'identité", "Médicaments habituels"],
  park: ["Chaussures confortables", "Casquette / crème solaire", "Gourde", "Batterie externe", "Billets d'entrée / réservations", "Petit sac à dos"],
};

export const DEPARTURE_TEMPLATES = {
  long: DEFAULT_DEPARTURE_CHECKLIST,
  short: ["Réservations confirmées", "Itinéraire vérifié", "Animaux / plantes confiés si besoin"],
  park: ["Billets achetés", "Réservations fastpass / restaurant", "Horaires d'ouverture vérifiés"],
};

// Approximate value of 1 unit of the currency in EUR — starting point only,
// always shown as editable and clearly labeled as approximate.
export const CURRENCY_PRESETS = [
  { code: "EUR", label: "Euro (EUR)", eurRate: 1 },
  { code: "USD", label: "Dollar américain (USD)", eurRate: 0.92 },
  { code: "GBP", label: "Livre sterling (GBP)", eurRate: 1.17 },
  { code: "CHF", label: "Franc suisse (CHF)", eurRate: 1.05 },
  { code: "JPY", label: "Yen japonais (JPY)", eurRate: 0.0062 },
  { code: "CNY", label: "Yuan chinois (CNY)", eurRate: 0.13 },
  { code: "MAD", label: "Dirham marocain (MAD)", eurRate: 0.093 },
  { code: "TND", label: "Dinar tunisien (TND)", eurRate: 0.30 },
  { code: "EGP", label: "Livre égyptienne (EGP)", eurRate: 0.019 },
  { code: "TRY", label: "Livre turque (TRY)", eurRate: 0.028 },
  { code: "AED", label: "Dirham des Émirats (AED)", eurRate: 0.25 },
  { code: "SAR", label: "Riyal saoudien (SAR)", eurRate: 0.245 },
  { code: "THB", label: "Baht thaïlandais (THB)", eurRate: 0.026 },
  { code: "VND", label: "Dong vietnamien (VND)", eurRate: 0.000038 },
  { code: "IDR", label: "Roupie indonésienne (IDR)", eurRate: 0.000058 },
  { code: "INR", label: "Roupie indienne (INR)", eurRate: 0.011 },
  { code: "MXN", label: "Peso mexicain (MXN)", eurRate: 0.050 },
  { code: "BRL", label: "Réal brésilien (BRL)", eurRate: 0.16 },
  { code: "CAD", label: "Dollar canadien (CAD)", eurRate: 0.67 },
  { code: "AUD", label: "Dollar australien (AUD)", eurRate: 0.60 },
  { code: "ZAR", label: "Rand sud-africain (ZAR)", eurRate: 0.050 },
  { code: "KRW", label: "Won sud-coréen (KRW)", eurRate: 0.00068 },
  { code: "SGD", label: "Dollar de Singapour (SGD)", eurRate: 0.68 },
  { code: "PLN", label: "Zloty polonais (PLN)", eurRate: 0.23 },
  { code: "SEK", label: "Couronne suédoise (SEK)", eurRate: 0.087 },
  { code: "NOK", label: "Couronne norvégienne (NOK)", eurRate: 0.086 },
  { code: "DKK", label: "Couronne danoise (DKK)", eurRate: 0.134 },
];

export function suggestRate(localCode, homeCode) {
  const l = CURRENCY_PRESETS.find((c) => c.code === localCode);
  const h = CURRENCY_PRESETS.find((c) => c.code === homeCode);
  if (l && h && h.eurRate) return l.eurRate / h.eurRate;
  return null;
}
