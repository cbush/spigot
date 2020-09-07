import {
  DocumentUri,
  TextDocument,
  Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver";
import { Entity, Name } from "./Entity";
import { Reporter } from "./Reporter";
import { findLabels } from "./findLabels";
import deepEqual = require("deep-equal");
import { findReferences } from "./findReferences";

function populateLabels(
  project: Project,
  document: TextDocument
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { uri } = document;
  findLabels(document).forEach((label) => {
    const existingDeclaration = project.getDeclaration(label.name);
    if (
      existingDeclaration &&
      !deepEqual(existingDeclaration.location, label.location)
    ) {
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        message: `Duplicate label: ${label.name}`,
        source: "snoot",
        range: label.location.range,
      };
      diagnostics.push(diagnostic);
      return;
    }
    project.addEntity(label);
  });
  return diagnostics;
}

function populateReferences(
  project: Project,
  document: TextDocument
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { uri } = document;
  findReferences(document).forEach((reference) => {
    const label = reference.name;
    if (!project.getDeclaration(label)) {
      // Unknown label
      let diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: reference.location.range,
        message: `Unknown label: ${label}.`,
        source: "snoot",
      };
      diagnostics.push(diagnostic);
      return;
    }
    project.addEntity(reference);
  });
  return diagnostics;
}

// A project represents the declarations and references in an open workspace.
export class Project {
  reporter: Reporter | null = null;

  addDocument = (document: TextDocument) => {
    this._documents.set(document.uri, document);
    populateLabels(this, document);
  };

  getDocument = (uri: DocumentUri): TextDocument | undefined => {
    return this._documents.get(uri);
  };

  get documentCount(): number {
    return this._documents.size;
  }

  get declarations(): Entity[] {
    return Array.from(this._declarations, ([_k, entity]) => entity);
  }

  updateDocument = (document: TextDocument) => {
    const { uri } = document;

    this._documents.set(uri, document);

    this.deleteEntitiesForDocument(uri);
    const labelDiagnostics = populateLabels(this, document);
    const referenceDiagnostics = populateReferences(this, document);
    this.reporter?.sendDiagnostics({
      uri,
      diagnostics: [...labelDiagnostics, ...referenceDiagnostics],
    });
  };

  removeDocument = (uri: DocumentUri): boolean => {
    this.deleteEntitiesForDocument(uri);
    return this._documents.delete(uri);
  };

  getEntitiesInDocument = (uri: DocumentUri): Entity[] | undefined => {
    return this._entitiesByDocument.get(uri);
  };

  getDeclaration = (name: Name): Entity | undefined => {
    return this._declarations.get(name);
  };

  getReferences = (name: Name): Entity[] | undefined => {
    return this._references.get(name);
  };

  addEntity = (entity: Entity) => {
    const { uri } = entity.location;
    if (!this._entitiesByDocument.has(uri)) {
      this._entitiesByDocument.set(uri, []);
    }
    this._entitiesByDocument.get(uri)!.push(entity);

    const { name } = entity;
    if (entity.type === "decl") {
      this._declarations.set(name, entity);
    } else {
      if (!this._references.get(name)) {
        this._references.set(name, []);
      }
      this._references.get(name)!.push(entity);
    }
  };

  private deleteEntitiesForDocument = (uri: DocumentUri): boolean => {
    const entitiesByDocument = this._entitiesByDocument;
    const declarations = this._declarations;
    const references = this._references;

    // Delete all existing entities previously found in this document
    // in case declarations were removed entirely.
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
        references.delete(entity.name);
        return;
      }
      references.set(entity.name, refsInOtherFiles);
    });
    return entitiesByDocument.delete(uri);
  };

  private _declarations = new Map<Name, Entity>();
  private _references = new Map<Name, Entity[]>();
  private _entitiesByDocument = new Map<DocumentUri, Entity[]>();
  private _documents = new Map<DocumentUri, TextDocument>();
}
