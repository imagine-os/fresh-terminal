import { schema, t, table, SenderError } from 'spacetimedb/server';

/**
 * Fresh Terminal SpacetimeDB module (TypeScript).
 *
 * Written against spacetimedb@2.10.1 (`spacetimedb/server` builder API) and
 * type-checked locally. It has NOT been published to a SpacetimeDB host yet;
 * see module/README.md for the publish and codegen commands.
 *
 * Reducers cannot make outbound HTTP calls. Procedures can (ctx.http.fetch),
 * which is why the OpenRouter call lives in terminal/router for now and may
 * move into a procedure later.
 */

const box = table(
  { name: 'box', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner_identity: t.identity().index('btree'),
    name: t.string(),
    created_at: t.timestamp(),
    updated_at: t.timestamp(),
  },
);

const session = table(
  { name: 'session', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    box_id: t.u64().index('btree'),
    created_at: t.timestamp(),
  },
);

const line = table(
  { name: 'line', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    box_id: t.u64().index('btree'),
    /** 'user' | 'assistant' | 'system' */
    kind: t.string(),
    text: t.string(),
    chips_json: t.string(),
    /** Name of a rendered composition ('' for plain text). */
    component: t.string(),
    /** Reveal pattern for the renderer ('' for default). */
    reveal: t.string(),
    /** Structured reply (shared/reply Reply JSON), '' for plain text. */
    blocks_json: t.string(),
    created_at: t.timestamp(),
  },
);

const presence = table(
  { name: 'presence', public: true },
  {
    identity: t.identity().primaryKey(),
    box_id: t.u64().index('btree'),
    last_seen: t.timestamp(),
  },
);

const route_rule = table(
  { name: 'route_rule', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    intent: t.string().unique(),
    model: t.string(),
    permission: t.string(),
    /** Margin over provider cost in basis points (1% = 100). 0 = pure pass-through. */
    margin_bp: t.u32(),
    updated_at: t.timestamp(),
  },
);

/** One row per identity. Holds the "on chain" opt-in. */
const owner = table(
  { name: 'owner', public: true },
  {
    identity: t.identity().primaryKey(),
    on_chain: t.bool(),
    created_at: t.timestamp(),
  },
);

/**
 * The ledger. Money is integer micro-dollars. Every entry is hash-linked to the
 * owner's previous entry; entries of opted-in owners also link into the shared
 * chain. Hashes are computed by the caller today (shared/ledger); recomputing
 * them inside the reducer is a pass-2 task.
 */
const entry = table(
  { name: 'entry', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    box_id: t.u64().index('btree'),
    owner_identity: t.identity().index('btree'),
    /** 'charge' | 'credit' | 'settle' */
    kind: t.string(),
    what: t.string(),
    /** Served model id for model calls ('' otherwise). */
    model: t.string(),
    units: t.u64(),
    /** 'token_in' | 'token_out' | 'byte' | 'call' | 'second' */
    unit_kind: t.string(),
    cost_micro: t.u64(),
    price_micro: t.u64(),
    ref: t.string(),
    created_at: t.timestamp(),
    prev_hash: t.string(),
    hash: t.string(),
    shared_prev_hash: t.option(t.string()),
    shared_hash: t.option(t.string()),
  },
);

/** Theme records. spec_text is the dialect form; tokens_json the CSS overrides. */
const theme = table(
  { name: 'theme', public: true },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    scheme: t.string(),
    spec_text: t.string(),
    tokens_json: t.string(),
    updated_at: t.timestamp(),
  },
);

/** Master canvas cards. thickness_mm: paper 1, images 10 by default. */
const card = table(
  { name: 'card', public: true },
  {
    id: t.string().primaryKey(),
    title: t.string(),
    /** 'page' | 'doc' | 'image' | 'box' */
    kind: t.string(),
    href: t.string(),
    x: t.f64(),
    y: t.f64(),
    w: t.f64(),
    h: t.f64(),
    thickness_mm: t.f64(),
    rotation: t.f64(),
    created_at: t.timestamp(),
    updated_at: t.timestamp(),
  },
);

