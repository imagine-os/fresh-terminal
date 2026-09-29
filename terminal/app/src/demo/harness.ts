import type { Chip, ChipKind } from '@shared/chips';
import type { Box, Line } from '../store/types';

/**
 * The "harness" demo (C-108): a year in the life of one person who runs three
 * small companies on the same Company OS and keeps family and personal life in
 * the same terminal. Every line is written as a template with marked spans,
 * `{kind:text}` or `{kind:text|value}`, so the tags carry exact offsets the
 * way the tagger would have left them. Deterministic: the same seed always
 * yields the same lines, so screenshots and tests agree.
 *
 * Nothing here is a real person, company or figure.
 */
export interface DemoSource {
  boxes: Box[];
  lines: Line[];
}

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 5, 13, 0, 0); // Mon 5 Jan 2026, 08:00 in Bogotá

function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const KIND_ALIASES: Record<string, ChipKind> = {
  action: 'action',
  date: 'date',
  time: 'time',
  person: 'person',
  org: 'org',
  place: 'place',
  object: 'object',
  variable: 'variable',
  list: 'list',
  number: 'number',
  money: 'money',
  url: 'url',
  page: 'page',
  nav: 'nav',
  theme: 'theme',
  mood: 'mood',
  entity: 'entity',
};

/** Turns "call {person:Mara} on {date:Monday|2026-03-02}" into text plus chips with exact offsets. */
export function compile(template: string, group?: string): { text: string; chips: Chip[] } {
  let text = '';
  const chips: Chip[] = [];
  const pattern = /\{([a-z]+):([^}|]+)(?:\|([^}]*))?\}/g;
  let last = 0;
  for (const match of template.matchAll(pattern)) {
    text += template.slice(last, match.index);
    const kind = KIND_ALIASES[match[1] as string];
    const span = match[2] as string;
    if (!kind) throw new Error(`unknown kind ${match[1]}`);
    const start = text.length;
    text += span;
    const chip: Chip = { kind, start, end: start + span.length, text: span, source: 'local', p: 0.92 };
    if (match[3] !== undefined && match[3] !== '') chip.value = match[3];
    if (kind === 'list' && group) chip.group = group;
    chips.push(chip);
    last = (match.index as number) + match[0].length;
  }
  text += template.slice(last);
  return { text, chips };
}

interface Stage {
  id: string;
  name: string;
  /** Roughly how many lines a year this stage gets. */
  weight: number;
  templates: string[];
}

