// Demo content for `npm run seed`. Kept separate from seed.ts so the narrative data is
// editable without touching the insert logic.
//
// The setting is Ernakulam district Kudumbashree / SHG units: most providers are individual
// women working from home (capacity 1), the rest are small shared units (capacity 3-5) that
// take group orders. Names, shop names and rating comments are written to look like real
// listings — the previous "Provider 1 / Shop 1" placeholders made every demo screenshot look
// like unfinished scaffolding.

export type DemoProvider = {
  name: string;
  shopName: string | null;
  skills: string[];
  capacity: number;
  rate: number;
  rateUnit: string;
  deliveryDays: number;
  experienceYears: number;
};

// 40 providers. Skill pairs are spread so every skill has depth for the matching demo, and
// capacities are mixed so team assembly has both solo workers and units to draw from.
export const PROVIDERS: DemoProvider[] = [
  { name: "Lakshmi Menon", shopName: null, skills: ["stitching", "cutting"], capacity: 1, rate: 300, rateUnit: "piece", deliveryDays: 2, experienceYears: 12 },
  { name: "Sujatha Pillai", shopName: null, skills: ["stitching"], capacity: 1, rate: 280, rateUnit: "piece", deliveryDays: 2, experienceYears: 8 },
  { name: "Bindu Raveendran", shopName: "Thanima Stitching Centre", skills: ["stitching", "cutting"], capacity: 4, rate: 350, rateUnit: "piece", deliveryDays: 3, experienceYears: 15 },
  { name: "Remya Suresh", shopName: null, skills: ["stitching", "packaging"], capacity: 1, rate: 260, rateUnit: "piece", deliveryDays: 2, experienceYears: 5 },
  { name: "Fathima Beevi", shopName: null, skills: ["cutting"], capacity: 1, rate: 220, rateUnit: "piece", deliveryDays: 1, experienceYears: 9 },
  { name: "Sheeba Thomas", shopName: "Vanitha Tailors", skills: ["stitching", "cutting"], capacity: 5, rate: 400, rateUnit: "piece", deliveryDays: 3, experienceYears: 18 },
  { name: "Girija Amma", shopName: null, skills: ["stitching", "craft"], capacity: 1, rate: 320, rateUnit: "piece", deliveryDays: 3, experienceYears: 22 },
  { name: "Molly Joseph", shopName: null, skills: ["cooking"], capacity: 1, rate: 180, rateUnit: "plate", deliveryDays: 1, experienceYears: 11 },
  { name: "Rajani Kumari", shopName: "Ruchi Kitchen", skills: ["cooking", "packaging"], capacity: 5, rate: 220, rateUnit: "plate", deliveryDays: 1, experienceYears: 14 },
  { name: "Shyamala Devi", shopName: null, skills: ["craft"], capacity: 1, rate: 150, rateUnit: "piece", deliveryDays: 4, experienceYears: 7 },
  { name: "Preetha Nair", shopName: null, skills: ["stitching", "cutting"], capacity: 1, rate: 290, rateUnit: "piece", deliveryDays: 2, experienceYears: 6 },
  { name: "Jaya Krishnan", shopName: "Snehitha Craft Unit", skills: ["craft", "packaging"], capacity: 4, rate: 190, rateUnit: "piece", deliveryDays: 4, experienceYears: 10 },
  { name: "Beena Varghese", shopName: null, skills: ["stitching"], capacity: 1, rate: 270, rateUnit: "piece", deliveryDays: 2, experienceYears: 4 },
  { name: "Anitha Rajan", shopName: null, skills: ["tutoring"], capacity: 1, rate: 400, rateUnit: "hour", deliveryDays: 1, experienceYears: 9 },
  { name: "Sindhu Mohan", shopName: null, skills: ["cutting", "packaging"], capacity: 1, rate: 210, rateUnit: "piece", deliveryDays: 2, experienceYears: 5 },
  { name: "Latha Gopalan", shopName: "Kudumbashree Tailoring Unit", skills: ["stitching", "cutting"], capacity: 5, rate: 380, rateUnit: "piece", deliveryDays: 3, experienceYears: 20 },
  { name: "Usha Balakrishnan", shopName: null, skills: ["cooking"], capacity: 1, rate: 200, rateUnit: "plate", deliveryDays: 1, experienceYears: 16 },
  { name: "Deepa Anil", shopName: null, skills: ["stitching", "craft"], capacity: 1, rate: 310, rateUnit: "piece", deliveryDays: 3, experienceYears: 7 },
  { name: "Nisha Salim", shopName: null, skills: ["packaging"], capacity: 1, rate: 120, rateUnit: "piece", deliveryDays: 1, experienceYears: 3 },
  { name: "Mercy Sebastian", shopName: "Ponnu Tailoring", skills: ["stitching", "packaging"], capacity: 3, rate: 340, rateUnit: "piece", deliveryDays: 2, experienceYears: 13 },
  { name: "Sarala Devi", shopName: null, skills: ["craft", "packaging"], capacity: 1, rate: 160, rateUnit: "piece", deliveryDays: 4, experienceYears: 19 },
  { name: "Vidya Prakash", shopName: null, skills: ["tutoring"], capacity: 1, rate: 350, rateUnit: "hour", deliveryDays: 1, experienceYears: 6 },
  { name: "Reena Kurian", shopName: null, skills: ["stitching", "cutting"], capacity: 1, rate: 300, rateUnit: "piece", deliveryDays: 2, experienceYears: 10 },
  { name: "Soumya Ravi", shopName: "Kaithari Handloom Unit", skills: ["craft", "stitching"], capacity: 5, rate: 420, rateUnit: "piece", deliveryDays: 5, experienceYears: 17 },
  { name: "Asha Vijayan", shopName: null, skills: ["cooking", "packaging"], capacity: 1, rate: 190, rateUnit: "plate", deliveryDays: 1, experienceYears: 8 },
  { name: "Geetha Madhavan", shopName: null, skills: ["cutting"], capacity: 1, rate: 230, rateUnit: "piece", deliveryDays: 2, experienceYears: 12 },
  { name: "Prasanna Kumari", shopName: null, skills: ["stitching"], capacity: 1, rate: 285, rateUnit: "piece", deliveryDays: 2, experienceYears: 9 },
  { name: "Valsala Nair", shopName: "Karuna Catering", skills: ["cooking"], capacity: 4, rate: 240, rateUnit: "plate", deliveryDays: 2, experienceYears: 21 },
  { name: "Leela Chandran", shopName: null, skills: ["craft"], capacity: 1, rate: 175, rateUnit: "piece", deliveryDays: 3, experienceYears: 14 },
  { name: "Shanti Kumari", shopName: null, skills: ["stitching", "packaging"], capacity: 1, rate: 275, rateUnit: "piece", deliveryDays: 2, experienceYears: 6 },
  { name: "Radha Unnikrishnan", shopName: null, skills: ["cutting", "stitching"], capacity: 1, rate: 295, rateUnit: "piece", deliveryDays: 2, experienceYears: 11 },
  { name: "Omana Thankappan", shopName: null, skills: ["cooking"], capacity: 1, rate: 210, rateUnit: "plate", deliveryDays: 1, experienceYears: 24 },
  { name: "Elsy Mathew", shopName: "Ammu's Boutique", skills: ["stitching", "craft"], capacity: 4, rate: 450, rateUnit: "piece", deliveryDays: 4, experienceYears: 16 },
  { name: "Rosily Antony", shopName: null, skills: ["packaging"], capacity: 1, rate: 130, rateUnit: "piece", deliveryDays: 1, experienceYears: 4 },
  { name: "Sania Rasheed", shopName: null, skills: ["tutoring", "craft"], capacity: 1, rate: 380, rateUnit: "hour", deliveryDays: 1, experienceYears: 5 },
  { name: "Divya Sasidharan", shopName: null, skills: ["stitching", "cutting"], capacity: 1, rate: 305, rateUnit: "piece", deliveryDays: 3, experienceYears: 8 },
  { name: "Manju Prabhakaran", shopName: null, skills: ["craft", "packaging"], capacity: 1, rate: 165, rateUnit: "piece", deliveryDays: 3, experienceYears: 7 },
  { name: "Sumangala Pillai", shopName: "Vismaya Crafts", skills: ["craft", "packaging"], capacity: 3, rate: 200, rateUnit: "piece", deliveryDays: 4, experienceYears: 18 },
  { name: "Thankam Velayudhan", shopName: null, skills: ["cooking", "craft"], capacity: 1, rate: 195, rateUnit: "plate", deliveryDays: 2, experienceYears: 26 },
  { name: "Anju Haridas", shopName: null, skills: ["stitching", "cutting"], capacity: 1, rate: 265, rateUnit: "piece", deliveryDays: 2, experienceYears: 3 },
];