/*
 * Pass 4: the interface is data. Everything the UI shows for a box lives in
 * these tables and changes only through ops (shared/src/ops). The client and
 * router run the pure engine; these reducers store its results per record and
 * keep the batch (ops + inverse) so undo works across devices.
 */

/** Sidebar menu item. parent_id '' = top level. target_json = shared NavTarget or ''. */
const nav_item = table(
  { name: 'nav_item', public: true },
  {
    id: t.string().primaryKey(),
    box_id: t.u64().index('btree'),
    parent_id: t.string(),
    label: t.string(),
    icon: t.string(),
    target_json: t.string(),
    order: t.f64(),
    created_at: t.timestamp(),
    updated_at: t.timestamp(),
  },
);

/** A page built from blocks (shared/src/ui Block JSON). */
const page = table(
  { name: 'page', public: true },
  {
    id: t.string().primaryKey(),
    box_id: t.u64().index('btree'),
    title: t.string(),
    blocks_json: t.string(),
    created_at: t.timestamp(),
    updated_at: t.timestamp(),
  },
);

/** Per-box layout, theme and style token overrides. '' = product default. */
const box_ui = table(
  { name: 'box_ui', public: true },
  {
    box_id: t.u64().primaryKey(),
    dialect_text: t.string(),
    theme_id: t.string(),
    style_json: t.string(),
    updated_at: t.timestamp(),
  },
);

/** "Always treat 'Hoy' as a brand in this box." Sent with every tagger and router call. */
const glossary_term = table(
  { name: 'glossary_term', public: true },
  {
    id: t.string().primaryKey(),
    box_id: t.u64().index('btree'),
    text: t.string(),
    type: t.string(),
    note: t.string(),
    case_sensitive: t.bool(),
    created_at: t.timestamp(),
  },
);

/** One atomic edit: the ops applied and their inverse. state 'applied' | 'undone'. */
const edit_batch = table(
  { name: 'edit_batch', public: true },
  {
    id: t.string().primaryKey(),
    box_id: t.u64().index('btree'),
    owner_identity: t.identity().index('btree'),
    ops_json: t.string(),
    inverse_json: t.string(),
    summary: t.string(),
    source: t.string(),
    state: t.string(),
    created_at: t.timestamp(),
    flipped_at: t.timestamp(),
  },
);

const spacetimedb = schema({
  box,
  session,
  line,
  presence,
  route_rule,
  owner,
  entry,
  theme,
  card,
  nav_item,
  page,
  box_ui,
  glossary_term,
  edit_batch,
});
export default spacetimedb;

const LINE_KINDS = ['user', 'assistant', 'system'];

export const create_box = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new SenderError('Box name cannot be empty');
  }
  ctx.db.box.insert({
    id: 0n,
    owner_identity: ctx.sender,
    name: trimmed,
    created_at: ctx.timestamp,
    updated_at: ctx.timestamp,
  });
});

export const open_session = spacetimedb.reducer({ box_id: t.u64() }, (ctx, { box_id }) => {
  const found = ctx.db.box.id.find(box_id);
  if (!found) {
    throw new SenderError('Box not found');
  }
  ctx.db.session.insert({ id: 0n, box_id, created_at: ctx.timestamp });
});

export const append_line = spacetimedb.reducer(
  {
    box_id: t.u64(),
    kind: t.string(),
    text: t.string(),
    chips_json: t.string(),
    component: t.string(),
    reveal: t.string(),
    blocks_json: t.string(),
  },
  (ctx, { box_id, kind, text, chips_json, component, reveal, blocks_json }) => {
    const found = ctx.db.box.id.find(box_id);
    if (!found) {
      throw new SenderError('Box not found');
    }
    if (!LINE_KINDS.includes(kind)) {
      throw new SenderError(`Unknown line kind "${kind}"`);
    }
    ctx.db.line.insert({
      id: 0n,
      box_id,
      kind,
      text,
      chips_json,
      component,
      reveal,
      blocks_json,
      created_at: ctx.timestamp,
    });
    found.updated_at = ctx.timestamp;
    ctx.db.box.id.update(found);
  },
);

