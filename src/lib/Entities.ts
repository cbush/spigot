import { strict as assert } from "assert";
import { DocumentUri, TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import deepEqual from "deep-equal";
import { Entity, Name, SectionEntity } from "./Entity";
import { Parser } from "./Parser";

// Entities represents the collection of entities in documents.
export class Entities {
  get declarations(): Entity[] {
    return Array.from(this._declarations, ([, entity]) => entity);
  }

  get size(): number {
    return this._declarations.size + this._references.size;
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

  // Scans the given document for targets, adds them to the entities collection,
  // and returns any diagnostics.
  addDocumentTargets = (document: TextDocument): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    this._parser.findTargets(document).forEach((target) => {
      const diagnostic = this.add(target);
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
    this._parser.findReferences(document).forEach((reference) => {
      const diagnostic = this.add(reference);
      if (diagnostic) {
        diagnostics.push(diagnostic);
      }
    });
    return diagnostics;
  };

  /**
    Scans the given document for sections and returns any diagnostics.
   */
  addDocumentSections = (document: TextDocument): Diagnostic[] => {
    const getDiagnostics = (section: SectionEntity) => {
      const diagnostics: Diagnostic[] = [];
      if (section.title === undefined) {
        diagnostics.push({
          message: "Section must have a title",
          range: section.location.range,
        });
      } else if (section.preSectionTargets.length === 0) {
        const { title } = section;
        // Can it really be a section without a title?
        assert(title !== undefined);
        /*
        // This would get annoying...
        diagnostics.push({
          message: "Section should have at least one explicit target",
          range: title.location.range,
        });
        */
      }
      diagnostics.push(...section.subsections.map(getDiagnostics).flat());
      return diagnostics;
    };
    const sections = this._parser.findSections(document);
    return sections.map(getDiagnostics).flat();
  };

  // Delete all existing entities previously found in this document
  // in case declarations were removed entirely.
  onDocumentRemoved = (uri: DocumentUri): boolean => {
    const previousEntities = this._entitiesByDocument.get(uri) ?? [];
    previousEntities.forEach(this.remove);
    return this._entitiesByDocument.delete(uri);
  };

  // Adds the entity to the collection or reports an error.
  add = (entity: Entity): Diagnostic | undefined => {
    const { location, name, type } = entity;
    if (type === "rst.target") {
      const existingDeclaration = this.getDeclaration(name);
      if (
        existingDeclaration &&
        !deepEqual(existingDeclaration.location, location)
      ) {
        // Duplicate target
        return {
          severity: DiagnosticSeverity.Error,
          message: `Duplicate target: ${name}`,
          source: "spigot",
          range: location.range,
          relatedInformation: [
            {
              location: existingDeclaration.location,
              message: "First declared here",
            },
          ],
        };
      }
      this._declarations.set(name, entity);
    } else if (type === "rst.role.ref") {
      if (!this.getDeclaration(name)) {
        // Unknown target
        return {
          severity: DiagnosticSeverity.Error,
          range: entity.location.range,
          message: `Unknown target: ${name}`,
          source: "spigot",
        };
      }
      if (!this._references.get(name)) {
        this._references.set(name, []);
      }
      this._references.get(name)?.push(entity);
    }

    const { uri } = entity.location;
    if (!this._entitiesByDocument.has(uri)) {
      this._entitiesByDocument.set(uri, []);
    }
    this._entitiesByDocument.get(uri)?.push(entity);
  };

  remove = (entity: Entity): boolean => {
    if (entity.type === "rst.target") {
      return this._declarations.delete(entity.name);
    }

    const { uri } = entity.location;

    const refsInOtherFiles = this._references
      .get(entity.name)
      ?.filter((ref) => ref.location.uri !== uri);

    if (!refsInOtherFiles) {
      return false;
    }

    if (refsInOtherFiles.length === 0) {
      // Last reference in the entities collection.
      // Remove the entry entirely.
      this._references.delete(entity.name);
      return true;
    }

    // Replace the references array without this file's references.
    this._references.set(entity.name, refsInOtherFiles);
    return true;
  };

  private _parser = new Parser();
  private _declarations = new Map<Name, Entity>();
  private _references = new Map<Name, Entity[]>();
  private _entitiesByDocument = new Map<DocumentUri, Entity[]>();
}
