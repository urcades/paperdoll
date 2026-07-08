import { describe, expect, it } from "vitest";
import {
  connect,
  deleteVessel,
  deriveLayout,
  insertElement,
  insertVessel,
  isAccepted,
  matches,
  migrateV1,
  moveElement,
  parseDocument,
  removeElement,
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

describe("paper doll protocol v2", () => {
  it("accepts the v2 sample document", () => {
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
      protocol: "paper-doll/v2",
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
    expect(migrated.value.protocol).toBe("paper-doll/v2");
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
    const connected = connect(body, { vessel: "body", side: "top" }, { vessel: "head", side: "bottom" });

    expect(body).toEqual(before);
    expect(connected.vessels.body.ports?.top).toEqual({ vessel: "head", side: "bottom" });
    expect(connected.vessels.head.ports?.bottom).toEqual({ vessel: "body", side: "top" });

    expect(() => connect(body, { vessel: "body", side: "top" }, { vessel: "head", side: "left" })).toThrow(
      "face-opposite"
    );
    expect(() => connect(body, { vessel: "body", side: "top" }, { vessel: "body", side: "bottom" })).toThrow(
      "to itself"
    );
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
    const next = deleteVessel(inserted.body, inserted.vesselId, { collapseOppositeNeighbors: true });

    expect(next.vessels[inserted.vesselId]).toBeUndefined();
    expect(next.vessels.body.ports?.right).toEqual({ vessel: "right-arm", side: "left" });
    expect(next.vessels["right-arm"].ports?.left).toEqual({ vessel: "body", side: "right" });
    expect(parseDocument({ ...DEFAULT_DOCUMENT, body: next }).ok).toBe(true);

    expect(() => deleteVessel(DEFAULT_DOCUMENT.body, "body")).toThrow("Cannot delete root vessel");
  });

  it("deleteVessel removes free vessels", () => {
    const next = deleteVessel(DEFAULT_DOCUMENT.body, "floating");
    expect(next.vessels.floating).toBeUndefined();
    expect(parseDocument({ ...DEFAULT_DOCUMENT, body: next }).ok).toBe(true);
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
