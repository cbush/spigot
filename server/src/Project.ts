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
  const declarations = project._declarations;
  const entitiesByDocument = project._entitiesByDocument;
  const diagnostics: Diagnostic[] = [];
  const { uri } = document;
  findLabels(document).forEach((label) => {
    const existingDeclaration = declarations.get(label.name);
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
    if (!entitiesByDocument.has(uri)) {
      entitiesByDocument.set(uri, []);
    }
    entitiesByDocument.get(uri)!.push(label);
    declarations.set(label.name, label);
  });
  return diagnostics;
}

function populateReferences(
  project: Project,
  document: TextDocument
): Diagnostic[] {
  const declarations = project._declarations;
  const references = project._references;
  const entitiesByDocument = project._entitiesByDocument;
  const diagnostics: Diagnostic[] = [];
  const { uri } = document;
  findReferences(document).forEach((reference) => {
    const label = reference.name;
    if (!declarations.has(label)) {
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

    if (!entitiesByDocument.has(uri)) {
      entitiesByDocument.set(uri, []);
    }
    entitiesByDocument.get(uri)!.push(reference);

    if (!references.get(label)) {
      references.set(label, []);
    }
    references.get(label)!.push(reference);
  });
  return diagnostics;
}

function deleteEntitiesForDocument(
  project: Project,
  uri: DocumentUri
): boolean {
  const entitiesByDocument = project._entitiesByDocument;
  const declarations = project._declarations;
  const references = project._references;

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

  updateDocument = (document: TextDocument) => {
    const { uri } = document;

    this._documents.set(uri, document);

    deleteEntitiesForDocument(this, uri);
    const labelDiagnostics = populateLabels(this, document);
    const referenceDiagnostics = populateReferences(this, document);
    this.reporter?.sendDiagnostics({
      uri,
      diagnostics: [...labelDiagnostics, ...referenceDiagnostics],
    });
  };

  removeDocument = (uri: DocumentUri): boolean => {
    deleteEntitiesForDocument(this, uri);
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

  _declarations = new Map<Name, Entity>();
  _references = new Map<Name, Entity[]>();
  _entitiesByDocument = new Map<DocumentUri, Entity[]>();
  _documents = new Map<DocumentUri, TextDocument>();
}
