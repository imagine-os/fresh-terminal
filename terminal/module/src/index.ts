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
    /** 'token_in' | 'token_out' | 'byte' | 'call' */
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

const spacetimedb = schema({ box, session, line, presence, route_rule, owner, entry, theme, card });
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
  },
  (ctx, { box_id, kind, text, chips_json, component, reveal }) => {
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

const ENTRY_KINDS = ['charge', 'credit', 'settle'];
const UNIT_KINDS = ['token_in', 'token_out', 'byte', 'call'];
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
