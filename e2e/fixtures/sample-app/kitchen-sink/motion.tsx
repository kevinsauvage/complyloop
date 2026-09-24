/**
 * Deliberate pointer / motion violations (kitchen-sink fixture).
 * Each block is tagged with the check id it must trigger.
 */
export function KitchenSinkMotion({ onTilt }: { onTilt: () => void }) {
  if (typeof window !== "undefined") {
    /* kitchen-sink: motion-actuation */
    window.addEventListener("deviceorientation", onTilt);
  }
  return (
    <div>
      {/* kitchen-sink: dragging */}
      <div draggable onDragStart={() => {}}>
        Drag me
      </div>
      {/* kitchen-sink: pointer-cancellation */}
      <div onPointerDown={start}>Press me</div>
      {/* kitchen-sink: pointer-gesture */}
      <div onPointerDown={() => dragCanvas()}>Swipe area</div>
    </div>
  );
}

function start() {}

function dragCanvas() {}
