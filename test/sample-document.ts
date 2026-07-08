import type { PaperDollDocument } from "../src/protocol";
import { PAPER_DOLL_PROTOCOL } from "../src/protocol";

export const DEFAULT_DOCUMENT: PaperDollDocument = {
  protocol: PAPER_DOLL_PROTOCOL,
  body: {
    root: "body",
    slots: {
      face: {
        accepts: [{ kind: "item", type: "face" }],
        contains: [{ kind: "item", id: "goggles" }],
        ports: { bottom: { slot: "head", side: "top" } }
      },
      head: {
        accepts: [{ kind: "item", type: "head" }],
        contains: [{ kind: "item", id: "salve-hood" }],
        ports: {
          top: { slot: "face", side: "bottom" },
          bottom: { slot: "body", side: "top" }
        }
      },
      "hands-worn": {
        accepts: [{ kind: "item", type: "hands" }],
        ports: { right: { slot: "left-hand", side: "left" } }
      },
      "left-hand": {
        accepts: [{ kind: "item", type: "weapon" }, { kind: "item", type: "tool" }],
        contains: [{ kind: "item", id: "steel-dagger" }],
        ports: {
          left: { slot: "hands-worn", side: "right" },
          right: { slot: "left-arm", side: "left" }
        }
      },
      "left-arm": {
        accepts: [{ kind: "item", type: "arm" }],
        ports: {
          left: { slot: "left-hand", side: "right" },
          right: { slot: "body", side: "left" }
        }
      },
      body: {
        accepts: [{ kind: "item", type: "body" }],
        contains: [{ kind: "item", id: "wet-recycling-suit" }],
        ports: {
          top: { slot: "head", side: "bottom" },
          left: { slot: "left-arm", side: "right" },
          right: { slot: "right-arm", side: "left" },
          bottom: { slot: "back", side: "top" }
        }
      },
      "right-arm": {
        accepts: [{ kind: "item", type: "arm" }],
        ports: {
          left: { slot: "body", side: "right" },
          right: { slot: "right-hand", side: "left" }
        }
      },
      "right-hand": {
        accepts: [{ kind: "item", type: "weapon" }, { kind: "item", type: "tool" }],
        contains: [{ kind: "item", id: "torch" }],
        ports: { left: { slot: "right-arm", side: "right" } }
      },
      back: {
        accepts: [{ kind: "item", type: "back" }],
        ports: {
          top: { slot: "body", side: "bottom" },
          bottom: { slot: "feet", side: "top" }
        }
      },
      feet: {
        accepts: [{ kind: "item", type: "feet" }],
        contains: [{ kind: "item", id: "leather-moccasins" }],
        ports: {
          top: { slot: "back", side: "bottom" },
          right: { slot: "missile-left", side: "left" }
        }
      },
      "missile-left": {
        accepts: [{ kind: "item", type: "missile" }],
        contains: [{ kind: "item", id: "short-bow" }],
        ports: {
          left: { slot: "feet", side: "right" },
          right: { slot: "missile-right", side: "left" }
        }
      },
      "missile-right": {
        accepts: [{ kind: "item", type: "missile" }],
        contains: [{ kind: "item", id: "quiver" }],
        ports: { left: { slot: "missile-left", side: "right" } }
      }
    },
    pools: {
      floating: {
        accepts: [{ kind: "item", type: "floating" }],
        contains: [{ kind: "item", id: "glowsphere" }]
      },
      thrown: {
        accepts: [{ kind: "item", type: "thrown" }]
      }
    }
  }
};