const STAGES: Stage[] = [
  {
    id: 'demo-northwind',
    name: 'Northwind Dental',
    weight: 5,
    templates: [
      '{action:call} {person:Mara Quintero} on {date:Monday} at {time:9am} about the {object:autoclave} service quote of {money:$1,200} from {org:Sterilix}',
      '{action:book} {person:Dr. Okafor} for the {date:first Tuesday} clinic day in {place:Chapinero}; {number:14} patients so far',
      '{action:make} a page called {page:Recall list} with the {list:overdue cleanings}, {list:crown follow-ups} and {list:whitening consults}',
      '{action:send} {org:Sunrise Insurance} the {object:claim batch} for {date:March}; {money:$8,430} outstanding, feeling {mood:hopeful|positive}',
      'payroll for {person:Mara Quintero}, {person:Luis Beltrán} and {person:Ana Rueda} runs {date:the 15th}; total {money:$6,900}',
      '{action:order} {number:20} boxes of {object:nitrile gloves} from {org:MedSupply Co} before {date:Friday}',
      '{action:add} {nav:Patients} and {nav:Schedule} to the menu, switch this stage to the {theme:Clinic White} theme; the {entity:Company OS} tenant is {entity:Northwind}',
      'the {object:x-ray sensor} failed again, {mood:frustrated|negative}; ask {org:Dentsply} for a loaner by {date:tomorrow}',
      '{action:review} the lease with {person:Camila Ortiz} at {place:Calle 93} on {date:Thursday} at {time:4pm}; rent is {money:$3,150}',
      '{action:post} the {url:https://northwind.example/reviews} link in the waiting room page, {number:47} five-star reviews',
      '{action:set} {variable:reminder_days} to {number:3} for the {page:Recall list}',
      'Mara says the {object:chair 2} compressor is loud, {mood:worried|negative}; budget {money:$450} for the {object:compressor} repair',
      '{action:sponsor} the {org:Chapinero Runners} 5k on {date:April 12} for {money:$300}',
      '{action:update} the {page:Prices} page: {list:cleaning}, {list:whitening}, {list:implant consult} with new numbers',
      '{action:ask} {person:Luis Beltrán} to reconcile {org:Sunrise Insurance} and {org:Vida Plus} claims by {date:end of month}',
    ],
  },
  {
    id: 'demo-harbor',
    name: 'Harbor Bakery',
    weight: 5,
    templates: [
      '{action:order} {number:50} kg of {object:flour} from {org:Molinos del Valle} for {date:Saturday}; {money:$210}',
      '{action:schedule} {person:Tomás Herrera} and {person:Sofía Nieto} for the {date:Sunday} market at {place:Usaquén}',
      '{action:make} a page called {page:Weekend menu} with {list:sourdough}, {list:almond croissants} and {list:guava rolls}',
      'the {object:oven} thermostat drifts, {mood:annoyed|negative}; call {org:Rational Service} at {time:10am} {date:Monday}',
      '{action:cater} the {org:Loma Coffee Roasters} launch on {date:May 9}: {number:120} pastries, {money:$960}',
      '{action:pay} {org:Bancolombia} the loan instalment of {money:$1,780} on {date:the 20th}',
      '{action:try} the {theme:Paper} theme on this stage and add {nav:Orders} to the menu',
      'Sofía wants {date:Thursdays} off; move {person:Tomás Herrera} to the {time:5am} shift',
      '{action:post} the new {url:https://harbor.example/order} link and the {object:croissant} photo, {mood:proud|positive}',
      '{action:buy} {number:6} {object:proofing baskets} and {number:2} {object:bench scrapers} at {place:Paloquemao} for {money:$140}',
      '{action:invoice} {org:Northwind Dental} {money:$85} for the {date:Friday} staff breakfast',
      '{action:set} {variable:daily_bake} to {number:180} loaves for {date:December}; move the {entity:POS} export into {entity:Company OS}',
      '{action:update} {page:Weekend menu}: swap {list:guava rolls} for {list:cardamom buns}',
      'health inspection at {place:Usaquén} on {date:June 3} at {time:8am}, ask {person:Sofía Nieto} to prep',
    ],
  },
  {
    id: 'demo-loma',
    name: 'Loma Coffee Roasters',
    weight: 4,
    templates: [
      '{action:roast} {number:60} kg of {object:Huila lot 7} on {date:Tuesday}; ship {number:40} kg to {org:Harbor Bakery}',
      '{action:call} {person:Andrés Pinilla} at {org:Finca La Loma} about the {date:July} harvest and the {money:$4,200} advance',
      '{action:make} a page called {page:Wholesale} with {list:Harbor Bakery}, {list:Café Libro} and {list:The Hub Coworking}',
      'the {object:roaster} exhaust fan needs a part, {money:$380}, {mood:calm|positive}; order from {org:Probat}',
      '{action:publish} the {url:https://loma.example/subscribe} subscription page; goal {number:200} subscribers by {date:September}',
      '{action:meet} {person:Valeria Soto} from {org:Café Libro} at {place:La Candelaria} on {date:Wednesday} at {time:3pm}',
      '{action:add} {nav:Lots} and {nav:Subscribers} to the menu; switch to the {theme:Void} theme',
      'cupping notes for {object:Huila lot 7}: {list:cherry}, {list:cocoa}, {list:brown sugar}',
      '{action:pay} {person:Andrés Pinilla} {money:$2,100} on {date:the 30th}; {mood:grateful|positive}',
      '{action:set} {variable:roast_profile} to {object:medium-light} for the {object:Nariño lot 3}; log it in {entity:Company OS}',
      '{action:export} shipment of {number:300} kg to {org:Nordic Beans} in {place:Oslo} on {date:October 14}',
    ],
  },
  {
    id: 'demo-family',
    name: 'Family',
    weight: 6,
    templates: [
      '{action:pick up} {person:Emma} from {place:Colegio Los Nogales} at {time:3:30pm} on {date:Wednesday}',
      '{person:Nico} has a dentist check with {person:Dr. Okafor} at {org:Northwind Dental} on {date:Friday} at {time:11am}',
      'groceries: {list:eggs}, {list:oat milk}, {list:bananas}, {list:rice} and {list:coffee}',
      '{action:plan} the {date:Easter} trip to {place:Santa Marta}: {number:4} tickets, budget {money:$1,600}, {mood:excited|positive}',
      '{action:pay} the {org:Colegio Los Nogales} fees of {money:$2,300} by {date:the 5th}',
      '{action:make} a page called {page:Chores} with {list:dishes}, {list:laundry} and {list:walk Pepper}',
      '{person:Lucía} birthday dinner on {date:August 21} at {time:7pm}, invite {person:Camila Ortiz} and {person:Valeria Soto}',
      '{object:Pepper} the dog needs the vet, {mood:worried|negative}; {org:Vet Centro} at {time:6pm} {date:tomorrow}',
      '{action:book} {person:Emma} swim lessons at {place:Compensar} for {date:Saturdays} at {time:9am}, {money:$120} a month',
      '{action:switch} this stage to the {theme:Warm Paper} theme and add {nav:Calendar} and {nav:Chores}',
      'movie night {date:Friday}: {list:popcorn}, {list:lemonade}, {object:The Iron Giant}',
      '{action:renew} the {object:car insurance} with {org:Seguros Bolívar} for {money:$890} before {date:November 1}',
      '{person:Nico} science fair on {date:October 3}; buy {object:poster board} and {number:3} {object:LED strips}',
      'family budget for {date:2026}: {money:$48,000}, save {money:$6,000}; {mood:steady|positive}',
      '{action:call} {person:Lucía} about {date:Christmas} in {place:Medellín} with the grandparents',
    ],
  },
  {
    id: 'demo-personal',
    name: 'Personal',
    weight: 5,
    templates: [
      'gym at {time:6am} {date:Monday}, {date:Wednesday} and {date:Friday}; {variable:squat} at {number:100} kg, {mood:strong|positive}',
      '{action:read} {object:Thinking in Systems} and {object:The Mom Test} in {date:February}',
      '{action:make} a page called {page:Reading list} with {list:Thinking in Systems}, {list:The Mom Test} and {list:Deep Work}',
      '{action:renew} the {object:passport} at {place:Cancillería} on {date:March 18} at {time:8am}',
      'therapy with {person:Dr. Salazar} on {date:Tuesdays} at {time:5pm}; {mood:lighter|positive}',
      '{action:save} {money:$500} a month into {org:Bancolombia} for the {object:e-bike}',
      '{action:publish} the essay to {url:https://notes.example/slow-mornings} on {date:Sunday}',
      '{action:switch} this stage to the {theme:Void} theme; add {nav:Reading list} and {nav:Habits}; try {entity:Fresh Terminal} on the phone',
      'cycling with {person:Andrés Pinilla} to {place:Patios} on {date:Saturday} at {time:5:30am}; {number:60} km',
      '{action:set} {variable:sleep_goal} to {number:8} hours; last week {number:6.5}, {mood:tired|negative}',
      'dinner with {person:Camila Ortiz} at {place:La Candelaria} on {date:Thursday} at {time:8pm}',
      '{action:learn} {object:Spanish guitar}: {number:20} minutes a day, teacher {person:Felipe Arango}, {money:$60} a month',
      'taxes with {org:DIAN} due {date:August 15}; gather {list:invoices}, {list:receipts} and {list:bank statements}',
    ],
  },
];

