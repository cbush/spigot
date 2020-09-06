// Desired functionality:
// - Report duplicate refs
// - Report unknown refs
// - Code completion for refs
// - "Go to declaration" for refs https://code.visualstudio.com/api/references/vscode-api#DeclarationProvider
// - "Find references" for refs https://code.visualstudio.com/api/references/vscode-api#ReferenceProvider

import { Range, DocumentUri } from "vscode-languageserver-textdocument";
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
} from "vscode-languageserver";
import { URL } from "url";
import globby = require("globby");
import { readFile } from "fs";
import { connection } from "./server";

type Name = string;
type EntityType = "ref" | "decl";

interface Entity {
  type: EntityType;
  name: Name;
  location: Location;
}

const declarations = new Map<Name, Entity>();
const entitiesByDocument = new Map<DocumentUri, Entity[]>();
const documents = new Map<DocumentUri, TextDocument>();

function updateDocument(document: TextDocument) {
  const { uri } = document;

  documents.set(uri, document);

  deleteEntitiesForDocument(uri);
  const declarations = findLabels(document);
  const references = findReferences(document);
  entitiesByDocument.set(uri, [...declarations, ...references]);
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

  paths.forEach((path) => {
    const fullPath = `${cwd}/${path}`;
    const uri = `file://${fullPath}`;
    if (documents.has(uri)) {
      console.log(`Already have document for ${uri} (before read)`);
      return;
    }
    readFile(fullPath, "utf8", (err, contents) => {
      if (err) {
        console.error(`Failed to read ${fullPath}: ${err}`);
        return;
      }
      if (documents.has(uri)) {
        console.log(`Already have document for ${uri} (after read)`);
        return;
      }
      updateDocument(TextDocument.create(uri, "restructuredtext", 0, contents));
    });
  });
}

function isCommentedOut(textDocument: TextDocument, range: Range): boolean {
  if (range.start.character === 0) {
    return false;
  }

  // Check the line so far up to the label directive
  const lineUpToRange = textDocument.getText({
    start: Position.create(range.start.line, 0),
    end: range.start,
  });

  // Quick and dirty rST comment check. A proper parser can detect block comments, etc.
  return /\.\.\s/.test(lineUpToRange);
}

function deleteEntitiesForDocument(uri: DocumentUri) {
  // Delete all existing entities previously found in this document
  // in case declarations were removed entirely.
  const previousEntities = entitiesByDocument.get(uri) ?? [];
  previousEntities.forEach((entity) => {
    if (entity.type === "decl") {
      declarations.delete(entity.name);
    }
  });
  entitiesByDocument.delete(uri);
}

function findLabels(textDocument: TextDocument) {
  let text = textDocument.getText();
  let pattern = /.. _([A-z-]+):/g;
  let m: RegExpExecArray | null;

  const { uri } = textDocument;

  const found: Entity[] = [];
  const diagnostics: Diagnostic[] = [];

  while ((m = pattern.exec(text))) {
    const start = textDocument.positionAt(m.index);
    const end = textDocument.positionAt(m.index + m[0].length);

    // Ignore commented lines
    if (isCommentedOut(textDocument, { start, end })) {
      continue;
    }

    const label = m[1];
    if (declarations.has(label)) {
      let diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: {
          start: textDocument.positionAt(m.index),
          end: textDocument.positionAt(m.index + m[0].length),
        },
        message: `Duplicate label: ${label}.`,
        source: "snoot",
      };
      diagnostics.push(diagnostic);
      continue;
    }

    const entity: Entity = {
      name: label,
      type: "decl",
      location: {
        uri,
        range: {
          start,
          end,
        },
      },
    };
    declarations.set(label, entity);
    found.push(entity);
  }
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  return found;
}

function findReferences(textDocument: TextDocument) {
  const { uri } = textDocument;

  const text = textDocument.getText();
  const found: Entity[] = [];
  const diagnostics: Diagnostic[] = [];

  // :ref:`some text <label>`
  const labelAndTextPattern = /:ref:`[^<>]*?<([^`>]*?)>`/gms;

  // :ref:`label`
  const labelPattern = /:ref:`([^<>`]*?)`/gms;

  let m: RegExpExecArray | null;

  while ((m = labelAndTextPattern.exec(text) || labelPattern.exec(text))) {
    const range = {
      start: textDocument.positionAt(m.index),
      end: textDocument.positionAt(m.index + m[0].length),
    };

    // Ignore commented lines
    if (isCommentedOut(textDocument, range)) {
      continue;
    }

    const label = m[1];

    if (!declarations.has(label)) {
      // Unknown label
      let diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range,
        message: `Unknown label: ${label}.`,
        source: "snoot",
      };
      diagnostics.push(diagnostic);
      continue;
    }

    const entity: Entity = {
      name: label,
      type: "ref",
      location: {
        uri,
        range,
      },
    };

    found.push(entity);
  }

  // Send the computed diagnostics to the client.
  connection.sendDiagnostics({ uri, diagnostics });

  return found;
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

function onDeclarationHandler(params: DeclarationParams): Location {
  return {
    uri: "file:///Users/bush/docs/docs-realm/source/ios.txt",
    range: {
      start: Position.create(0, 0),
      end: Position.create(0, 5),
    },
  };
}

function onReferencesHandler(params: ReferenceParams): Location[] | null {
  return [
    {
      uri: "file:///Users/bush/docs/docs-realm/source/ios.txt",
      range: {
        start: Position.create(0, 0),
        end: Position.create(0, 5),
      },
    },
  ];
}

export {
  addWorkspaceFolder,
  onCompletionHandler,
  onCompletionResolveHandler,
  onDeclarationHandler,
  onDidChangeContentHandler,
  onReferencesHandler,
};
