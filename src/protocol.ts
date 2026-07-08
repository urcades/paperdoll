export const PAPER_DOLL_PROTOCOL = "paper-doll/v2" as const;

const LEGACY_PROTOCOL = "paper-doll/v1";

export const SIDES = ["top", "right", "bottom", "left"] as const;

export type Side = (typeof SIDES)[number];
export type VesselId = string;

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
  type?: string;
  id?: string;
  data?: JsonValue;
  body?: Body;
};

export type PortAddress = {
  vessel: VesselId;
  side: Side;
};

export type Vessel = {
  accepts?: readonly AcceptToken[];
  contains?: readonly ContainedElement[];
  ports?: Partial<Record<Side, PortAddress>>;
};

export type Body = {
  root: VesselId;
  vessels: Record<VesselId, Vessel>;
};

export type PaperDollDocument = {
  protocol: typeof PAPER_DOLL_PROTOCOL;
  body: Body;
};

export type Endpoint = {
  vessel: VesselId;
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

export type DerivedLayout = {
  figure: Record<VesselId, DerivedPosition>;
  free: VesselId[];
  connections: Connection[];
};

export type DeleteVesselOptions = {
  collapseOppositeNeighbors?: boolean;
};

export type InsertVesselOptions = {
  id?: VesselId;
  at?: Endpoint;
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

// Parsing and validation

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

  if (input.protocol === LEGACY_PROTOCOL) {
    errors.push({ path: "$.protocol", message: `${LEGACY_PROTOCOL} documents must be migrated. Use migrateV1().` });
  } else if (input.protocol !== PAPER_DOLL_PROTOCOL) {
    errors.push({ path: "$.protocol", message: `Expected "${PAPER_DOLL_PROTOCOL}".` });
  }

  validateKnownKeys(input, ["protocol", "body"], "$", errors);
  validateBody(input.body, "$.body", errors);

  return errors;
}

export function migrateV1(input: unknown): Result<PaperDollDocument, ProtocolError[]> {
  const errors: ProtocolError[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: "$", message: "Document must be an object." }] };
  }
  if (input.protocol !== LEGACY_PROTOCOL) {
    errors.push({ path: "$.protocol", message: `Expected "${LEGACY_PROTOCOL}".` });
  }
  const body = input.body;
  if (!isRecord(body) || !isRecord(body.slots) || !isRecord(body.pools)) {
    errors.push({ path: "$.body", message: "Body must be an object with slots and pools." });
    return { ok: false, errors };
  }

  const vessels: Record<string, unknown> = {};
  for (const [id, slot] of Object.entries(body.slots)) {
    vessels[id] = migrateV1Vessel(slot);
  }
  for (const [id, pool] of Object.entries(body.pools)) {
    if (vessels[id] !== undefined) {
      errors.push({ path: `$.body.pools.${id}`, message: `Pool id "${id}" collides with a slot id; vessel ids share one namespace.` });
      continue;
    }
    vessels[id] = migrateV1Vessel(pool);
  }
  if (errors.length > 0) return { ok: false, errors };

  return parseDocument({
    protocol: PAPER_DOLL_PROTOCOL,
    body: { root: body.root, vessels }
  });
}

function migrateV1Vessel(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const { ports, ...rest } = input;
  if (!isRecord(ports)) return rest;

  const migratedPorts = Object.fromEntries(
    Object.entries(ports).map(([side, port]) => [
      side,
      isRecord(port) ? { vessel: port.slot, side: port.side } : port
    ])
  );
  return { ...rest, ports: migratedPorts };
}

// Derivation

export function deriveConnections(body: Body): Connection[] {
  const connections: Connection[] = [];
  const seen = new Set<string>();

  for (const [vesselId, vessel] of Object.entries(body.vessels)) {
    for (const [side, port] of typedEntries(vessel.ports ?? {})) {
      if (!port) continue;
      const key = canonicalConnectionKey({ vessel: vesselId, side }, { vessel: port.vessel, side: port.side });
      if (seen.has(key)) continue;
      seen.add(key);
      connections.push({
        from: { vessel: vesselId, side },
        to: { vessel: port.vessel, side: port.side }
      });
    }
  }

  return connections;
}