/** Roughly how many lines the demo carries: around 300 over the year. */
const TARGET_LINES = 300;

export function buildHarness(seed = 20260105): DemoSource {
  const random = seeded(seed);
  const boxes: Box[] = STAGES.map((stage, index) => ({ id: stage.id, owner_identity: 'demo', name: stage.name, created_at: START - (index + 1) * DAY, updated_at: START + 364 * DAY }));
  const totalWeight = STAGES.reduce((sum, stage) => sum + stage.weight, 0);
  const lines: Line[] = [];
  const cursor = new Map<string, number>();
  for (let i = 0; i < TARGET_LINES; i += 1) {
    // Pick a stage by weight, then the next template for that stage in rotation, with a jitter so the same pair rarely repeats.
    let roll = random() * totalWeight;
    let stage = STAGES[0] as Stage;
    for (const candidate of STAGES) {
      roll -= candidate.weight;
      if (roll <= 0) {
        stage = candidate;
        break;
      }
    }
    const index = ((cursor.get(stage.id) ?? Math.floor(random() * stage.templates.length)) + 1 + (random() < 0.2 ? 1 : 0)) % stage.templates.length;
    cursor.set(stage.id, index);
    const template = stage.templates[index] as string;
    const at = START + Math.floor((i / TARGET_LINES) * 364 * DAY) + Math.floor(random() * 10 * 3_600_000);
    const { text, chips } = compile(template, `${stage.id}-${i}`);
    lines.push({ id: `${stage.id}-l${i}`, box_id: stage.id, kind: 'user', text, chips_json: JSON.stringify(chips), component: '', reveal: '', blocks_json: '', created_at: at });
    // Every line gets a short reply, so the stage reads like a real session in Actions and Replay too.
    lines.push({ id: `${stage.id}-r${i}`, box_id: stage.id, kind: 'assistant', text: 'Done.', chips_json: '[]', component: '', reveal: '', blocks_json: '', created_at: at + 4000 });
  }
  return { boxes, lines };
}
