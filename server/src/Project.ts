import {
  DocumentUri,
  TextDocument,
  DeclarationParams,
  Location,
  ReferenceParams,
  DocumentLinkParams,
  DocumentLink,
  TextDocumentPositionParams,
  CompletionItem,
  Range,
  CompletionItemKind,
} from "vscode-languageserver";
import { Reporter } from "./Reporter";
import { Entities } from "./Entities";
import { findEntityAtPosition } from "./findEntityAtPosition";

// A project represents the documents and entities in an open
// workspace.
export class Project {
  reporter: Reporter | null = null;

  get entities(): Entities {
    return this._entities;
  }

  addDocument = (document: TextDocument) => {
    this._documents.set(document.uri, document);
    this._entities.addDocumentLabels(document);
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

    this._entities.deleteEntitiesForDocument(uri);
    const labelDiagnostics = this._entities.addDocumentLabels(document);
    const referenceDiagnostics = this._entities.addDocumentReferences(document);
    this.reporter?.sendDiagnostics({
      uri,
      diagnostics: [...labelDiagnostics, ...referenceDiagnostics],
    });
  };

  removeDocument = (uri: DocumentUri): boolean => {
    this._entities.deleteEntitiesForDocument(uri);
    return this._documents.delete(uri);
  };

  getDeclaration = (params: DeclarationParams): Location | null => {
    const entity = findEntityAtPosition(
      this._entities,
      this.getDocument(params.textDocument.uri),
      params.position
    );

    if (!entity) {
      return null;
    }

    const declaration = this._entities.getDeclaration(entity.name);

    if (!declaration) {
      return null;
    }

    return declaration.location;
  };

  getReferences = (params: ReferenceParams): Location[] | null => {
    const entity = findEntityAtPosition(
      this._entities,
      this.getDocument(params.textDocument.uri),
      params.position
    );

    if (!entity) {
      return null;
    }

    const refs = this._entities.getReferences(entity.name);

    if (!refs) {
      return null;
    }

    return refs.map((ref) => ref.location);
  };

  getCompletions = (
    textDocumentPosition: TextDocumentPositionParams
  ): CompletionItem[] | null => {
    const document = this.getDocument(textDocumentPosition.textDocument.uri);
    if (!document) {
      return null;
    }

    const { position } = textDocumentPosition;

    // Check if you are in a :ref:
    const line = document.getText(
      Range.create(
        {
          line: position.line - 1,
          character: 0,
        },
        position
      )
    );

    if (!/:ref:`[^`]*?/gms.test(line)) {
      return null;
    }

    return this._entities.declarations.map((declaration) => ({
      label: declaration.name,
      kind: CompletionItemKind.Reference,
      data: declaration,
    }));
  };

  getDocumentLinks = (params: DocumentLinkParams): DocumentLink[] | null => {
    const documentEntities = this._entities.getEntitiesInDocument(
      params.textDocument.uri
    );

    if (!documentEntities) {
      return null;
    }

    return documentEntities
      .filter(
        (entity) =>
          entity.type !== "decl" && this._entities.getDeclaration(entity.name)
      )
      .map((entity) => {
        const { location } = this._entities.getDeclaration(entity.name)!;
        return DocumentLink.create(
          entity.location.range,
          `${location.uri}#${location.range.start.line + 1}:${
            location.range.start.character
          }`
        );
      });
  };

  private _documents = new Map<DocumentUri, TextDocument>();
  private _entities = new Entities();
}