export function deriveLayout(body: Body): DerivedLayout {
  const result = deriveLayoutResult(body, "$.body");
  if (!result.ok) throw new Error(formatProtocolErrors(result.errors));
  return result.value;
}

function deriveLayoutResult(body: Body, path: string): Result<DerivedLayout, ProtocolError[]> {
  const errors: ProtocolError[] = [];
  const figure: Record<VesselId, DerivedPosition> = {};
  const occupied = new Map<string, VesselId>();
  const queue: VesselId[] = [body.root];

  figure[body.root] = { x: 0, y: 0 };
  occupied.set(positionKey(figure[body.root]), body.root);

  while (queue.length > 0) {
    const vesselId = queue.shift();
    if (!vesselId) continue;

    const vessel = body.vessels[vesselId];
    const sourcePosition = figure[vesselId];

    for (const [side, target] of typedEntries(vessel.ports ?? {})) {
      if (!target) continue;
      const vector = SIDE_VECTORS[side];
      const expected = {
        x: sourcePosition.x + vector.x,
        y: sourcePosition.y + vector.y
      };
      const existing = figure[target.vessel];

      if (existing) {
        if (existing.x !== expected.x || existing.y !== expected.y) {
          errors.push({
            path: `${path}.vessels.${vesselId}.ports.${side}`,
            message: `Connection implies ${target.vessel} at ${expected.x},${expected.y}, but it already resolves to ${existing.x},${existing.y}.`
          });
        }
        continue;
      }

      const key = positionKey(expected);
      const collidingVessel = occupied.get(key);
      if (collidingVessel) {
        errors.push({
          path: `${path}.vessels.${vesselId}.ports.${side}`,
          message: `Layout collision: ${target.vessel} and ${collidingVessel} both resolve to ${key}.`
        });
        continue;
      }

      figure[target.vessel] = expected;
      occupied.set(key, target.vessel);
      queue.push(target.vessel);
    }
  }

  const free: VesselId[] = [];
  for (const [vesselId, vessel] of Object.entries(body.vessels)) {
    if (figure[vesselId]) continue;
    if (hasPorts(vessel)) {
      errors.push({
        path: `${path}.vessels.${vesselId}`,
        message: `Ported vessel is not reachable from root "${body.root}". Free vessels must have no ports.`
      });
      continue;
    }
    free.push(vesselId);
  }
  free.sort();

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      figure,
      free,
      connections: deriveConnections(body)
    }
  };
}

// Compatibility

export function matches(token: AcceptToken, element: ContainedElement): boolean {
  return token.kind === element.kind && (token.type === undefined || token.type === element.type);
}

export function isAccepted(
  container: { accepts?: readonly AcceptToken[] },
  element: ContainedElement
): boolean {
  if (container.accepts === undefined) return true;
  return container.accepts.some((token) => matches(token, element));
}

// Topology operations

