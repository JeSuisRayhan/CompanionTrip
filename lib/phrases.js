// The phrases that save a trip, ready to add: the same fifteen, in the languages people of this app travel in.
// A translation is a string, or [text, reading] when the script is not the one we read (the reading is
// shown under the text). Pure data and functions, no storage.

export const PHRASE_LANGUAGES = [
  { key: "ja", label: "Japonais" },
  { key: "en", label: "Anglais" },
  { key: "es", label: "Espagnol" },
  { key: "it", label: "Italien" },
  { key: "pt", label: "Portugais (Portugal)" },
  { key: "de", label: "Allemand" },
  { key: "ko", label: "Coréen" },
  { key: "zh", label: "Chinois (mandarin)" },
  { key: "th", label: "Thaï" },
  { key: "tr", label: "Turc" },
];

// "english" is left out of English (null): asking an English speaker if they speak English makes no sense.
const BASE = [
  { fr: "Bonjour", tr: { ja: ["こんにちは", "konnichiwa"], en: "Hello", es: "Hola", it: "Buongiorno", pt: "Olá", de: "Guten Tag", ko: ["안녕하세요", "annyeonghaseyo"], zh: ["你好", "nǐ hǎo"], th: ["สวัสดีครับ/ค่ะ", "sawatdee khrap/kha"], tr: "Merhaba" } },
  { fr: "Merci", tr: { ja: ["ありがとうございます", "arigatō gozaimasu"], en: "Thank you", es: "Gracias", it: "Grazie", pt: "Obrigado / Obrigada", de: "Danke", ko: ["감사합니다", "gamsahamnida"], zh: ["谢谢", "xièxie"], th: ["ขอบคุณครับ/ค่ะ", "khop khun khrap/kha"], tr: "Teşekkür ederim" } },
  { fr: "S'il vous plaît", tr: { ja: ["お願いします", "onegai shimasu"], en: "Please", es: "Por favor", it: "Per favore", pt: "Por favor", de: "Bitte", ko: ["부탁합니다", "butakamnida"], zh: ["请", "qǐng"], th: ["ขอหน่อยครับ/ค่ะ", "kho noi khrap/kha"], tr: "Lütfen" } },
  { fr: "Excusez-moi", tr: { ja: ["すみません", "sumimasen"], en: "Excuse me", es: "Disculpe", it: "Mi scusi", pt: "Com licença", de: "Entschuldigung", ko: ["실례합니다", "sillyehamnida"], zh: ["不好意思", "bù hǎoyìsi"], th: ["ขอโทษครับ/ค่ะ", "kho thot khrap/kha"], tr: "Affedersiniz" } },
  { fr: "Je ne comprends pas", tr: { ja: ["わかりません", "wakarimasen"], en: "I don't understand", es: "No entiendo", it: "Non capisco", pt: "Não entendo", de: "Ich verstehe nicht", ko: ["이해가 안 돼요", "ihaega an dwaeyo"], zh: ["我听不懂", "wǒ tīng bu dǒng"], th: ["ไม่เข้าใจครับ/ค่ะ", "mai khao chai khrap/kha"], tr: "Anlamıyorum" } },
  { fr: "Parlez-vous anglais ?", tr: { ja: ["英語を話せますか？", "eigo o hanasemasu ka?"], en: null, es: "¿Habla inglés?", it: "Parla inglese?", pt: "Fala inglês?", de: "Sprechen Sie Englisch?", ko: ["영어 할 수 있어요?", "yeongeo hal su isseoyo?"], zh: ["你会说英语吗？", "nǐ huì shuō yīngyǔ ma?"], th: ["พูดภาษาอังกฤษได้ไหมครับ/คะ", "phut phasa angkrit dai mai khrap/kha"], tr: "İngilizce biliyor musunuz?" } },
  { fr: "Combien ça coûte ?", tr: { ja: ["いくらですか？", "ikura desu ka?"], en: "How much is it?", es: "¿Cuánto cuesta?", it: "Quanto costa?", pt: "Quanto custa?", de: "Was kostet das?", ko: ["얼마예요?", "eolmayeyo?"], zh: ["多少钱？", "duōshao qián?"], th: ["เท่าไหร่ครับ/คะ", "thao rai khrap/kha"], tr: "Bu ne kadar?" } },
  { fr: "L'addition, s'il vous plaît", tr: { ja: ["お会計をお願いします", "okaikei o onegai shimasu"], en: "Could we have the bill, please?", es: "La cuenta, por favor", it: "Il conto, per favore", pt: "A conta, por favor", de: "Die Rechnung, bitte", ko: ["계산해 주세요", "gyesanhae juseyo"], zh: ["请买单", "qǐng mǎidān"], th: ["เช็คบิลหน่อยครับ/ค่ะ", "chek bin noi khrap/kha"], tr: "Hesap, lütfen" } },
  { fr: "Où sont les toilettes ?", tr: { ja: ["トイレはどこですか？", "toire wa doko desu ka?"], en: "Where is the restroom?", es: "¿Dónde está el baño?", it: "Dov'è il bagno?", pt: "Onde fica a casa de banho?", de: "Wo ist die Toilette?", ko: ["화장실이 어디예요?", "hwajangsiri eodiyeyo?"], zh: ["厕所在哪里？", "cèsuǒ zài nǎlǐ?"], th: ["ห้องน้ำอยู่ที่ไหนครับ/คะ", "hong nam yu thi nai khrap/kha"], tr: "Tuvalet nerede?" } },
  { fr: "De l'eau, s'il vous plaît", tr: { ja: ["お水をください", "omizu o kudasai"], en: "Water, please", es: "Agua, por favor", it: "Acqua, per favore", pt: "Água, por favor", de: "Wasser, bitte", ko: ["물 주세요", "mul juseyo"], zh: ["请给我水", "qǐng gěi wǒ shuǐ"], th: ["ขอน้ำหน่อยครับ/ค่ะ", "kho nam noi khrap/kha"], tr: "Su, lütfen" } },
  { fr: "Pas trop épicé, s'il vous plaît", tr: { ja: ["辛くしないでください", "karaku shinaide kudasai"], en: "Not too spicy, please", es: "Poco picante, por favor", it: "Poco piccante, per favore", pt: "Pouco picante, por favor", de: "Nicht zu scharf, bitte", ko: ["안 맵게 해 주세요", "an maepge hae juseyo"], zh: ["请不要太辣", "qǐng bú yào tài là"], th: ["ไม่เผ็ดมากครับ/ค่ะ", "mai phet mak khrap/kha"], tr: "Çok acı olmasın, lütfen" } },
  { fr: "Où est la gare ?", tr: { ja: ["駅はどこですか？", "eki wa doko desu ka?"], en: "Where is the train station?", es: "¿Dónde está la estación de tren?", it: "Dov'è la stazione?", pt: "Onde fica a estação de comboio?", de: "Wo ist der Bahnhof?", ko: ["역이 어디예요?", "yeogi eodiyeyo?"], zh: ["火车站在哪里？", "huǒchēzhàn zài nǎlǐ?"], th: ["สถานีรถไฟอยู่ที่ไหนครับ/คะ", "sathani rot fai yu thi nai khrap/kha"], tr: "Tren istasyonu nerede?" } },
  { fr: "Pouvez-vous m'emmener à cette adresse ?", tr: { ja: ["この住所までお願いします", "kono jūsho made onegai shimasu"], en: "Can you take me to this address?", es: "¿Puede llevarme a esta dirección?", it: "Può portarmi a questo indirizzo?", pt: "Pode levar-me a esta morada?", de: "Können Sie mich zu dieser Adresse bringen?", ko: ["이 주소로 가 주세요", "i jusoro ga juseyo"], zh: ["请带我去这个地址", "qǐng dài wǒ qù zhège dìzhǐ"], th: ["ไปที่อยู่นี้หน่อยครับ/ค่ะ", "pai thi yu ni noi khrap/kha"], tr: "Beni bu adrese götürür müsünüz?" } },
  { fr: "Pouvez-vous m'aider ?", tr: { ja: ["助けてください", "tasukete kudasai"], en: "Can you help me?", es: "¿Puede ayudarme?", it: "Può aiutarmi?", pt: "Pode ajudar-me?", de: "Können Sie mir helfen?", ko: ["도와주세요", "dowajuseyo"], zh: ["请帮帮我", "qǐng bāngbang wǒ"], th: ["ช่วยด้วยครับ/ค่ะ", "chuay duay khrap/kha"], tr: "Yardım eder misiniz?" } },
  { fr: "Appelez un médecin, s'il vous plaît", tr: { ja: ["医者を呼んでください", "isha o yonde kudasai"], en: "Please call a doctor", es: "Llame a un médico, por favor", it: "Chiami un medico, per favore", pt: "Chame um médico, por favor", de: "Rufen Sie bitte einen Arzt", ko: ["의사를 불러 주세요", "uisareul bulleo juseyo"], zh: ["请叫医生", "qǐng jiào yīshēng"], th: ["ช่วยเรียกหมอหน่อยครับ/ค่ะ", "chuay riak mo noi khrap/kha"], tr: "Lütfen bir doktor çağırın" } },
];

export function languageLabel(key) {
  const l = PHRASE_LANGUAGES.find((x) => x.key === key);
  return l ? l.label : null;
}

// What a phrase of a trip looks like once added: { phrase (French), translation, reading? }.
// Phrases the language has no good version of are left out.
export function packFor(langKey) {
  if (!PHRASE_LANGUAGES.some((l) => l.key === langKey)) return [];
  const out = [];
  for (const p of BASE) {
    const t = p.tr[langKey];
    if (!t) continue;
    out.push(Array.isArray(t) ? { phrase: p.fr, translation: t[0], reading: t[1] } : { phrase: p.fr, translation: t });
  }
  return out;
}

// "Où est la gare ?" and "où est la gare?" are the same phrase.
export function samePhrase(a, b) {
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+([?!.,;:])/g, "$1").replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

// The pack for a language, without the phrases the trip already has.
export function missingFromPack(trip, langKey) {
  const have = (trip && trip.phrases) || [];
  return packFor(langKey).filter((p) => !have.some((h) => samePhrase(h.phrase, p.phrase)));
}
