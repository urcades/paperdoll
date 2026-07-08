export const PAPER_DOLL_PROTOCOL = "paper-doll/v1" as const;

export const SIDES = ["top", "right", "bottom", "left"] as const;

export type Side = (typeof SIDES)[number];
export type SlotId = string;
export type PoolId = string;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E };

export type ProtocolError = {
  path: string;
  message: string;
};

export type AcceptToken = {
  kind: string;
  type?: string;
};

export type ContainedElement = {
  kind: string;
  id?: string;
  data?: JsonValue;
};

export type PortAddress = {
  slot: SlotId;
  side: Side;
};

export type BodySlot = {
  accepts?: readonly AcceptToken[];
  contains?: readonly ContainedElement[];
  ports?: Partial<Record<Side, PortAddress>>;
};

export type Pool = {
  accepts?: readonly AcceptToken[];
  contains?: readonly ContainedElement[];
};

export type Body = {
  root: SlotId;
  slots: Record<SlotId, BodySlot>;
  pools: Record<PoolId, Pool>;
};

export type DeleteSlotOptions = {
  collapseOppositeNeighbors?: boolean;
};

export type InsertOptions = {
  id?: string;
};

export type PaperDollDocument = {
  protocol: typeof PAPER_DOLL_PROTOCOL;
  body: Body;
};

export type Endpoint = {
  slot: SlotId;
  side: Side;
};

export type Connection = {
  from: Endpoint;
  to: Endpoint;
};

export type DerivedPosition = {
  x: number;
  y: number;
};

export type DerivedNode = {
  id: string;
  kind: "slot" | "pool";
  x: number;
  y: number;
  accepts?: readonly AcceptToken[];
  contains?: readonly ContainedElement[];
};

export type DerivedLayout = {
  nodes: DerivedNode[];
  slots: Record<SlotId, DerivedPosition>;
  pools: Record<PoolId, DerivedPosition>;
  connections: Connection[];
};

const SIDE_SET = new Set<string>(SIDES);
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const OPPOSITE_SIDES: Record<Side, Side> = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right"
};

const SIDE_VECTORS: Record<Side, DerivedPosition> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};

export function parseDocument(input: unknown): Result<PaperDollDocument, ProtocolError[]> {
  const errors = validateDocument(input);
  if (errors.length > 0) return { ok: false, errors };
  const document = input as PaperDollDocument;
  return { ok: true, value: { protocol: PAPER_DOLL_PROTOCOL, body: cloneBody(document.body) } };
}

export function assertDocument(input: unknown): asserts input is PaperDollDocument {
  const result = parseDocument(input);
  if (!result.ok) {
    throw new Error(formatProtocolErrors(result.errors));
  }
}

export function formatProtocolErrors(errors: readonly ProtocolError[]): string {
  return errors.map((error) => `${error.path}: ${error.message}`).join("\n");
}

export function validateDocument(input: unknown): ProtocolError[] {
  const errors: ProtocolError[] = [];

  if (!isRecord(input)) {
    return [{ path: "$", message: "Document must be an object." }];
  }

  if (input.protocol !== PAPER_DOLL_PROTOCOL) {
    errors.push({ path: "$.protocol", message: `Expected "${PAPER_DOLL_PROTOCOL}".` });
  }

  validateKnownKeys(input, ["protocol", "body"], "$", errors);
  validateBody(input.body, "$.body", errors);

  if (errors.length === 0) {
    const layoutResult = deriveLayoutResult(input as PaperDollDocument);
    if (!layoutResult.ok) errors.push(...layoutResult.errors);
  }

  return errors;
}

export function deriveConnections(body: Body): Connection[] {
  const connections: Connection[] = [];
  const seen = new Set<string>();

  for (const [slotId, slot] of Object.entries(body.slots)) {
    for (const [side, port] of typedEntries(slot.ports ?? {})) {
      if (!port) continue;
      const key = canonicalConnectionKey({ slot: slotId, side }, port);
      if (seen.has(key)) continue;
      seen.add(key);
      connections.push({
        from: { slot: slotId, side },
        to: { slot: port.slot, side: port.side }
      });
    }
  }

  return connections;
}

export function deriveLayout(document: PaperDollDocument): DerivedLayout {
  const result = deriveLayoutResult(document);
  if (!result.ok) throw new Error(formatProtocolErrors(result.errors));
  return result.value;
}