export const touch_presence = spacetimedb.reducer({ box_id: t.u64() }, (ctx, { box_id }) => {
  const existing = ctx.db.presence.identity.find(ctx.sender);
  if (existing) {
    existing.box_id = box_id;
    existing.last_seen = ctx.timestamp;
    ctx.db.presence.identity.update(existing);
  } else {
    ctx.db.presence.insert({ identity: ctx.sender, box_id, last_seen: ctx.timestamp });
  }
});

export const upsert_route_rule = spacetimedb.reducer(
  { intent: t.string(), model: t.string(), permission: t.string(), margin_bp: t.u32() },
  (ctx, { intent, model, permission, margin_bp }) => {
    const existing = ctx.db.route_rule.intent.find(intent);
    if (existing) {
      existing.model = model;
      existing.permission = permission;
      existing.margin_bp = margin_bp;
      existing.updated_at = ctx.timestamp;
      ctx.db.route_rule.id.update(existing);
    } else {
      ctx.db.route_rule.insert({
        id: 0n,
        intent,
        model,
        permission,
        margin_bp,
        updated_at: ctx.timestamp,
      });
    }
  },
);

export const set_on_chain = spacetimedb.reducer({ on_chain: t.bool() }, (ctx, { on_chain }) => {
  const existing = ctx.db.owner.identity.find(ctx.sender);
  if (existing) {
    existing.on_chain = on_chain;
    ctx.db.owner.identity.update(existing);
  } else {
    ctx.db.owner.insert({ identity: ctx.sender, on_chain, created_at: ctx.timestamp });
  }
});

const ENTRY_KINDS = ['charge', 'credit', 'settle', 'edit'];
const UNIT_KINDS = ['token_in', 'token_out', 'byte', 'call', 'second', 'op'];
const HEX_64 = /^[0-9a-f]{64}$/;

export const append_entry = spacetimedb.reducer(
  {
    box_id: t.u64(),
    kind: t.string(),
    what: t.string(),
    model: t.string(),
    units: t.u64(),
    unit_kind: t.string(),
    cost_micro: t.u64(),
    price_micro: t.u64(),
    ref: t.string(),
    prev_hash: t.string(),
    hash: t.string(),
    shared_prev_hash: t.option(t.string()),
    shared_hash: t.option(t.string()),
  },
  (ctx, args) => {
    if (!ENTRY_KINDS.includes(args.kind)) {
      throw new SenderError(`Unknown entry kind "${args.kind}"`);
    }
    if (!UNIT_KINDS.includes(args.unit_kind)) {
      throw new SenderError(`Unknown unit kind "${args.unit_kind}"`);
    }
    if (!HEX_64.test(args.prev_hash) || !HEX_64.test(args.hash)) {
      throw new SenderError('Hashes must be 64 hex characters');
    }
    const ownerRow = ctx.db.owner.identity.find(ctx.sender);
    const onChain = ownerRow ? ownerRow.on_chain : false;
    if (!onChain && (args.shared_prev_hash !== undefined || args.shared_hash !== undefined)) {
      throw new SenderError('Owner is not on the shared chain');
    }
    ctx.db.entry.insert({
      id: 0n,
      box_id: args.box_id,
      owner_identity: ctx.sender,
      kind: args.kind,
      what: args.what,
      model: args.model,
      units: args.units,
      unit_kind: args.unit_kind,
      cost_micro: args.cost_micro,
      price_micro: args.price_micro,
      ref: args.ref,
      created_at: ctx.timestamp,
      prev_hash: args.prev_hash,
      hash: args.hash,
      shared_prev_hash: args.shared_prev_hash,
      shared_hash: args.shared_hash,
    });
  },
);