// Portfolio captions, attached to the first N providers so the profile screen has content.
export const PORTFOLIO_CAPTIONS: string[] = [
  "School uniform sets — 30 pieces, delivered in 4 days",
  "Kasavu blouse with hand-finished neckline",
  "Churidar with contrast piping",
  "Cotton saree blouse, princess cut",
  "Onam sadya for 50 — full spread",
  "Jute shopping bags, screen printed",
  "Bridal blouse with aari work",
  "Children's uniform shorts, bulk order",
];

// Rating comments. Mixed Malayalam and English on purpose — that is how the reviews would
// actually read, and it exercises the Malayalam rendering path in the UI.
export const RATING_COMMENTS: { stars: number; comment: string }[] = [
  { stars: 5, comment: "നല്ല തയ്യൽ, സമയത്ത് കിട്ടി." },
  { stars: 5, comment: "Neat finishing, delivered a day early." },
  { stars: 4, comment: "Good work. Slight delay but informed in advance." },
  { stars: 5, comment: "വളരെ നല്ല ജോലി. വീണ്ടും ഏൽപ്പിക്കും." },
  { stars: 4, comment: "Fabric handled carefully, fair rate." },
  { stars: 5, comment: "Bulk order of 30 done without a single mistake." },
  { stars: 3, comment: "Work is fine, communication could be better." },
  { stars: 5, comment: "സമയത്ത് തീർത്തു തന്നു. നന്ദി." },
];

