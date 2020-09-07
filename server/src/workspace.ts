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
import { Entity, Name } from "./Entity";
import { Reporter } from "./Reporter";
import { Project } from "./Project";
import { findEntityAtPosition } from "./findEntityAtPosition";

const project = new Project();

function setReporter(r: Reporter) {
  project.reporter = r;
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
        if (project.getDocument(uri)) {
          console.log(`Already have document for ${uri} (before read)`);
          return resolve(null);
        }
        readFile(fullPath, "utf8", (err, contents) => {
          if (err) {
            console.error(`Failed to read ${fullPath}: ${err}`);
            return reject(err);
          }
          if (project.getDocument(uri)) {
            console.log(`Already have document for ${uri} (after read)`);
            return resolve(null);
          }
          const document = TextDocument.create(
            uri,
            "restructuredtext",
            0,
            contents
          );

          project.addDocument(document);

          return resolve(document);
        });
      })
  );

  Promise.all(promises).then((documents) => {
    documents.forEach((document) => {
      if (!document) {
        return;
      }
      project.updateDocument(document);
    });
  });
}

function onDidChangeContentHandler(
  change: TextDocumentChangeEvent<TextDocument>
) {
  project.updateDocument(change.document);
}

function onCompletionHandler(
  _textDocumentPosition: TextDocumentPositionParams
): CompletionItem[] {
  return project.declarations.map((declaration) => ({
    label: declaration.label,
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

function onDeclarationHandler(params: DeclarationParams): Location | null {
  const entity = findEntityAtPosition(
    project,
    params.textDocument.uri,
    params.position
  );

  if (!entity) {
    return null;
  }

  const declaration = project.getDeclaration(entity.name);

  if (!declaration) {
    return null;
  }

  return declaration.location;
}

function onReferencesHandler(params: ReferenceParams): Location[] | null {
  const entity = findEntityAtPosition(
    project,
    params.textDocument.uri,
    params.position
  );

  if (!entity) {
    return null;
  }

  const refs = project.getReferences(entity.name);

  if (!refs) {
    return null;
  }

  return refs.map((ref) => ref.location);
}

function onDocumentLinksHandler(
  params: DocumentLinkParams
): DocumentLink[] | null {
  const documentEntities = project.getEntitiesInDocument(
    params.textDocument.uri
  );

  if (!documentEntities) {
    return null;
  }

  return documentEntities
    .filter(
      (entity) => entity.type !== "decl" && project.getDeclaration(entity.name)
    )
    .map((entity) => {
      const { location } = project.getDeclaration(entity.name)!;
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
