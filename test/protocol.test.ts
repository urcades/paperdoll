import { describe, expect, it } from "vitest";
import {
  connect,
  deletePool,
  deleteSlot,
  deriveLayout,
  insertPool,
  insertSlot,
  parseDocument,
  type PaperDollDocument
} from "../src/protocol";
import { DEFAULT_DOCUMENT } from "./sample-document";

function cloneDocument(overrides: Partial<PaperDollDocument> = {}): PaperDollDocument {
  return {
    ...structuredClone(DEFAULT_DOCUMENT),
    ...overrides
  };
}

function errorMessages(result: ReturnType<typeof parseDocument>): string {
  return result.ok ? "" : result.errors.map((error) => error.message).join("\n");
}

describe("paper doll protocol", () => {
  it("accepts the v1 sample document", () => {
    const parsed = parseDocument(DEFAULT_DOCUMENT);
    expect(parsed.ok).toBe(true);
  });

  it("derives coordinates from the rooted body graph and body-level pools", () => {
    const layout = deriveLayout(DEFAULT_DOCUMENT);

    expect(layout.slots.body).toEqual({ x: 0, y: 0 });
    expect(layout.slots.head).toEqual({ x: 0, y: -1 });
    expect(layout.slots.face).toEqual({ x: 0, y: -2 });
    expect(layout.slots["left-arm"]).toEqual({ x: -1, y: 0 });
    expect(layout.slots.feet).toEqual({ x: 0, y: 2 });
    expect(layout.pools.floating).toEqual({ x: -5, y: -2 });
    expect(layout.pools.thrown).toEqual({ x: -5, y: -1 });
  });

  it("derives pool positions in sorted pool-id order", () => {
    const document = cloneDocument();
    document.body.pools.aura = {};

    const layout = deriveLayout(document);
    expect(layout.pools.aura).toEqual({ x: -5, y: -2 });
    expect(layout.pools.floating).toEqual({ x: -5, y: -1 });
    expect(layout.pools.thrown).toEqual({ x: -5, y: 0 });
    expect(layout.nodes.find((node) => node.id === "floating")).toMatchObject({
      kind: "pool",
      contains: [{ kind: "item", id: "glowsphere" }]
    });
  });

  it("rejects one-way ports", () => {
    const document = cloneDocument();
    delete document.body.slots.head.ports?.top;

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("Must be reciprocated");
  });

  it("rejects non-opposite ports", () => {
    const document = cloneDocument();
    document.body.slots.body.ports!.top = { slot: "head", side: "left" };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("face-opposite");
  });

  it("rejects rooted layout collisions", () => {
    const document: PaperDollDocument = {
      protocol: "paper-doll/v1",
      body: {
        root: "body",
        pools: {},
        slots: {
          body: {
            ports: {
              top: { slot: "head", side: "bottom" },
              right: { slot: "arm", side: "left" }
            }
          },
          head: {
            ports: {
              bottom: { slot: "body", side: "top" },
              right: { slot: "hand", side: "left" }
            }
          },
          arm: {
            ports: {
              left: { slot: "body", side: "right" },
              bottom: { slot: "hand", side: "top" }
            }
          },
          hand: {
            ports: {
              left: { slot: "head", side: "right" },
              top: { slot: "arm", side: "bottom" }
            }
          }
        }
      }
    };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("already resolves");
  });

  it("rejects unreachable physical body slots", () => {
    const document = cloneDocument();
    document.body.slots.unreachable = {};

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("Use body.pools for non-graph containment");
  });

  it("allows multiple explicit body-level pools", () => {
    const document = cloneDocument();
    document.body.pools.aura = { accepts: [{ kind: "effect", type: "aura" }] };
    document.body.pools.cargo = { accepts: [{ kind: "item", type: "cargo" }] };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(true);
  });

  it("confirms pools are edge-less and not graph-reachable", () => {
    const document = cloneDocument();
    document.body.pools.aura = {
      accepts: [{ kind: "effect", type: "aura" }],
      contains: [{ kind: "effect", id: "static-field" }]
    };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(true);
    expect(deriveLayout(document).pools.aura).toEqual({ x: -5, y: -2 });
  });

  it("rejects legacy zones", () => {
    const document = structuredClone(DEFAULT_DOCUMENT) as unknown as Record<string, unknown>;
    const body = document.body as Record<string, unknown>;
    body.zones = { floating: {} };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("body.zones was removed");
  });

  it("rejects legacy equipped", () => {
    const document = structuredClone(DEFAULT_DOCUMENT) as unknown as Record<string, unknown>;
    const body = document.body as Record<string, unknown>;
    body.equipped = { body: "Wet recycling suit" };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("body.equipped was removed");
  });

  it("rejects missing pools", () => {
    const document = structuredClone(DEFAULT_DOCUMENT) as unknown as Record<string, unknown>;
    const body = document.body as Record<string, unknown>;
    delete body.pools;

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("Pools must be an object");
  });

  it("rejects string accepts", () => {
    const document = structuredClone(DEFAULT_DOCUMENT) as unknown as Record<string, unknown>;
    const body = document.body as { slots: Record<string, unknown> };
    body.slots.body = { accepts: ["body"] };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("Accept token must be an object");
  });

  it("rejects invalid accept token kind and type", () => {
    const document = cloneDocument();
    document.body.slots.body.accepts = [{ kind: "Item", type: "wet_suit" }];

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("Accept token kind must be a lowercase id");
    expect(errorMessages(parsed)).toContain("Accept token type must be a lowercase id");
  });

  it("rejects invalid contained element kind", () => {
    const document = cloneDocument();
    document.body.slots.body.contains = [{ kind: "Item", id: "wet-recycling-suit" }];

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("Contained element kind must be a lowercase id");
  });

  it("rejects non-JSON-compatible contained element data", () => {
    const document = cloneDocument();
    document.body.slots.body.contains = [{ kind: "state", data: Number.NaN }];

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("Contained element data must be JSON-compatible");
  });

  it("rejects pools with ports", () => {
    const document = cloneDocument() as unknown as Record<string, unknown>;
    const body = document.body as { pools: Record<string, unknown> };
    body.pools.aura = { ports: { top: { slot: "body", side: "bottom" } } };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("Pools are edge-less");
  });

  it("parseDocument returns a defensive copy of the input", () => {
    const input = structuredClone(DEFAULT_DOCUMENT);
    const parsed = parseDocument(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    input.body.slots.body.contains = [{ kind: "item", id: "mutated" }];
    expect(parsed.value.body.slots.body.contains).toEqual([{ kind: "item", id: "wet-recycling-suit" }]);
  });

  it("rejects unknown keys at document, body, slot, and pool level", () => {
    const document = cloneDocument() as unknown as Record<string, any>;
    document.icon = "sparkles";
    document.body.view = "front";
    document.body.slots.body.label = "Torso";
    document.body.pools.floating.color = "blue";

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    const messages = errorMessages(parsed);
    expect(messages).toContain('Unknown key "icon"');
    expect(messages).toContain('Unknown key "view"');
    expect(messages).toContain('Unknown key "label"');
    expect(messages).toContain('Unknown key "color"');
  });

  it("connect rejects non-opposite faces", () => {
    const body = { root: "body", pools: {}, slots: { body: {}, head: {} } };
    expect(() => connect(body, { slot: "body", side: "top" }, { slot: "head", side: "left" })).toThrow(
      "face-opposite"
    );
  });

  it("connect rejects self-connections", () => {
    const body = { root: "body", pools: {}, slots: { body: {} } };
    expect(() => connect(body, { slot: "body", side: "top" }, { slot: "body", side: "bottom" })).toThrow(
      "to itself"
    );
  });

  it("insertSlot and insertPool accept explicit ids and reject taken or invalid ids", () => {
    const withSlot = insertSlot(DEFAULT_DOCUMENT.body, { slot: "body", side: "right" }, {}, { id: "elbow" });
    expect(withSlot.slotId).toBe("elbow");
    expect(withSlot.body.slots.elbow).toBeDefined();

    const withPool = insertPool(DEFAULT_DOCUMENT.body, {}, { id: "cargo" });
    expect(withPool.poolId).toBe("cargo");

    expect(() => insertSlot(DEFAULT_DOCUMENT.body, { slot: "body", side: "right" }, {}, { id: "head" })).toThrow(
      "already used"
    );
    expect(() => insertPool(DEFAULT_DOCUMENT.body, {}, { id: "Bad_Id" })).toThrow("lowercase");
  });

  it("connects immutably", () => {
    const body = {
      root: "body",
      pools: {},
      slots: {
        body: {},
        head: {}
      }
    };
    const before = structuredClone(body);
    const connected = connect(body, { slot: "body", side: "top" }, { slot: "head", side: "bottom" });

    expect(body).toEqual(before);
    expect(connected.slots.body.ports?.top).toEqual({ slot: "head", side: "bottom" });
    expect(connected.slots.head.ports?.bottom).toEqual({ slot: "body", side: "top" });
  });

  it("insertSlot bridges an occupied connection and preserves containment immutably", () => {
    const bodyBefore = structuredClone(DEFAULT_DOCUMENT.body);
    const result = insertSlot(DEFAULT_DOCUMENT.body, { slot: "body", side: "right" }, {
      accepts: [{ kind: "item", type: "arm" }],
      contains: [{ kind: "module", id: "prosthetic-joint", data: { quality: 2 } }]
    });

    expect(DEFAULT_DOCUMENT.body).toEqual(bodyBefore);
    expect(result.slotId).toBe("slot-1");
    expect(result.body.slots.body.ports?.right).toEqual({ slot: "slot-1", side: "left" });
    expect(result.body.slots["slot-1"].ports?.left).toEqual({ slot: "body", side: "right" });
    expect(result.body.slots["slot-1"].ports?.right).toEqual({ slot: "right-arm", side: "left" });
    expect(result.body.slots["right-arm"].ports?.left).toEqual({ slot: "slot-1", side: "right" });
    expect(result.body.slots["slot-1"].accepts).toEqual([{ kind: "item", type: "arm" }]);
    expect(result.body.slots["slot-1"].contains).toEqual([
      { kind: "module", id: "prosthetic-joint", data: { quality: 2 } }
    ]);
  });

  it("insertPool creates an explicit body-level pool immutably", () => {
    const bodyBefore = structuredClone(DEFAULT_DOCUMENT.body);
    const result = insertPool(DEFAULT_DOCUMENT.body, {
      accepts: [{ kind: "effect", type: "aura" }],
      contains: [{ kind: "effect", id: "static-field" }]
    });

    expect(DEFAULT_DOCUMENT.body).toEqual(bodyBefore);
    expect(result.poolId).toBe("pool-1");
    expect(result.body.pools["pool-1"]).toEqual({
      accepts: [{ kind: "effect", type: "aura" }],
      contains: [{ kind: "effect", id: "static-field" }]
    });
  });

  it("deletePool removes a pool immutably", () => {
    const body = structuredClone(DEFAULT_DOCUMENT.body);
    const next = deletePool(body, "floating");

    expect(body.pools.floating).toBeDefined();
    expect(next.pools.floating).toBeUndefined();
    expect(parseDocument({ ...DEFAULT_DOCUMENT, body: next }).ok).toBe(true);
  });

  it("deleteSlot collapses opposite neighbors through the deleted slot and leaves pools untouched", () => {
    const inserted = insertSlot(DEFAULT_DOCUMENT.body, { slot: "body", side: "right" }, {
      contains: [{ kind: "module", id: "temporary-joint" }]
    });
    const next = deleteSlot(inserted.body, inserted.slotId, { collapseOppositeNeighbors: true });

    expect(next.slots[inserted.slotId]).toBeUndefined();
    expect(next.slots.body.ports?.right).toEqual({ slot: "right-arm", side: "left" });
    expect(next.slots["right-arm"].ports?.left).toEqual({ slot: "body", side: "right" });
    expect(next.pools).toEqual(DEFAULT_DOCUMENT.body.pools);
    expect(parseDocument({ ...DEFAULT_DOCUMENT, body: next }).ok).toBe(true);
  });

  it("deleteSlot refuses to delete the root slot", () => {
    expect(() => deleteSlot(DEFAULT_DOCUMENT.body, "body")).toThrow("Cannot delete root slot");
  });
});
