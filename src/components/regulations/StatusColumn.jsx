import { Draggable, Droppable } from "@hello-pangea/dnd";
import RegulationCard from "./RegulationCard";
import { cn } from "@/lib/utils";

export default function StatusColumn({ status, regulations, onOpen }) {
  return (
    <div className="flex w-[272px] shrink-0 flex-col">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className={cn("h-2 w-2 rounded-full", status.tone)} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/60">
          {status.label}
        </h3>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {regulations.length}
        </span>
      </div>

      <Droppable droppableId={status.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex min-h-[150px] flex-1 flex-col gap-2 rounded-xl p-1.5 transition-colors",
              snapshot.isDraggingOver && "bg-brand/15 ring-1 ring-brand/50"
            )}
          >
            {regulations.map((regulation, index) => (
              <Draggable key={regulation.id} draggableId={regulation.id} index={index}>
                {(dragProvided) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    style={dragProvided.draggableProps.style}
                  >
                    <RegulationCard regulation={regulation} onOpen={onOpen} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}