export function connect(body: Body, from: Endpoint, to: Endpoint): Body {
  assertEndpoint(body, from, "from");
  assertEndpoint(body, to, "to");
  if (from.slot === to.slot) {
    throw new Error(`Cannot connect slot "${from.slot}" to itself.`);
  }
  if (to.side !== OPPOSITE_SIDES[from.side]) {
    throw new Error(`Connections must be face-opposite; ${from.side} must connect to ${OPPOSITE_SIDES[from.side]}.`);
  }

  const next = cloneBody(body);
  clearPort(next, from);
  clearPort(next, to);
  setPort(next, from, to);
  setPort(next, to, from);
  return next;
}

export function disconnect(body: Body, endpoint: Endpoint): Body {
  assertEndpoint(body, endpoint, "endpoint");
  const next = cloneBody(body);
  clearPort(next, endpoint);
  return next;
}

export function insertSlot(
  body: Body,
  source: Endpoint,
  slot: Omit<BodySlot, "ports"> = {},
  options: InsertOptions = {}
): { body: Body; slotId: SlotId } {
  assertEndpoint(body, source, "source");

  const slotId = options.id ?? nextSlotId(body);
  assertAvailableId(body, slotId);
  const prior = body.slots[source.slot]?.ports?.[source.side];
  const base = cloneBody(body);
  let next: Body = {
    ...base,
    slots: {
      ...base.slots,
      [slotId]: {
        accepts: [],
        contains: [],
        ...cloneSlot(slot),
        ports: {}
      }
    }
  };

  if (prior) {
    next = connect(next, { slot: slotId, side: source.side }, prior);
  }

  next = connect(next, source, { slot: slotId, side: OPPOSITE_SIDES[source.side] });
  return { body: next, slotId };
}

export function insertPool(body: Body, pool: Pool = {}, options: InsertOptions = {}): { body: Body; poolId: PoolId } {
  const poolId = options.id ?? nextPoolId(body);
  assertAvailableId(body, poolId);
  const base = cloneBody(body);
  return {
    body: {
      ...base,
      pools: {
        ...base.pools,
        [poolId]: {
          accepts: [],
          contains: [],
          ...clonePool(pool)
        }
      }
    },
    poolId
  };
}

export function deletePool(body: Body, poolId: PoolId): Body {
  if (!body.pools[poolId]) throw new Error(`Pool "${poolId}" does not exist.`);

  const next = cloneBody(body);
  delete next.pools[poolId];
  return next;
}

export function deleteSlot(body: Body, slotId: SlotId, options: DeleteSlotOptions = {}): Body {
  if (slotId === body.root) throw new Error(`Cannot delete root slot "${slotId}".`);
  if (!body.slots[slotId]) throw new Error(`Slot "${slotId}" does not exist.`);

  const deletedConnections = deriveConnections(body)
    .map((connection) => connectionThroughSlot(connection, slotId))
    .filter((connection): connection is { deleted: Endpoint; neighbor: Endpoint } => Boolean(connection));
  const next = cloneBody(body);

  delete next.slots[slotId];

  for (const slot of Object.values(next.slots)) {
    for (const side of SIDES) {
      if (slot.ports?.[side]?.slot === slotId) {
        delete slot.ports[side];
      }
    }
  }

  const [first, second] = deletedConnections;
  if (
    options.collapseOppositeNeighbors &&
    deletedConnections.length === 2 &&
    first &&
    second &&
    first.neighbor.slot !== second.neighbor.slot &&
    first.deleted.side === OPPOSITE_SIDES[second.deleted.side]
  ) {
    return connect(next, first.neighbor, second.neighbor);
  }

  return next;
}

