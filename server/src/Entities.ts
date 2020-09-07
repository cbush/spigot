import {
  DocumentUri,
  TextDocument,
  Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver";
import deepEqual = require("deep-equal");
import { Entity, Name } from "./Entity";
import { findEntities } from "./findEntities";
import { findLabels } from "./findLabels";
import { findReferences } from "./findReferences";

// Entities represents the collection of entities in documents.
export class Entities {
  get declarations(): Entity[] {
    return Array.from(this._declarations, ([_k, entity]) => entity);
  }

  getEntitiesInDocument = (uri: DocumentUri): Entity[] | undefined => {
    return this._entitiesByDocument.get(uri);
  };

  getDeclaration = (name: Name): Entity | undefined => {
    return this._declarations.get(name);
  };

  getReferences = (name: Name): Entity[] | undefined => {
    return this._references.get(name);
  };

  // Scans the given document for labels, adds them to the entities collection,
  // and returns any diagnostics.
  addDocumentLabels = (document: TextDocument): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    findLabels(document).forEach((label) => {
      const diagnostic = this.add(label);
      if (diagnostic) {
        diagnostics.push(diagnostic);
      }
    });
    return diagnostics;
  };

  // Scans the given document for references, adds them to the entities
  // collection, and returns any diagnostics.
  addDocumentReferences = (document: TextDocument): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    findReferences(document).forEach((reference) => {
      const diagnostic = this.add(reference);
      if (diagnostic) {
        diagnostics.push(diagnostic);
      }
    });
    return diagnostics;
  };

  // Delete all existing entities previously found in this document
  // in case declarations were removed entirely.
  deleteEntitiesForDocument = (uri: DocumentUri): boolean => {
    const entitiesByDocument = this._entitiesByDocument;
    const declarations = this._declarations;
    const references = this._references;

    const previousEntities = entitiesByDocument.get(uri) ?? [];
    previousEntities.forEach((entity) => {
      if (entity.type === "decl") {
        declarations.delete(entity.name);
        return;
      }

      const refsInOtherFiles = references
        .get(entity.name)
        ?.filter((ref) => ref.location.uri !== uri);
      if (!refsInOtherFiles) {
        return;
      }
      if (refsInOtherFiles.length === 0) {
        // Last reference in the entities collection.
        // Remove the entry entirely.
        references.delete(entity.name);
        return;
      }

      // Replace the references array without this file's references.
      references.set(entity.name, refsInOtherFiles);
    });
    return entitiesByDocument.delete(uri);
  };

  // Adds the entity to the collection or reports an error.
  private add = (entity: Entity): Diagnostic | undefined => {
    const { location, name, type } = entity;
    if (type === "decl") {
      const existingDeclaration = this.getDeclaration(name);
      if (
        existingDeclaration &&
        !deepEqual(existingDeclaration.location, location)
      ) {
        // Duplicate label
        return {
          severity: DiagnosticSeverity.Error,
          message: `Duplicate label: ${name}`,
          source: "snoot",
          range: location.range,
        };
      }
      this._declarations.set(name, entity);
    } else {
      if (!this.getDeclaration(name)) {
        // Unknown label
        return {
          severity: DiagnosticSeverity.Error,
          range: entity.location.range,
          message: `Unknown label: ${name}.`,
          source: "snoot",
        };
      }
      if (!this._references.get(name)) {
        this._references.set(name, []);
      }
      this._references.get(name)!.push(entity);
    }

    const { uri } = entity.location;
    if (!this._entitiesByDocument.has(uri)) {
      this._entitiesByDocument.set(uri, []);
    }
    this._entitiesByDocument.get(uri)!.push(entity);
  };

  private _declarations = new Map<Name, Entity>();
  private _references = new Map<Name, Entity[]>();
  private _entitiesByDocument = new Map<DocumentUri, Entity[]>();
}
