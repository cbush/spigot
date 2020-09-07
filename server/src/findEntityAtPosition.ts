import { DocumentUri, Position } from "vscode-languageserver";
import { Entity } from "./Entity";
import { Project } from "./Project";

// Finds an entity, if any, at the given position of the given document
export function findEntityAtPosition(
  project: Project,
  uri: DocumentUri,
  position: Position
): Entity | null {
  const document = project.getDocument(uri);
  if (!document) {
    return null;
  }

  const entitiesInDocument = project.getEntitiesInDocument(uri);
  if (!entitiesInDocument) {
    return null;
  }

  const offset = document.offsetAt(position);

  // Find an entity that is near the cursor
  return (
    entitiesInDocument.find(({ location }) => {
      const { range } = location;
      const start = document.offsetAt(range.start);
      const end = document.offsetAt(range.end);
      return start <= offset && offset < end;
    }) ?? null
  );
}