function deriveLayoutResult(document: PaperDollDocument): Result<DerivedLayout, ProtocolError[]> {
  const errors: ProtocolError[] = [];
  const positions: Record<SlotId, DerivedPosition> = {};
  const occupied = new Map<string, SlotId>();
  const queue: SlotId[] = [document.body.root];

  positions[document.body.root] = { x: 0, y: 0 };
  occupied.set(positionKey(positions[document.body.root]), document.body.root);

  while (queue.length > 0) {
    const slotId = queue.shift();
    if (!slotId) continue;

    const slot = document.body.slots[slotId];
    const sourcePosition = positions[slotId];

    for (const [side, target] of typedEntries(slot.ports ?? {})) {
      if (!target) continue;
      const vector = SIDE_VECTORS[side];
      const expected = {
        x: sourcePosition.x + vector.x,
        y: sourcePosition.y + vector.y
      };
      const existing = positions[target.slot];

      if (existing) {
        if (existing.x !== expected.x || existing.y !== expected.y) {
          errors.push({
            path: `$.body.slots.${slotId}.ports.${side}`,
            message: `Connection implies ${target.slot} at ${expected.x},${expected.y}, but it already resolves to ${existing.x},${existing.y}.`
          });
        }
        continue;
      }

      const key = positionKey(expected);
      const collidingSlot = occupied.get(key);
      if (collidingSlot) {
        errors.push({
          path: `$.body.slots.${slotId}.ports.${side}`,
          message: `Layout collision: ${target.slot} and ${collidingSlot} both resolve to ${key}.`
        });
        continue;
      }

      positions[target.slot] = expected;
      occupied.set(key, target.slot);
      queue.push(target.slot);
    }
  }

  const unreachable = Object.keys(document.body.slots).filter((slotId) => !positions[slotId]);
  for (const slotId of unreachable) {
    errors.push({
      path: `$.body.slots.${slotId}`,
      message: `Physical slot is not reachable from root "${document.body.root}". Use body.pools for non-graph containment.`
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const poolPositions = derivePoolPositions(document.body.pools, positions);
  return {
    ok: true,
    value: {
      slots: positions,
      pools: poolPositions,
      connections: deriveConnections(document.body),
      nodes: [
        ...Object.entries(document.body.slots).map(([id, slot]) => ({
          id,
          kind: "slot" as const,
          accepts: slot.accepts,
          contains: slot.contains,
          ...positions[id]
        })),
        ...Object.entries(document.body.pools).map(([id, pool]) => ({
          id,
          kind: "pool" as const,
          accepts: pool.accepts,
          contains: pool.contains,
          ...poolPositions[id]
        }))
      ]
    }
  };
}

function validateBody(input: unknown, path: string, errors: ProtocolError[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Body must be an object." });
    return;
  }

  if (input.zones !== undefined) {
    errors.push({ path: `${path}.zones`, message: "body.zones was removed in paper-doll/v1. Use body.pools." });
  }
  if (input.equipped !== undefined) {
    errors.push({ path: `${path}.equipped`, message: "body.equipped was removed in paper-doll/v1. Use slot.contains or pool.contains." });
  }

  validateKnownKeys(input, ["root", "slots", "pools", "zones", "equipped"], path, errors);

  if (!isId(input.root)) {
    errors.push({ path: `${path}.root`, message: "Root must be a valid slot id." });
  }

  if (!isRecord(input.slots)) {
    errors.push({ path: `${path}.slots`, message: "Slots must be an object keyed by slot id." });
    return;
  }

  if (!isRecord(input.pools)) {
    errors.push({ path: `${path}.pools`, message: "Pools must be an object keyed by pool id." });
  }

  if (isId(input.root) && !input.slots[input.root]) {
    errors.push({ path: `${path}.root`, message: `Root slot "${input.root}" does not exist.` });
  }

  for (const [slotId, slot] of Object.entries(input.slots)) {
    validateId(slotId, `${path}.slots.${slotId}`, errors);
    validateSlot(slot, `${path}.slots.${slotId}`, errors);
  }

  if (isRecord(input.pools)) {
    for (const [poolId, pool] of Object.entries(input.pools)) {
      validateId(poolId, `${path}.pools.${poolId}`, errors);
      validatePool(pool, `${path}.pools.${poolId}`, errors);
    }
  }

  if (errors.length > 0) return;

  const body = input as unknown as Body;
  validatePorts(body, path, errors);
}

function validateSlot(input: unknown, path: string, errors: ProtocolError[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Slot must be an object." });
    return;
  }

  validateKnownKeys(input, ["accepts", "contains", "ports"], path, errors);
  validateAcceptTokens(input.accepts, `${path}.accepts`, errors);
  validateContainedElements(input.contains, `${path}.contains`, errors);

  if (input.ports === undefined) return;
  if (!isRecord(input.ports)) {
    errors.push({ path: `${path}.ports`, message: "Ports must be an object keyed by side." });
    return;
  }

  for (const [side, port] of Object.entries(input.ports)) {
    if (!isSide(side)) {
      errors.push({ path: `${path}.ports.${side}`, message: "Port side must be top, right, bottom, or left." });
      continue;
    }
    validatePortAddress(port, `${path}.ports.${side}`, errors);
  }
}

function validatePool(input: unknown, path: string, errors: ProtocolError[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Pool must be an object." });
    return;
  }

  if (input.ports !== undefined) {
    errors.push({ path: `${path}.ports`, message: "Pools are edge-less and cannot have ports." });
  }

  validateKnownKeys(input, ["accepts", "contains", "ports"], path, errors);
  validateAcceptTokens(input.accepts, `${path}.accepts`, errors);
  validateContainedElements(input.contains, `${path}.contains`, errors);
}

function validatePorts(body: Body, path: string, errors: ProtocolError[]): void {
  for (const [slotId, slot] of Object.entries(body.slots)) {
    for (const [side, port] of typedEntries(slot.ports ?? {})) {
      if (!port) continue;
      const portPath = `${path}.slots.${slotId}.ports.${side}`;

      if (!body.slots[port.slot]) {
        errors.push({ path: portPath, message: `References missing slot "${port.slot}".` });
        continue;
      }

      if (port.side !== OPPOSITE_SIDES[side]) {
        errors.push({
          path: portPath,
          message: `Connections must be face-opposite; ${side} must connect to ${OPPOSITE_SIDES[side]}.`
        });
      }

      const reciprocal = body.slots[port.slot]?.ports?.[port.side];
      if (!reciprocal || reciprocal.slot !== slotId || reciprocal.side !== side) {
        errors.push({
          path: portPath,
          message: `Must be reciprocated by ${port.slot}.${port.side}.`
        });
      }
    }
  }
}

function validatePortAddress(input: unknown, path: string, errors: ProtocolError[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Port address must be an object." });
    return;
  }

  validateKnownKeys(input, ["slot", "side"], path, errors);
  if (!isId(input.slot)) {
    errors.push({ path: `${path}.slot`, message: "Port slot must be a valid slot id." });
  }
  if (!isSide(input.side)) {
    errors.push({ path: `${path}.side`, message: "Port side must be top, right, bottom, or left." });
  }
}

function validateAcceptTokens(value: unknown, path: string, errors: ProtocolError[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push({ path, message: "Accepts must be an array of accept token objects." });
    return;
  }

  value.forEach((token, index) => validateAcceptToken(token, `${path}.${index}`, errors));
}

function validateAcceptToken(value: unknown, path: string, errors: ProtocolError[]): void {
  if (!isRecord(value)) {
    errors.push({ path, message: "Accept token must be an object." });
    return;
  }

  validateKnownKeys(value, ["kind", "type"], path, errors);
  if (!isId(value.kind)) {
    errors.push({ path: `${path}.kind`, message: "Accept token kind must be a lowercase id." });
  }
  if (value.type !== undefined && !isId(value.type)) {
    errors.push({ path: `${path}.type`, message: "Accept token type must be a lowercase id." });
  }
}

function validateContainedElements(value: unknown, path: string, errors: ProtocolError[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push({ path, message: "Contains must be an array of contained element objects." });
    return;
  }

  value.forEach((element, index) => validateContainedElement(element, `${path}.${index}`, errors));
}

function validateContainedElement(value: unknown, path: string, errors: ProtocolError[]): void {
  if (!isRecord(value)) {
    errors.push({ path, message: "Contained element must be an object." });
    return;
  }

  validateKnownKeys(value, ["kind", "id", "data"], path, errors);
  if (!isId(value.kind)) {
    errors.push({ path: `${path}.kind`, message: "Contained element kind must be a lowercase id." });
  }
  if (value.id !== undefined && typeof value.id !== "string") {
    errors.push({ path: `${path}.id`, message: "Contained element id must be a string." });
  }
  if (value.data !== undefined && !isJsonValue(value.data)) {
    errors.push({ path: `${path}.data`, message: "Contained element data must be JSON-compatible." });
  }
}

function validateKnownKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: ProtocolError[]
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      errors.push({ path: `${path}.${key}`, message: `Unknown key "${key}".` });
    }
  }
}

