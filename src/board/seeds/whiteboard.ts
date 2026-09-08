import type { ExcalidrawDocument } from "~/board/whiteboard-document";

export function createReleaseWhiteboard(): ExcalidrawDocument {
  const base = {
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    seed: 42,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    index: null,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 0,
    link: null,
    locked: false,
  };
  const stages = [
    "Prepare\nScope + changelog",
    "Verify\nTests + smoke check",
    "Ship\nTag + deploy",
    "Observe\nErrors + feedback",
  ];
  return {
    type: "excalidraw",
    version: 1,
    elements: stages.flatMap((text, index) => {
      const x = index * 270;
      return [
        {
          ...structuredClone(base),
          id: `release-stage-${index}`,
          type: "rectangle",
          x,
          y: 80,
          width: 230,
          height: 110,
          backgroundColor: "#d0ebff",
        },
        {
          ...structuredClone(base),
          id: `release-label-${index}`,
          type: "text",
          x: x + 15,
          y: 110,
          width: 200,
          height: 50,
          text,
          originalText: text,
          fontSize: 18,
          fontFamily: 1,
          lineHeight: 1.25,
          textAlign: "center",
          verticalAlign: "top",
          containerId: null,
          autoResize: true,
        },
        ...(index === stages.length - 1
          ? []
          : [
              {
                ...structuredClone(base),
                id: `release-arrow-${index}`,
                type: "arrow",
                x: x + 235,
                y: 135,
                width: 30,
                height: 0,
                points: [
                  [0, 0],
                  [30, 0],
                ],
                lastCommittedPoint: null,
                startBinding: null,
                endBinding: null,
                startArrowhead: null,
                endArrowhead: "arrow",
              },
            ]),
      ];
    }),
  } satisfies ExcalidrawDocument;
}
