import { describe, expect, it } from "vitest";
import {
  connect,
  deleteVessel,
  deriveLayout,
  disconnect,
  insertElement,
  insertVessel,
  isAccepted,
  matches,
  migrateV1,
  migrateV2,
  moveElement,
  parseDocument,
  removeElement,
  resolveAddress,
  type PaperDollDocument
} from "../src/protocol";
import { DEFAULT_DOCUMENT, LEGACY_V1_DOCUMENT } from "./sample-document";

function cloneDocument(overrides: Partial<PaperDollDocument> = {}): PaperDollDocument {
  return {
    ...structuredClone(DEFAULT_DOCUMENT),
    ...overrides
  };
}

function errorMessages(result: ReturnType<typeof parseDocument>): string {
  return result.ok ? "" : result.errors.map((error) => error.message).join("\n");
}

describe("paper doll protocol v3", () => {
  it("accepts the v3 sample document", () => {
    const parsed = parseDocument(DEFAULT_DOCUMENT);
    expect(errorMessages(parsed)).toBe("");
    expect(parsed.ok).toBe(true);
  });

  it("derives figure coordinates and sorted free vessels", () => {
    const layout = deriveLayout(DEFAULT_DOCUMENT.body);

    expect(layout.figure.body).toEqual({ x: 0, y: 0 });
    expect(layout.figure.head).toEqual({ x: 0, y: -1 });
    expect(layout.figure.face).toEqual({ x: 0, y: -2 });
    expect(layout.figure["left-arm"]).toEqual({ x: -1, y: 0 });
    expect(layout.figure.feet).toEqual({ x: 0, y: 2 });
    expect(layout.figure.floating).toBeUndefined();
    expect(layout.free).toEqual(["floating", "thrown"]);
  });

  it("rejects one-way ports", () => {
    const document = cloneDocument();
    delete document.body.vessels.head.ports?.top;

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("Must be reciprocated");
  });

  it("rejects non-opposite ports", () => {
    const document = cloneDocument();
    document.body.vessels.body.ports!.top = { vessel: "head", side: "left" };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("face-opposite");
  });

  it("rejects rooted layout collisions", () => {
    const document: PaperDollDocument = {
      protocol: "paper-doll/v3",
      body: {
        root: "body",
        vessels: {
          body: {
            ports: {
              top: { vessel: "head", side: "bottom" },
              right: { vessel: "arm", side: "left" }
            }
          },
          head: {
            ports: {
              bottom: { vessel: "body", side: "top" },
              right: { vessel: "hand", side: "left" }
            }
          },
          arm: {
            ports: {
              left: { vessel: "body", side: "right" },
              bottom: { vessel: "hand", side: "top" }
            }
          },
          hand: {
            ports: {
              left: { vessel: "head", side: "right" },
              top: { vessel: "arm", side: "bottom" }
            }
          }
        }
      }
    };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("already resolves");
  });

  it("allows free vessels but rejects unreachable ported vessels", () => {
    const document = cloneDocument();
    document.body.vessels.cargo = { accepts: [{ kind: "item", type: "cargo" }] };
    expect(parseDocument(document).ok).toBe(true);

    const stranded = cloneDocument();
    stranded.body.vessels.orphan = { ports: { top: { vessel: "ghost", side: "bottom" } } };
    const parsed = parseDocument(stranded);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain('missing vessel "ghost"');
  });

  it("rejects a reciprocated island disconnected from the root", () => {
    const document = cloneDocument();
    document.body.vessels["island-a"] = { ports: { right: { vessel: "island-b", side: "left" } } };
    document.body.vessels["island-b"] = { ports: { left: { vessel: "island-a", side: "right" } } };

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("Ported vessel is not reachable from root");
  });

  it("rejects legacy v1 documents and points at migrateV1", () => {
    const parsed = parseDocument(LEGACY_V1_DOCUMENT);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("migrateV1");
    expect(errorMessages(parsed)).toContain("body.slots was removed");
    expect(errorMessages(parsed)).toContain("body.pools was removed");
  });

  it("migrates v1 documents, merging slots and pools into vessels", () => {
    const migrated = migrateV1(LEGACY_V1_DOCUMENT);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;

    const { body } = migrated.value;
    expect(migrated.value.protocol).toBe("paper-doll/v3");
    expect(Object.keys(body.vessels).sort()).toEqual(["body", "floating", "head"]);
    expect(body.vessels.body.ports?.top).toEqual({ vessel: "head", side: "bottom" });
    expect(body.vessels.floating.contains).toEqual([{ kind: "item", type: "floating", id: "glowsphere" }]);
    expect(deriveLayout(body).free).toEqual(["floating"]);
  });

  it("migrateV1 reports slot/pool id collisions", () => {
    const legacy = structuredClone(LEGACY_V1_DOCUMENT);
    legacy.body.pools = { ...legacy.body.pools, head: {} } as typeof legacy.body.pools;

    const migrated = migrateV1(legacy);
    expect(migrated.ok).toBe(false);
    if (migrated.ok) return;
    expect(migrated.errors[0].message).toContain("collides with a slot id");
  });

  it("rejects v2 documents and points at migrateV2, which migrates them", () => {
    const v2 = structuredClone(DEFAULT_DOCUMENT) as unknown as Record<string, unknown>;
    v2.protocol = "paper-doll/v2";

    const parsed = parseDocument(v2);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("migrateV2");

    const migrated = migrateV2(v2);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.protocol).toBe("paper-doll/v3");
    expect(migrated.value.body).toEqual(DEFAULT_DOCUMENT.body);
  });

  it("law 8: rejects duplicate element ids within a vessel", () => {
    const document = cloneDocument();
    document.body.vessels["left-hand"].contains = [
      { kind: "item", type: "weapon", id: "steel-dagger" },
      { kind: "item", type: "weapon", id: "steel-dagger" }
    ];

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain('Duplicate element id "steel-dagger"');

    // same id in different vessels is fine (per-vessel scope)
    const twoVessels = cloneDocument();
    twoVessels.body.vessels["right-hand"].contains = [{ kind: "item", type: "weapon", id: "steel-dagger" }];
    expect(parseDocument(twoVessels).ok).toBe(true);
  });

  it("law 8: rejects non-address-safe element ids", () => {
    const document = cloneDocument();
    document.body.vessels.head.contains = [{ kind: "item", type: "head", id: "Salve Hood/2" }];

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain("address segment");
  });

  it("law 8: insertElement and moveElement refuse id collisions at the destination", () => {
    expect(() =>
      insertElement(DEFAULT_DOCUMENT.body, "left-hand", { kind: "item", type: "weapon", id: "steel-dagger" })
    ).toThrow('already used in vessel "left-hand" (law 8)');

    const armed = insertElement(DEFAULT_DOCUMENT.body, "right-hand", {
      kind: "item",
      type: "weapon",
      id: "steel-dagger"
    });
    expect(() => moveElement(armed, "left-hand", 0, "right-hand")).toThrow("(law 8)");
  });

  it("resolves vessel, element, and nested addresses", () => {
    const body = DEFAULT_DOCUMENT.body;

    const vessel = resolveAddress(body, "left-hand");
    expect(vessel).toMatchObject({ kind: "vessel", vesselId: "left-hand" });

    const element = resolveAddress(body, "left-hand/steel-dagger");
    expect(element).toMatchObject({
      kind: "element",
      vesselId: "left-hand",
      index: 0,
      element: { id: "steel-dagger" }
    });

    const nested = resolveAddress(body, "back/field-pack/main-pocket/rope");
    expect(nested).toMatchObject({ kind: "element", vesselId: "main-pocket", element: { id: "rope" } });
    const nestedVessel = resolveAddress(body, "back/field-pack/side-pocket");
    expect(nestedVessel).toMatchObject({ kind: "vessel", vesselId: "side-pocket" });
  });

  it("addresses are stable under reordering, and misses return null", () => {
    // remove the first element of right-hand, then address the dagger inserted after it
    const armed = insertElement(DEFAULT_DOCUMENT.body, "right-hand", {
      kind: "item",
      type: "weapon",
      id: "dagger-two"
    });
    const shuffled = removeElement(armed, "right-hand", 0).body;
    expect(resolveAddress(shuffled, "right-hand/dagger-two")).toMatchObject({ kind: "element", index: 0 });

    expect(resolveAddress(DEFAULT_DOCUMENT.body, "ghost")).toBeNull();
    expect(resolveAddress(DEFAULT_DOCUMENT.body, "left-hand/ghost")).toBeNull();
    expect(resolveAddress(DEFAULT_DOCUMENT.body, "feet/leather-moccasins/sole")).toBeNull(); // no embedded body
    expect(() => resolveAddress(DEFAULT_DOCUMENT.body, "Left Hand//x")).toThrow("lowercase ids");
  });

  it("enforces the compatibility law in validation", () => {
    const document = cloneDocument();
    document.body.vessels.head.contains = [{ kind: "item", type: "boot", id: "wader" }];

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    expect(errorMessages(parsed)).toContain('Element "item/boot" does not match any accept token');
  });

  it("treats absent accepts as open and empty accepts as sealed", () => {
    expect(isAccepted({}, { kind: "item" })).toBe(true);
    expect(isAccepted({ accepts: [] }, { kind: "item" })).toBe(false);
    expect(matches({ kind: "item" }, { kind: "item", type: "hat" })).toBe(true);
    expect(matches({ kind: "item", type: "hat" }, { kind: "item" })).toBe(false);

    const sealed = cloneDocument();
    sealed.body.vessels.thrown.accepts = [];
    expect(parseDocument(sealed).ok).toBe(true);

    sealed.body.vessels.thrown.contains = [{ kind: "item", type: "thrown" }];
    expect(errorMessages(parseDocument(sealed))).toContain("does not match any accept token");
  });

  it("validates embedded bodies recursively", () => {
    const document = cloneDocument();
    const pack = document.body.vessels.back.contains![0];
    expect(pack.body).toBeDefined();

    const broken = cloneDocument();
    const brokenPack = broken.body.vessels.back.contains![0] as { body: { vessels: Record<string, unknown> } };
    brokenPack.body.vessels["main-pocket"] = {
      ...(brokenPack.body.vessels["main-pocket"] as object),
      contains: [{ kind: "Item" }]
    };

    const parsed = parseDocument(broken);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors[0].path).toContain(".contains.0.body.vessels.main-pocket");
  });

  it("rejects unknown keys at every level", () => {
    const document = cloneDocument() as unknown as Record<string, any>;
    document.icon = "sparkles";
    document.body.view = "front";
    document.body.vessels.body.label = "Torso";

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    const messages = errorMessages(parsed);
    expect(messages).toContain('Unknown key "icon"');
    expect(messages).toContain('Unknown key "view"');
    expect(messages).toContain('Unknown key "label"');
  });

  it("parseDocument returns a defensive copy of the input", () => {
    const input = structuredClone(DEFAULT_DOCUMENT);
    const parsed = parseDocument(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    input.body.vessels.body.contains = [{ kind: "item", type: "body", id: "mutated" }];
    expect(parsed.value.body.vessels.body.contains).toEqual([
      { kind: "item", type: "body", id: "wet-recycling-suit" }
    ]);
  });

  it("connects immutably and rejects invalid connections", () => {
    const body = {
      root: "body",
      vessels: { body: {}, head: {} }
    };
    const before = structuredClone(body);
    const { body: connected, displaced } = connect(body, { vessel: "body", side: "top" }, { vessel: "head", side: "bottom" });

    expect(body).toEqual(before);
    expect(displaced).toEqual([]);
    expect(connected.vessels.body.ports?.top).toEqual({ vessel: "head", side: "bottom" });
    expect(connected.vessels.head.ports?.bottom).toEqual({ vessel: "body", side: "top" });

    expect(() => connect(body, { vessel: "body", side: "top" }, { vessel: "head", side: "left" })).toThrow(
      "face-opposite"
    );
    expect(() => connect(body, { vessel: "body", side: "top" }, { vessel: "body", side: "bottom" })).toThrow(
      "to itself"
    );
  });

  it("insertElement at an index and insertVessel bridging report enough to invert", () => {
    // positional insert: removeElement at a middle index is exactly invertible
    const { body: without, element } = removeElement(DEFAULT_DOCUMENT.body, "left-hand", 0);
    const restored = insertElement(without, "left-hand", element, 0);
    expect(restored).toEqual(DEFAULT_DOCUMENT.body);
    expect(() => insertElement(DEFAULT_DOCUMENT.body, "left-hand", { kind: "item", type: "tool" }, 5)).toThrow(
      "out of range"
    );

    // bridged: the connection the bridge replaced is reported
    const bridgedInsert = insertVessel(DEFAULT_DOCUMENT.body, {}, { at: { vessel: "body", side: "right" }, id: "elbow" });
    expect(bridgedInsert.bridged).toEqual({
      from: { vessel: "body", side: "right" },
      to: { vessel: "right-arm", side: "left" }
    });
    const freeInsert = insertVessel(DEFAULT_DOCUMENT.body, {});
    expect(freeInsert.bridged).toBeNull();
  });

  it("insertVessel with an endpoint bridges an occupied connection", () => {
    const bodyBefore = structuredClone(DEFAULT_DOCUMENT.body);
    const result = insertVessel(
      DEFAULT_DOCUMENT.body,
      { accepts: [{ kind: "item", type: "arm" }] },
      { at: { vessel: "body", side: "right" }, id: "elbow" }
    );

    expect(DEFAULT_DOCUMENT.body).toEqual(bodyBefore);
    expect(result.vesselId).toBe("elbow");
    expect(result.body.vessels.body.ports?.right).toEqual({ vessel: "elbow", side: "left" });
    expect(result.body.vessels.elbow.ports?.left).toEqual({ vessel: "body", side: "right" });
    expect(result.body.vessels.elbow.ports?.right).toEqual({ vessel: "right-arm", side: "left" });
    expect(result.body.vessels["right-arm"].ports?.left).toEqual({ vessel: "elbow", side: "right" });
    expect(parseDocument({ ...DEFAULT_DOCUMENT, body: result.body }).ok).toBe(true);
  });

  it("insertVessel without an endpoint creates a free vessel that stays open by default", () => {
    const result = insertVessel(DEFAULT_DOCUMENT.body, { contains: [{ kind: "effect", id: "static-field" }] });

    expect(result.vesselId).toBe("vessel-1");
    expect(result.body.vessels["vessel-1"].accepts).toBeUndefined();
    expect(deriveLayout(result.body).free).toContain("vessel-1");
    expect(parseDocument({ ...DEFAULT_DOCUMENT, body: result.body }).ok).toBe(true);
  });

  it("insertVessel rejects taken or invalid ids", () => {
    expect(() => insertVessel(DEFAULT_DOCUMENT.body, {}, { id: "head" })).toThrow("already used");
    expect(() => insertVessel(DEFAULT_DOCUMENT.body, {}, { id: "Bad_Id" })).toThrow("lowercase");
  });

  it("deleteVessel collapses opposite neighbors and refuses the root", () => {
    const inserted = insertVessel(DEFAULT_DOCUMENT.body, {}, { at: { vessel: "body", side: "right" } });
    const { body: next, vessel, collapsed } = deleteVessel(inserted.body, inserted.vesselId, {
      collapseOppositeNeighbors: true
    });

    expect(next.vessels[inserted.vesselId]).toBeUndefined();
    expect(vessel.ports?.left).toEqual({ vessel: "body", side: "right" });
    expect(vessel.ports?.right).toEqual({ vessel: "right-arm", side: "left" });
    expect(collapsed).toEqual({
      from: { vessel: "body", side: "right" },
      to: { vessel: "right-arm", side: "left" }
    });
    expect(next.vessels.body.ports?.right).toEqual({ vessel: "right-arm", side: "left" });
    expect(next.vessels["right-arm"].ports?.left).toEqual({ vessel: "body", side: "right" });
    expect(parseDocument({ ...DEFAULT_DOCUMENT, body: next }).ok).toBe(true);

    expect(() => deleteVessel(DEFAULT_DOCUMENT.body, "body")).toThrow("Cannot delete root vessel");
  });

  it("deleteVessel removes free vessels", () => {
    const { body: next, vessel, collapsed } = deleteVessel(DEFAULT_DOCUMENT.body, "floating");
    expect(next.vessels.floating).toBeUndefined();
    expect(vessel).toEqual(DEFAULT_DOCUMENT.body.vessels.floating);
    expect(collapsed).toBeNull();
    expect(parseDocument({ ...DEFAULT_DOCUMENT, body: next }).ok).toBe(true);
  });

  it("connect reports displaced connections and disconnect reports the removed one", () => {
    const chain = connect(
      { root: "a", vessels: { a: {}, b: {}, c: {} } },
      { vessel: "a", side: "right" },
      { vessel: "b", side: "left" }
    ).body;

    // rewiring a.right to c displaces the a-b connection
    const rewired = connect(chain, { vessel: "a", side: "right" }, { vessel: "c", side: "left" });
    expect(rewired.displaced).toEqual([
      { from: { vessel: "a", side: "right" }, to: { vessel: "b", side: "left" } }
    ]);
    expect(rewired.body.vessels.b.ports?.left).toBeUndefined();

    const severed = disconnect(chain, { vessel: "b", side: "left" });
    expect(severed.removed).toEqual({
      from: { vessel: "b", side: "left" },
      to: { vessel: "a", side: "right" }
    });
    expect(disconnect(severed.body, { vessel: "b", side: "left" }).removed).toBeNull();
  });

  it("destructive operations return enough to undo themselves", () => {
    // deleteVessel round-trip: re-insert the returned vessel and reconnect its ports
    const original = DEFAULT_DOCUMENT.body;
    const { body: without, vessel } = deleteVessel(original, "missile-right");
    let restored = insertVessel(without, { accepts: vessel.accepts, contains: vessel.contains }, { id: "missile-right" }).body;
    for (const [side, port] of Object.entries(vessel.ports ?? {})) {
      if (port) restored = connect(restored, { vessel: "missile-right", side: side as never }, port).body;
    }
    expect(restored).toEqual(original);

    // disconnect round-trip: reconnect the removed connection
    const cut = disconnect(original, { vessel: "feet", side: "right" });
    expect(cut.removed).not.toBeNull();
    const rejoined = connect(cut.body, cut.removed!.from, cut.removed!.to).body;
    expect(rejoined).toEqual(original);
  });

  it("insertElement always enforces acceptance", () => {
    const before = structuredClone(DEFAULT_DOCUMENT.body);
    const next = insertElement(DEFAULT_DOCUMENT.body, "head", { kind: "item", type: "head", id: "hood" });

    expect(DEFAULT_DOCUMENT.body).toEqual(before);
    expect(next.vessels.head.contains).toHaveLength(2);

    expect(() => insertElement(DEFAULT_DOCUMENT.body, "head", { kind: "item", type: "boot" })).toThrow(
      'Element "item/boot" is not accepted by vessel "head"'
    );
    expect(() => insertElement(DEFAULT_DOCUMENT.body, "ghost", { kind: "item" })).toThrow(
      'Vessel "ghost" does not exist'
    );
  });

  it("insertElement validates embedded bodies", () => {
    const nested = insertElement(DEFAULT_DOCUMENT.body, "left-hand", {
      kind: "item",
      type: "tool",
      id: "toolbox",
      body: { root: "tray", vessels: { tray: {} } }
    });
    expect(nested.vessels["left-hand"].contains).toHaveLength(2);

    expect(() =>
      insertElement(DEFAULT_DOCUMENT.body, "left-hand", {
        kind: "item",
        type: "tool",
        body: { root: "ghost", vessels: {} }
      })
    ).toThrow('Root vessel "ghost" does not exist');
  });

  it("removeElement returns the removed element", () => {
    const { body: next, element } = removeElement(DEFAULT_DOCUMENT.body, "left-hand", 0);

    expect(element).toEqual({ kind: "item", type: "weapon", id: "steel-dagger" });
    expect(next.vessels["left-hand"].contains).toEqual([]);
    expect(() => removeElement(next, "left-hand", 0)).toThrow("No element at index 0");
  });

  it("moveElement is atomic and checks the destination before removing", () => {
    const next = moveElement(DEFAULT_DOCUMENT.body, "left-hand", 0, "right-hand");
    expect(next.vessels["left-hand"].contains).toEqual([]);
    expect(next.vessels["right-hand"].contains).toEqual([
      { kind: "item", type: "tool", id: "torch" },
      { kind: "item", type: "weapon", id: "steel-dagger" }
    ]);

    expect(() => moveElement(DEFAULT_DOCUMENT.body, "left-hand", 0, "head")).toThrow("not accepted");
    expect(DEFAULT_DOCUMENT.body.vessels["left-hand"].contains).toHaveLength(1);
  });
});
