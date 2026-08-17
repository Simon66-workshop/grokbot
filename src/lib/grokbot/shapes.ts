import type { Point, ShapeId } from "./types";
import {
  blobBody,
  circleBody,
  dotBody,
  eggBody,
  hexBody,
  triangleBody,
} from "./paths";

export const SHAPE_META: { id: ShapeId; name: string; note: string }[] = [
  { id: "circle", name: "Circle", note: "Perfect disc. The rest pose." },
  { id: "blob", name: "Blob", note: "Barely-soft harmonics — optional." },
  { id: "egg", name: "Egg", note: "Vertical taper, narrower at the crown." },
  { id: "hex", name: "Hex", note: "Rounded hexagon, slightly faceted." },
  { id: "triangle", name: "Triangle", note: "Soft 3-gon. Carries the orbit ribbons." },
  { id: "dot", name: "Dot", note: "Collapsed seed. Used for shrink / think." },
];

export function bodyForShape(shape: ShapeId, time = 0): Point[] {
  switch (shape) {
    case "circle":
      return circleBody();
    case "egg":
      return eggBody();
    case "hex":
      return hexBody();
    case "triangle":
      return triangleBody();
    case "dot":
      return dotBody(16);
    case "blob":
    default:
      return blobBody(100, time);
  }
}