function validateId(value: string, path: string, errors: ProtocolError[]): void {
  if (!isId(value)) {
    errors.push({ path, message: "Id must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens." });
  }
}

function derivePoolPositions(
  pools: Record<PoolId, Pool>,
  slotPositions: Record<SlotId, DerivedPosition>
): Record<PoolId, DerivedPosition> {
  const slotValues = Object.values(slotPositions);
  const minX = Math.min(...slotValues.map((position) => position.x));
  const minY = Math.min(...slotValues.map((position) => position.y));

  return Object.fromEntries(
    Object.keys(pools).sort().map((poolId, index) => [
      poolId,
      {
        x: minX - 2,
        y: minY + index
      }
    ])
  );
}

function cloneBody(body: Body): Body {
  return {
    root: body.root,
    slots: Object.fromEntries(Object.entries(body.slots).map(([id, slot]) => [id, cloneSlot(slot)])),
    pools: Object.fromEntries(Object.entries(body.pools).map(([id, pool]) => [id, clonePool(pool)]))
  };
}

function cloneSlot(slot: BodySlot): BodySlot {
  return {
    ...slot,
    accepts: cloneAcceptTokens(slot.accepts),
    contains: cloneContainedElements(slot.contains),
    ports: slot.ports ? Object.fromEntries(typedEntries(slot.ports).map(([side, port]) => [side, port ? { ...port } : undefined])) : undefined
  };
}

