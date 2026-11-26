import { DragDropContext } from "@hello-pangea/dnd";
import { useNavigate } from "@tanstack/react-router";
import StatusColumn from "./StatusColumn";
import { STATUSES } from "@/lib/regulations";

export default function RegulationBoard({ regulations, onMove }) {
  const navigate = useNavigate();

  const openRegulation = (regulation) =>
    navigate({ to: "/regulations/$regulationId", params: { regulationId: regulation.id } });

  const handleDragEnd = (result) => {
    const { draggableId, source, destination } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    onMove(draggableId, destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-6">
        {STATUSES.map((status) => (
          <StatusColumn
            key={status.id}
            status={status}
            regulations={regulations.filter((regulation) => regulation.status === status.id)}
            onOpen={openRegulation}
          />
        ))}
      </div>
    </DragDropContext>
  );
}