export const upsert_theme = spacetimedb.reducer(
  { id: t.string(), name: t.string(), scheme: t.string(), spec_text: t.string(), tokens_json: t.string() },
  (ctx, { id, name, scheme, spec_text, tokens_json }) => {
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new SenderError('Theme id must be lowercase letters, digits and dashes');
    }
    const existing = ctx.db.theme.id.find(id);
    if (existing) {
      existing.name = name;
      existing.scheme = scheme;
      existing.spec_text = spec_text;
      existing.tokens_json = tokens_json;
      existing.updated_at = ctx.timestamp;
      ctx.db.theme.id.update(existing);
    } else {
      ctx.db.theme.insert({ id, name, scheme, spec_text, tokens_json, updated_at: ctx.timestamp });
    }
  },
);

const CARD_KINDS = ['page', 'doc', 'image', 'box'];

export const upsert_card = spacetimedb.reducer(
  {
    id: t.string(),
    title: t.string(),
    kind: t.string(),
    href: t.string(),
    x: t.f64(),
    y: t.f64(),
    w: t.f64(),
    h: t.f64(),
    thickness_mm: t.f64(),
    rotation: t.f64(),
  },
  (ctx, args) => {
    if (!CARD_KINDS.includes(args.kind)) {
      throw new SenderError(`Unknown card kind "${args.kind}"`);
    }
    if (args.thickness_mm <= 0) {
      throw new SenderError('Thickness must be positive');
    }
    const existing = ctx.db.card.id.find(args.id);
    if (existing) {
      ctx.db.card.id.update({ ...existing, ...args, updated_at: ctx.timestamp });
    } else {
      ctx.db.card.insert({ ...args, created_at: ctx.timestamp, updated_at: ctx.timestamp });
    }
  },
);

export const move_card = spacetimedb.reducer({ id: t.string(), x: t.f64(), y: t.f64() }, (ctx, { id, x, y }) => {
  const existing = ctx.db.card.id.find(id);
  if (!existing) {
    throw new SenderError('Card not found');
  }
  existing.x = x;
  existing.y = y;
  existing.updated_at = ctx.timestamp;
  ctx.db.card.id.update(existing);
});

// ---------- pass 4: interface records ----------

type Ctx = Parameters<Parameters<typeof spacetimedb.reducer>[1]>[0];

function ownedBox(ctx: Ctx, box_id: bigint) {
  const found = ctx.db.box.id.find(box_id);
  if (!found) {
    throw new SenderError('Box not found');
  }
  if (!found.owner_identity.isEqual(ctx.sender)) {
    throw new SenderError('Only the box owner can edit its interface');
  }
  return found;
}

function limit(value: string, max: number, what: string): void {
  if (value.length > max) {
    throw new SenderError(`${what} is too long`);
  }
}

export const upsert_nav_item = spacetimedb.reducer(
  { id: t.string(), box_id: t.u64(), parent_id: t.string(), label: t.string(), icon: t.string(), target_json: t.string(), order: t.f64() },
  (ctx, args) => {
    ownedBox(ctx, args.box_id);
    if (args.label.trim().length === 0) {
      throw new SenderError('Menu label cannot be empty');
    }
    limit(args.label, 60, 'Menu label');
    limit(args.target_json, 600, 'Menu target');
    if (args.parent_id !== '' && args.parent_id === args.id) {
      throw new SenderError('A menu item cannot be its own parent');
    }
    const existing = ctx.db.nav_item.id.find(args.id);
    if (existing) {
      ctx.db.nav_item.id.update({ ...existing, ...args, updated_at: ctx.timestamp });
    } else {
      ctx.db.nav_item.insert({ ...args, created_at: ctx.timestamp, updated_at: ctx.timestamp });
    }
  },
);

export const remove_nav_item = spacetimedb.reducer({ id: t.string() }, (ctx, { id }) => {
  const existing = ctx.db.nav_item.id.find(id);
  if (!existing) {
    return;
  }
  ownedBox(ctx, existing.box_id);
  ctx.db.nav_item.id.delete(id);
});