export function connect(body: Body, from: Endpoint, to: Endpoint): Body {
  assertEndpoint(body, from, "from");
  assertEndpoint(body, to, "to");
  if (from.vessel === to.vessel) {
    throw new Error(`Cannot connect vessel "${from.vessel}" to itself.`);
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

export function insertVessel(
  body: Body,
  vessel: Omit<Vessel, "ports"> = {},
  options: InsertVesselOptions = {}
): { body: Body; vesselId: VesselId } {
  const vesselId = options.id ?? nextVesselId(body);
  assertAvailableId(body, vesselId);

  const base = cloneBody(body);
  let next: Body = {
    ...base,
    vessels: {
      ...base.vessels,
      [vesselId]: cloneVessel(vessel)
    }
  };

  if (options.at) {
    const at = options.at;
    assertEndpoint(body, at, "at");
    const prior = body.vessels[at.vessel]?.ports?.[at.side];
    if (prior) {
      next = connect(next, { vessel: vesselId, side: at.side }, prior);
    }
    next = connect(next, at, { vessel: vesselId, side: OPPOSITE_SIDES[at.side] });
  }

  return { body: next, vesselId };
}

export function deleteVessel(body: Body, vesselId: VesselId, options: DeleteVesselOptions = {}): Body {
  if (vesselId === body.root) throw new Error(`Cannot delete root vessel "${vesselId}".`);
  if (!body.vessels[vesselId]) throw new Error(`Vessel "${vesselId}" does not exist.`);

  const deletedConnections = deriveConnections(body)
    .map((connection) => connectionThroughVessel(connection, vesselId))
    .filter((connection): connection is { deleted: Endpoint; neighbor: Endpoint } => Boolean(connection));
  const next = cloneBody(body);

  delete next.vessels[vesselId];

  for (const vessel of Object.values(next.vessels)) {
    for (const side of SIDES) {
      if (vessel.ports?.[side]?.vessel === vesselId) {
        delete vessel.ports[side];
      }
    }
  }

  const [first, second] = deletedConnections;
  if (
    options.collapseOppositeNeighbors &&
    deletedConnections.length === 2 &&
    first &&
    second &&
    first.neighbor.vessel !== second.neighbor.vessel &&
    first.deleted.side === OPPOSITE_SIDES[second.deleted.side]
  ) {
    return connect(next, first.neighbor, second.neighbor);
  }

  return next;
}

// Containment operations

export function insertElement(body: Body, vesselId: VesselId, element: ContainedElement): Body {
  const vessel = getVessel(body, vesselId);
  assertElement(element);
  assertAccepted(vessel, element, vesselId);

  const next = cloneBody(body);
  const container = next.vessels[vesselId];
  container.contains = [...(container.contains ?? []), cloneElement(element)];
  return next;
}

export function removeElement(
  body: Body,
  vesselId: VesselId,
  index: number
): { body: Body; element: ContainedElement } {
  const elements = getVessel(body, vesselId).contains ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= elements.length) {
    throw new Error(`No element at index ${index} in vessel "${vesselId}".`);
  }

  const next = cloneBody(body);
  const container = next.vessels[vesselId];
  const remaining = [...(container.contains ?? [])];
  const [removed] = remaining.splice(index, 1);
  container.contains = remaining;
  return { body: next, element: removed as ContainedElement };
}

export function moveElement(body: Body, from: VesselId, index: number, to: VesselId): Body {
  const elements = getVessel(body, from).contains ?? [];
  const element = elements[index];
  if (!Number.isInteger(index) || !element) {
    throw new Error(`No element at index ${index} in vessel "${from}".`);
  }
  assertAccepted(getVessel(body, to), element, to);

  const next = cloneBody(body);
  const source = next.vessels[from];
  const remaining = [...(source.contains ?? [])];
  const [moved] = remaining.splice(index, 1);
  source.contains = remaining;
  const destination = next.vessels[to];
  destination.contains = [...(destination.contains ?? []), moved as ContainedElement];
  return next;
}

// Validation internals

function validateBody(input: unknown, path: string, errors: ProtocolError[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Body must be an object." });
    return;
  }

  if (input.slots !== undefined) {
    errors.push({ path: `${path}.slots`, message: "body.slots was removed in paper-doll/v2. Use body.vessels (see migrateV1)." });
  }
  if (input.pools !== undefined) {
    errors.push({ path: `${path}.pools`, message: "body.pools was removed in paper-doll/v2. Use body.vessels (see migrateV1)." });
  }

  validateKnownKeys(input, ["root", "vessels", "slots", "pools"], path, errors);

  if (!isId(input.root)) {
    errors.push({ path: `${path}.root`, message: "Root must be a valid vessel id." });
  }

  if (!isRecord(input.vessels)) {
    errors.push({ path: `${path}.vessels`, message: "Vessels must be an object keyed by vessel id." });
    return;
  }

  if (isId(input.root) && !input.vessels[input.root]) {
    errors.push({ path: `${path}.root`, message: `Root vessel "${input.root}" does not exist.` });
  }

  for (const [vesselId, vessel] of Object.entries(input.vessels)) {
    validateId(vesselId, `${path}.vessels.${vesselId}`, errors);
    validateVessel(vessel, `${path}.vessels.${vesselId}`, errors);
  }

  if (errors.length > 0) return;

  const body = input as unknown as Body;
  validatePorts(body, path, errors);

  if (errors.length > 0) return;

  const layoutResult = deriveLayoutResult(body, path);
  if (!layoutResult.ok) errors.push(...layoutResult.errors);
}

function validateVessel(input: unknown, path: string, errors: ProtocolError[]): void {
  if (!isRecord(input)) {
    errors.push({ path, message: "Vessel must be an object." });
    return;
  }

  validateKnownKeys(input, ["accepts", "contains", "ports"], path, errors);

  const before = errors.length;
  validateAcceptTokens(input.accepts, `${path}.accepts`, errors);
  validateContainedElements(input.contains, `${path}.contains`, errors);
  const structurallyValid = errors.length === before;

  if (structurallyValid && input.accepts !== undefined) {
    const vessel = input as Vessel;
    (vessel.contains ?? []).forEach((element, index) => {
      if (!isAccepted(vessel, element)) {
        const label = element.type ? `${element.kind}/${element.type}` : element.kind;
        errors.push({
          path: `${path}.contains.${index}`,
          message: `Element "${label}" does not match any accept token of this vessel.`
        });
      }
    });
  }

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

function validatePorts(body: Body, path: string, errors: ProtocolError[]): void {
  for (const [vesselId, vessel] of Object.entries(body.vessels)) {
    for (const [side, port] of typedEntries(vessel.ports ?? {})) {
      if (!port) continue;
      const portPath = `${path}.vessels.${vesselId}.ports.${side}`;

      if (!body.vessels[port.vessel]) {
        errors.push({ path: portPath, message: `References missing vessel "${port.vessel}".` });
        continue;
      }

      if (port.side !== OPPOSITE_SIDES[side]) {
        errors.push({
          path: portPath,
          message: `Connections must be face-opposite; ${side} must connect to ${OPPOSITE_SIDES[side]}.`
        });
      }

      const reciprocal = body.vessels[port.vessel]?.ports?.[port.side];
      if (!reciprocal || reciprocal.vessel !== vesselId || reciprocal.side !== side) {
        errors.push({
          path: portPath,
          message: `Must be reciprocated by ${port.vessel}.${port.side}.`
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

  validateKnownKeys(input, ["vessel", "side"], path, errors);
  if (!isId(input.vessel)) {
    errors.push({ path: `${path}.vessel`, message: "Port vessel must be a valid vessel id." });
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

  validateKnownKeys(value, ["kind", "type", "id", "data", "body"], path, errors);
  if (!isId(value.kind)) {
    errors.push({ path: `${path}.kind`, message: "Contained element kind must be a lowercase id." });
  }
  if (value.type !== undefined && !isId(value.type)) {
    errors.push({ path: `${path}.type`, message: "Contained element type must be a lowercase id." });
  }
  if (value.id !== undefined && typeof value.id !== "string") {
    errors.push({ path: `${path}.id`, message: "Contained element id must be a string." });
  }
  if (value.data !== undefined && !isJsonValue(value.data)) {
    errors.push({ path: `${path}.data`, message: "Contained element data must be JSON-compatible." });
  }
  if (value.body !== undefined) {
    validateBody(value.body, `${path}.body`, errors);
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

// Operation internals

function getVessel(body: Body, vesselId: VesselId): Vessel {
  const vessel = body.vessels[vesselId];
  if (!vessel) throw new Error(`Vessel "${vesselId}" does not exist.`);
  return vessel;
}

function assertElement(element: ContainedElement): void {
  if (!isId(element.kind)) {
    throw new Error("Contained element kind must be a lowercase id.");
  }
  if (element.type !== undefined && !isId(element.type)) {
    throw new Error("Contained element type must be a lowercase id.");
  }
  if (element.body !== undefined) {
    const errors: ProtocolError[] = [];
    validateBody(element.body, "$.element.body", errors);
    if (errors.length > 0) {
      throw new Error(formatProtocolErrors(errors));
    }
  }
}

function assertAccepted(vessel: Vessel, element: ContainedElement, vesselId: VesselId): void {
  if (!isAccepted(vessel, element)) {
    const label = element.type ? `${element.kind}/${element.type}` : element.kind;
    throw new Error(`Element "${label}" is not accepted by vessel "${vesselId}".`);
  }
}

function assertEndpoint(body: Body, endpoint: Endpoint, label: string): void {
  if (!body.vessels[endpoint.vessel]) throw new Error(`${label} references missing vessel "${endpoint.vessel}".`);
  if (!isSide(endpoint.side)) throw new Error(`${label} side must be top, right, bottom, or left.`);
}

function assertAvailableId(body: Body, id: string): void {
  if (!isId(id)) {
    throw new Error(`Id "${id}" must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.`);
  }
  if (body.vessels[id]) {
    throw new Error(`Id "${id}" is already used by an existing vessel.`);
  }
}

function nextVesselId(body: Body): VesselId {
  let index = 1;
  while (body.vessels[`vessel-${index}`]) index += 1;
  return `vessel-${index}`;
}

function hasPorts(vessel: Vessel): boolean {
  return Object.values(vessel.ports ?? {}).some(Boolean);
}

function clearPort(body: Body, endpoint: Endpoint): void {
  const current = body.vessels[endpoint.vessel].ports?.[endpoint.side];
  if (!current) return;

  delete body.vessels[endpoint.vessel].ports?.[endpoint.side];
  const reciprocal = body.vessels[current.vessel]?.ports;
  if (reciprocal?.[current.side]?.vessel === endpoint.vessel && reciprocal[current.side]?.side === endpoint.side) {
    delete reciprocal[current.side];
  }
}

function setPort(body: Body, from: Endpoint, to: Endpoint): void {
  const vessel = body.vessels[from.vessel];
  vessel.ports = vessel.ports ?? {};
  vessel.ports[from.side] = { vessel: to.vessel, side: to.side };
}

function connectionThroughVessel(
  connection: Connection,
  vesselId: VesselId
): { deleted: Endpoint; neighbor: Endpoint } | null {
  if (connection.from.vessel === vesselId) {
    return { deleted: connection.from, neighbor: connection.to };
  }
  if (connection.to.vessel === vesselId) {
    return { deleted: connection.to, neighbor: connection.from };
  }
  return null;
}

function canonicalConnectionKey(a: Endpoint, b: Endpoint): string {
  return [`${a.vessel}:${a.side}`, `${b.vessel}:${b.side}`].sort().join("|");
}

function positionKey(position: DerivedPosition): string {
  return `${position.x},${position.y}`;
}

// Cloning

function cloneBody(body: Body): Body {
  return {
    root: body.root,
    vessels: Object.fromEntries(Object.entries(body.vessels).map(([id, vessel]) => [id, cloneVessel(vessel)]))
  };
}

function cloneVessel(vessel: Vessel): Vessel {
  const next: Vessel = { ...vessel };
  if (vessel.accepts) next.accepts = vessel.accepts.map((token) => ({ ...token }));
  if (vessel.contains) next.contains = vessel.contains.map(cloneElement);
  if (vessel.ports) {
    next.ports = Object.fromEntries(
      typedEntries(vessel.ports).map(([side, port]) => [side, port ? { ...port } : undefined])
    );
  }
  return next;
}

function cloneElement(element: ContainedElement): ContainedElement {
  const next: ContainedElement = { ...element };
  if (element.data !== undefined) next.data = cloneJsonValue(element.data);
  if (element.body !== undefined) next.body = cloneBody(element.body);
  return next;
}

function cloneJsonValue(value: JsonValue | undefined): JsonValue | undefined {
  if (Array.isArray(value)) return value.map((item) => cloneJsonValue(item) as JsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item as JsonValue) as JsonValue]));
  }
  return value;
}

// Predicates

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