export const CUSTOMERS: { name: string; company: string | null }[] = [
  { name: "Meera Nair", company: null },
  { name: "Sr. Alphonsa", company: "St. Mary's Higher Secondary School" },
  { name: "Anil Kumar", company: "Anil Traders" },
  { name: "Priya Menon", company: "Kochi Boutique House" },
  { name: "Ravi Shankar", company: "Ernakulam Handloom Co-op" },
];

export type DemoRequest = {
  title: string;
  description: string;
  mode: "individual" | "group";
  units: number;
  pay: number;
  status: "open" | "assembling" | "assigned" | "completed";
  customerIndex: number;
  locationIndex: number;
  skills: { name: string; quantity: number }[];
};

// Spread across statuses so the customer and provider screens both have something to show:
// open requests to browse, one mid-assembly, one assigned, one completed for history.
export const REQUESTS: DemoRequest[] = [
  {
    title: "Blouse stitching",
    description: "One cotton saree blouse, princess cut. Material will be provided.",
    mode: "individual", units: 1, pay: 400, status: "open", customerIndex: 0, locationIndex: 0,
    skills: [{ name: "stitching", quantity: 1 }],
  },
  {
    title: "30 school uniform sets",
    description: "Cut, stitch and pack 30 school uniform sets before the term starts.",
    mode: "group", units: 30, pay: 15000, status: "open", customerIndex: 1, locationIndex: 1,
    skills: [{ name: "cutting", quantity: 10 }, { name: "stitching", quantity: 10 }, { name: "packaging", quantity: 10 }],
  },
  {
    title: "200 jute bags for Onam campaign",
    description: "Screen-printed jute shopping bags for an Onam promotion. Bulk craft and packing work.",
    mode: "group", units: 200, pay: 24000, status: "assembling", customerIndex: 2, locationIndex: 2,
    skills: [{ name: "craft", quantity: 120 }, { name: "packaging", quantity: 80 }],
  },
  {
    title: "Onam sadya for 50 guests",
    description: "Full traditional sadya for an office Onam celebration. Serving included.",
    mode: "group", units: 50, pay: 12000, status: "assigned", customerIndex: 4, locationIndex: 3,
    skills: [{ name: "cooking", quantity: 50 }],
  },
  {
    title: "Churidar alteration",
    description: "Alter two churidars — side seams and length.",
    mode: "individual", units: 2, pay: 300, status: "completed", customerIndex: 3, locationIndex: 0,
    skills: [{ name: "stitching", quantity: 2 }],
  },
];

// A seeded conversation so the Communities screen is not empty on first open.
export const CHAT: { title: string; messages: { role: "provider" | "customer"; body: string }[] } = {
  title: "30 school uniform sets",
  messages: [
    { role: "customer", body: "Namaskaram. Can this be finished before the 20th?" },
    { role: "provider", body: "അതെ, 20 ആം തീയതിക്ക് മുൻപ് തീർക്കാം. Material എപ്പോൾ കിട്ടും?" },
    { role: "customer", body: "I will send the cloth on Monday morning to the Kaloor unit." },
    { role: "provider", body: "Good. Cutting will start Monday itself. Three of us are on it." },
    { role: "customer", body: "Perfect, thank you." },
  ],
};