function clonePool(pool: Pool): Pool {
  return {
    ...pool,
    accepts: cloneAcceptTokens(pool.accepts),
    contains: cloneContainedElements(pool.contains)
  };
}

function cloneAcceptTokens(tokens: readonly AcceptToken[] | undefined): AcceptToken[] | undefined {
  return tokens ? tokens.map((token) => ({ ...token })) : undefined;
}

function cloneContainedElements(elements: readonly ContainedElement[] | undefined): ContainedElement[] | undefined {
  return elements ? elements.map((element) => ({ ...element, data: cloneJsonValue(element.data) })) : undefined;
}

function cloneJsonValue(value: JsonValue | undefined): JsonValue | undefined {
  if (Array.isArray(value)) return value.map((item) => cloneJsonValue(item) as JsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item as JsonValue) as JsonValue]));
  }
  return value;
}

function clearPort(body: Body, endpoint: Endpoint): void {
  const current = body.slots[endpoint.slot].ports?.[endpoint.side];
  if (!current) return;

  delete body.slots[endpoint.slot].ports?.[endpoint.side];
  const reciprocal = body.slots[current.slot]?.ports;
  if (reciprocal?.[current.side]?.slot === endpoint.slot && reciprocal[current.side]?.side === endpoint.side) {
    delete reciprocal[current.side];
  }
}

function setPort(body: Body, from: Endpoint, to: Endpoint): void {
  const slot = body.slots[from.slot];
  slot.ports = slot.ports ?? {};
  slot.ports[from.side] = { slot: to.slot, side: to.side };
}

function assertEndpoint(body: Body, endpoint: Endpoint, label: string): void {
  if (!body.slots[endpoint.slot]) throw new Error(`${label} references missing slot "${endpoint.slot}".`);
  if (!isSide(endpoint.side)) throw new Error(`${label} side must be top, right, bottom, or left.`);
}

function nextSlotId(body: Body): SlotId {
  let index = 1;
  while (body.slots[`slot-${index}`] || body.pools[`slot-${index}`]) index += 1;
  return `slot-${index}`;
}

function nextPoolId(body: Body): PoolId {
  let index = 1;
  while (body.pools[`pool-${index}`] || body.slots[`pool-${index}`]) index += 1;
  return `pool-${index}`;
}

function assertAvailableId(body: Body, id: string): void {
  if (!isId(id)) {
    throw new Error(`Id "${id}" must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.`);
  }
  if (body.slots[id] || body.pools[id]) {
    throw new Error(`Id "${id}" is already used by an existing slot or pool.`);
  }
}

function connectionThroughSlot(
  connection: Connection,
  slotId: SlotId
): { deleted: Endpoint; neighbor: Endpoint } | null {
  if (connection.from.slot === slotId) {
    return { deleted: connection.from, neighbor: connection.to };
  }
  if (connection.to.slot === slotId) {
    return { deleted: connection.to, neighbor: connection.from };
  }
  return null;
}

function canonicalConnectionKey(a: Endpoint, b: Endpoint): string {
  return [`${a.slot}:${a.side}`, `${b.slot}:${b.side}`].sort().join("|");
}

function positionKey(position: DerivedPosition): string {
  return `${position.x},${position.y}`;
}

function typedEntries<T>(input: Partial<Record<Side, T>>): [Side, T | undefined][] {
  return Object.entries(input) as [Side, T | undefined][];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isSide(value: unknown): value is Side {
  return typeof value === "string" && SIDE_SET.has(value);
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null) return true;
  const type = typeof value;
  if (type === "string" || type === "boolean") return true;
  if (type === "number") return Number.isFinite(value);
  if (type !== "object") return false;

  if (seen.has(value as object)) return false;
  seen.add(value as object);

  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, seen));
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => isJsonValue(item, seen));
}
