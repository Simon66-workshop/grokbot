import type { ExpressionDef } from "@/lib/grokbot/expressions";
import { stadiumPath } from "@/lib/grokbot/paths";

function pathD(exprEye: ExpressionDef["left"]) {
  const pts = stadiumPath(exprEye, 24);
  if (!pts.length) return "";
  let d = `M${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += `L${pts[i]!.x.toFixed(1)} ${pts[i]!.y.toFixed(1)}`;
  }
  return d + "Z";
}

export function ExprThumb({ expr }: { expr: ExpressionDef }) {
  const showL = expr.left.alpha > 0.05;
  const showR = expr.right.alpha > 0.05;
  return (
    <svg
      viewBox="-108 -108 216 216"
      className="size-9 shrink-0"
      aria-hidden
    >
      <circle r="100" className="fill-grok" />
      {showL ? <path d={pathD(expr.left)} className="fill-paper" /> : null}
      {showR ? <path d={pathD(expr.right)} className="fill-paper" /> : null}
    </svg>
  );
}
