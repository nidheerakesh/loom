// Numbers spoken in Malayalam, not read out as English digits by whatever voice happens to be
// installed. Every browser and server voice tested reads bare digit characters ("275", "₹350")
// in English regardless of the utterance's declared language — the voice speaks the SCRIPT it's
// given, and digits are just digits, not Malayalam text. So anything meant to be heard in
// Malayalam has its numbers converted to Malayalam number words first, before it ever reaches
// a speech engine (device or server).

const ONES = [
  "പൂജ്യം", "ഒന്ന്", "രണ്ട്", "മൂന്ന്", "നാല്", "അഞ്ച്", "ആറ്", "ഏഴ്", "എട്ട്", "ഒൻപത്",
  "പത്ത്", "പതിനൊന്ന്", "പന്ത്രണ്ട്", "പതിമൂന്ന്", "പതിനാല്", "പതിനഞ്ച്", "പതിനാറ്",
  "പതിനേഴ്", "പതിനെട്ട്", "പത്തൊൻപത്",
];
// Bare form (used when the tens digit is round, e.g. exactly 20) vs. the combining form a
// following digit actually attaches to (e.g. "ഇരുപത്തി" + "രണ്ട്" = "ഇരുപത്തിരണ്ട്", not the
// double-ത് that mechanically appending "ത്തി" to the bare form would produce).
const TENS_BARE: Record<number, string> = {
  2: "ഇരുപത്", 3: "മുപ്പത്", 4: "നാല്പത്", 5: "അമ്പത്",
  6: "അറുപത്", 7: "എഴുപത്", 8: "എൺപത്", 9: "തൊണ്ണൂറ്",
};
const TENS_COMBINE: Record<number, string> = {
  2: "ഇരുപത്തി", 3: "മുപ്പത്തി", 4: "നാല്പത്തി", 5: "അമ്പത്തി",
  6: "അറുപത്തി", 7: "എഴുപത്തി", 8: "എൺപത്തി", 9: "തൊണ്ണൂറ്റി",
};
// Hundreds are irregular in Malayalam (200 is "ഇരുനൂറ്", not a mechanical "two"+"hundred"), so
// looked up rather than composed — bare form for an exact multiple, combining form for when a
// remainder follows.
const HUNDRED_BARE: Record<number, string> = {
  1: "നൂറ്", 2: "ഇരുനൂറ്", 3: "മുന്നൂറ്", 4: "നാനൂറ്", 5: "അഞ്ഞൂറ്",
  6: "അറുനൂറ്", 7: "എഴുനൂറ്", 8: "എണ്ണൂറ്", 9: "തൊള്ളായിരം",
};
const HUNDRED_COMBINE: Record<number, string> = {
  1: "നൂറ്റി", 2: "ഇരുനൂറ്റി", 3: "മുന്നൂറ്റി", 4: "നാനൂറ്റി", 5: "അഞ്ഞൂറ്റി",
  6: "അറുനൂറ്റി", 7: "എഴുനൂറ്റി", 8: "എണ്ണൂറ്റി", 9: "തൊള്ളായിരത്തി",
};

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS_BARE[tens] : `${TENS_COMBINE[tens]}${ONES[ones]}`;
}

function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return rest === 0 ? HUNDRED_BARE[hundreds] : `${HUNDRED_COMBINE[hundreds]}${twoDigits(rest)}`;
}

// Indian grouping: crore (10,000,000) / lakh (100,000) / thousand — not the Western
// million/billion split — since that's how the numbers in this app (rates, prices) are
// actually meant to be heard.
export function numberToMalayalamWords(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n === 0) return ONES[0];
  if (n < 0) return `മൈനസ് ${numberToMalayalamWords(-n)}`;

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} കോടി`);
  if (lakh) parts.push(`${threeDigits(lakh)} ലക്ഷം`);
  if (thousand) parts.push(thousand === 1 ? "ആയിരം" : `${threeDigits(thousand)} ആയിരം`);
  if (rest) parts.push(threeDigits(rest));

  return parts.join(" ");
}

const NUMBER_RE = /\d+(\.\d+)?/g;

// Replaces every number in the text with its Malayalam words — integers as grouped words,
// decimals digit-by-digit after "പോയിന്റ്" (point), which is how a rate like "12.5" is
// actually spoken rather than as a single enormous word.
export function malayalamizeNumbers(text: string): string {
  return text.replace(NUMBER_RE, (match) => {
    if (match.includes(".")) {
      const [whole, frac] = match.split(".");
      const wholeWords = numberToMalayalamWords(Number(whole));
      const fracWords = frac.split("").map((d) => ONES[Number(d)]).join(" ");
      return `${wholeWords} പോയിന്റ് ${fracWords}`;
    }
    // Numbers this large are almost certainly an id fragment leaking into text, not a
    // quantity meant to be read aloud — spoken word-by-word instead of as one unwieldy figure.
    const value = Number(match);
    if (value > 99999999) return match.split("").map((d) => ONES[Number(d)]).join(" ");
    return numberToMalayalamWords(value);
  });
}