export const upsert_page = spacetimedb.reducer(
  { id: t.string(), box_id: t.u64(), title: t.string(), blocks_json: t.string() },
  (ctx, args) => {
    ownedBox(ctx, args.box_id);
    limit(args.title, 80, 'Page title');
    limit(args.blocks_json, 64_000, 'Page');
    const existing = ctx.db.page.id.find(args.id);
    if (existing) {
      ctx.db.page.id.update({ ...existing, ...args, updated_at: ctx.timestamp });
    } else {
      ctx.db.page.insert({ ...args, created_at: ctx.timestamp, updated_at: ctx.timestamp });
    }
  },
);

export const remove_page = spacetimedb.reducer({ id: t.string() }, (ctx, { id }) => {
  const existing = ctx.db.page.id.find(id);
  if (!existing) {
    return;
  }
  ownedBox(ctx, existing.box_id);
  ctx.db.page.id.delete(id);
});

export const set_box_ui = spacetimedb.reducer(
  { box_id: t.u64(), dialect_text: t.string(), theme_id: t.string(), style_json: t.string() },
  (ctx, args) => {
    ownedBox(ctx, args.box_id);
    limit(args.dialect_text, 4000, 'Layout text');
    limit(args.style_json, 8000, 'Style overrides');
    const existing = ctx.db.box_ui.box_id.find(args.box_id);
    if (existing) {
      ctx.db.box_ui.box_id.update({ ...existing, ...args, updated_at: ctx.timestamp });
    } else {
      ctx.db.box_ui.insert({ ...args, updated_at: ctx.timestamp });
    }
  },
);

const CHIP_KINDS = ['action', 'date', 'time', 'person', 'org', 'place', 'object', 'variable', 'list', 'number', 'money', 'url', 'page', 'nav', 'theme', 'entity'];

export const upsert_glossary_term = spacetimedb.reducer(
  { id: t.string(), box_id: t.u64(), text: t.string(), type: t.string(), note: t.string(), case_sensitive: t.bool() },
  (ctx, args) => {
    ownedBox(ctx, args.box_id);
    if (!CHIP_KINDS.includes(args.type)) {
      throw new SenderError(`Unknown chip type "${args.type}"`);
    }
    limit(args.text, 80, 'Glossary text');
    limit(args.note, 300, 'Glossary note');
    const existing = ctx.db.glossary_term.id.find(args.id);
    if (existing) {
      ctx.db.glossary_term.id.update({ ...existing, ...args });
    } else {
      ctx.db.glossary_term.insert({ ...args, created_at: ctx.timestamp });
    }
  },
);

export const remove_glossary_term = spacetimedb.reducer({ id: t.string() }, (ctx, { id }) => {
  const existing = ctx.db.glossary_term.id.find(id);
  if (!existing) {
    return;
  }
  ownedBox(ctx, existing.box_id);
  ctx.db.glossary_term.id.delete(id);
});

const EDIT_STATES = ['applied', 'undone'];

export const record_edit_batch = spacetimedb.reducer(
  { id: t.string(), box_id: t.u64(), ops_json: t.string(), inverse_json: t.string(), summary: t.string(), source: t.string() },
  (ctx, args) => {
    ownedBox(ctx, args.box_id);
    limit(args.ops_json, 64_000, 'Edit');
    limit(args.inverse_json, 64_000, 'Edit inverse');
    if (ctx.db.edit_batch.id.find(args.id)) {
      throw new SenderError('Edit already recorded');
    }
    ctx.db.edit_batch.insert({
      ...args,
      owner_identity: ctx.sender,
      state: 'applied',
      created_at: ctx.timestamp,
      flipped_at: ctx.timestamp,
    });
  },
);

export const set_edit_state = spacetimedb.reducer(
  { id: t.string(), state: t.string(), ops_json: t.string(), inverse_json: t.string() },
  (ctx, { id, state, ops_json, inverse_json }) => {
    const existing = ctx.db.edit_batch.id.find(id);
    if (!existing) {
      throw new SenderError('Edit not found');
    }
    ownedBox(ctx, existing.box_id);
    if (!EDIT_STATES.includes(state)) {
      throw new SenderError(`Unknown edit state "${state}"`);
    }
    ctx.db.edit_batch.id.update({ ...existing, state, ops_json, inverse_json, flipped_at: ctx.timestamp });
  },
);
