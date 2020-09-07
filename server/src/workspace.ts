// Desired functionality:
// - Report duplicate refs
// - Report unknown refs
// - Code completion for refs
// - "Go to declaration" for refs https://code.visualstudio.com/api/references/vscode-api#DeclarationProvider
// - "Find references" for refs https://code.visualstudio.com/api/references/vscode-api#ReferenceProvider

import { DocumentUri } from "vscode-languageserver-textdocument";
import {
  TextDocument,
  WorkspaceFolder,
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Location,
  DeclarationParams,
  ReferenceParams,
  TextDocumentPositionParams,
  CompletionItem,
  CompletionItemKind,
  TextDocumentChangeEvent,
  DocumentLinkParams,
  DocumentLink,
} from "vscode-languageserver";
import { URL } from "url";
import globby = require("globby");
import { readFile } from "fs";
import { findLabels } from "./findLabels";
import { findReferences } from "./findReferences";
import { Entity, Name } from "./Entity";
import { Reporter } from "./Reporter";

let reporter: Reporter;

function setReporter(r: Reporter) {
  reporter = r;
}

const declarations = new Map<Name, Entity>();
const references = new Map<Name, Entity[]>();
const entitiesByDocument = new Map<DocumentUri, Entity[]>();
const documents = new Map<DocumentUri, TextDocument>();

function updateDocument(document: TextDocument) {
  const { uri } = document;

  documents.set(uri, document);

  deleteEntitiesForDocument(uri);

  const labels = findLabels(document);

  const diagnostics: Diagnostic[] = [];
  labels.forEach((label) => {
    if (declarations.has(label.name)) {
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        message: `Duplicate label: ${label}`,
        source: "snoot",
        range: label.location.range,
      };
      diagnostics.push(diagnostic);
      return;
    }

    declarations.set(label.name, label);
  });

  const newReferences = findReferences(document);

  newReferences.forEach((reference) => {
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

    if (!references.get(label)) {
      references.set(label, []);
    }
    references.get(label)!.push(reference);
  });

  entitiesByDocument.set(uri, [...labels, ...newReferences]);

  reporter.sendDiagnostics({ uri, diagnostics });
}

async function addWorkspaceFolder(folder: WorkspaceFolder) {
  const cwd = new URL(folder.uri).pathname;

  // TODO: allow configuration
  const sourceDirectory = "source/";

  const paths = await globby(sourceDirectory, {
    onlyFiles: true,
    expandDirectories: { extensions: ["txt", "yaml", "rst"] },
    cwd,
    followSymbolicLinks: false,
    ignore: ["node_modules/", "build/"],
  });

  const promises = paths.map(
    (path): Promise<TextDocument | null> =>
      new Promise((resolve, reject) => {
        const fullPath = `${cwd}/${path}`;
        const uri = `file://${fullPath}`;
        if (documents.has(uri)) {
          console.log(`Already have document for ${uri} (before read)`);
          return resolve(null);
        }
        readFile(fullPath, "utf8", (err, contents) => {
          if (err) {
            console.error(`Failed to read ${fullPath}: ${err}`);
            return reject(err);
          }
          if (documents.has(uri)) {
            console.log(`Already have document for ${uri} (after read)`);
            return resolve(null);
          }
          const document = TextDocument.create(
            uri,
            "restructuredtext",
            0,
            contents
          );

          // Initial load of labels to avoid undefined references later
          findLabels(document);

          return resolve(document);
        });
      })
  );

  Promise.all(promises).then((documents) => {
    documents.forEach((document) => {
      if (!document) {
        return;
      }
      updateDocument(document);
    });
  });
}

function deleteEntitiesForDocument(uri: DocumentUri) {
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
    references.set(uri, refsInOtherFiles);
  });
  entitiesByDocument.delete(uri);
}

function onDidChangeContentHandler(
  change: TextDocumentChangeEvent<TextDocument>
) {
  updateDocument(change.document);
}

function onCompletionHandler(
  _textDocumentPosition: TextDocumentPositionParams
): CompletionItem[] {
  return Array.from(declarations, ([label, declaration]) => ({
    label,
    kind: CompletionItemKind.Value,
    data: declaration,
  }));
}

function onCompletionResolveHandler(item: CompletionItem): CompletionItem {
  return {
    ...item,
    detail: "Some detail",
    documentation: "Some documentation",
  };
}

function findEntityAtPosition(
  uri: DocumentUri,
  position: Position
): Entity | null {
  const document = documents.get(uri);
  if (!document) {
    return null;
  }

  const entitiesInDocument = entitiesByDocument.get(uri);
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

function onDeclarationHandler(params: DeclarationParams): Location | null {
  const entity = findEntityAtPosition(params.textDocument.uri, params.position);

  if (!entity) {
    return null;
  }

  const declaration = declarations.get(entity.name);

  if (!declaration) {
    return null;
  }

  return declaration.location;
}

function onReferencesHandler(params: ReferenceParams): Location[] | null {
  const entity = findEntityAtPosition(params.textDocument.uri, params.position);

  if (!entity) {
    return null;
  }

  const refs = references.get(entity.name);

  if (!refs) {
    return null;
  }

  return refs.map((ref) => ref.location);
}

function onDocumentLinksHandler(
  params: DocumentLinkParams
): DocumentLink[] | null {
  const documentEntities = entitiesByDocument.get(params.textDocument.uri);

  if (!documentEntities) {
    return null;
  }

  return documentEntities
    .filter((entity) => entity.type !== "decl" && declarations.has(entity.name))
    .map((entity) => {
      const { location } = declarations.get(entity.name)!;
      return DocumentLink.create(
        entity.location.range,
        `${location.uri}#${location.range.start.line + 1}:${
          location.range.start.character
        }`
      );
    });
}

export {
  addWorkspaceFolder,
  onCompletionHandler,
  onCompletionResolveHandler,
  onDeclarationHandler,
  onDidChangeContentHandler,
  onDocumentLinksHandler,
  onReferencesHandler,
  setReporter,
};
