/**
 * A floating clone that follows the pointer during a drag. The clone is the
 * dragged element itself, so whatever the user grabbed is what they see under
 * the cursor — lifted with a soft shadow and a 2% scale.
 */
export type DragGhost = {
  move: (x: number, y: number) => void;
  end: () => void;
};

const SHADOW = "0 26px 60px -18px rgba(0, 0, 0, 0.8)";

export function startDragGhost(
  source: HTMLElement,
  x: number,
  y: number,
): DragGhost {
  const rect = source.getBoundingClientRect();
  const offsetX = x - rect.left;
  const offsetY = y - rect.top;

  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.setAttribute("data-drag-ghost", "true");
  ghost.setAttribute("aria-hidden", "true");
  ghost.removeAttribute("id");
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0",
    top: "0",
    margin: "0",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: "none",
    zIndex: "9999",
    opacity: "0.96",
    transformOrigin: "top left",
    boxShadow: SHADOW,
    borderRadius: "10px",
    willChange: "transform",
  });
  document.body.appendChild(ghost);

  const move = (nextX: number, nextY: number) => {
    ghost.style.transform = `translate(${nextX - offsetX}px, ${
      nextY - offsetY
    }px) scale(1.02)`;
  };
  move(x, y);

  return {
    move,
    end: () => ghost.remove(),
  };
}
