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

const declarations = new Map<Name, Location>();
const declarationsByDocument = new Map<DocumentUri, Name[]>();
const references = new Map<Name, Location[]>();
const referencesByDocument = new Map<DocumentUri, Set<Name>>();
const documents = new Map<DocumentUri, TextDocument>();

function updateDocument(document: TextDocument) {
  documents.set(document.uri, document);
  findLabels(document);
  findReferences(document);
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

function findLabels(textDocument: TextDocument) {
  let text = textDocument.getText();
  let pattern = /.. _([A-z-]+):/g;
  let m: RegExpExecArray | null;

  // Delete all existing declarations previously found in this document
  // in case declarations were removed entirely.
  const previousDeclarations =
    declarationsByDocument.get(textDocument.uri) ?? [];

  previousDeclarations.forEach((declaration) => {
    declarations.delete(declaration);
  });
  declarationsByDocument.delete(textDocument.uri);

  const foundDeclarations: Name[] = [];
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

    declarations.set(label, {
      uri: textDocument.uri,
      range: {
        start,
        end,
      },
    });
    foundDeclarations.push(label);
  }
  declarationsByDocument.set(textDocument.uri, foundDeclarations);

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function findReferences(textDocument: TextDocument) {
  const { uri } = textDocument;

  // Delete all existing references previously found in this document
  // in case references were removed entirely.
  const previousReferences = referencesByDocument.get(uri);
  if (previousReferences) {
    // Strip this document's references from the main references list
    previousReferences.forEach((label) => {
      const locations = references
        .get(label)!
        .filter((location) => location.uri !== uri);
      references.set(label, locations);
    });
    referencesByDocument.delete(uri);
  }

  const text = textDocument.getText();
  const foundReferences: Name[] = [];
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

    if (!references.has(label)) {
      references.set(label, []);
    }

    references.get(label)!.push({
      uri,
      range,
    });

    foundReferences.push(label);
  }

  referencesByDocument.set(uri, new Set(foundReferences));

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri, diagnostics });
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

function onReferencesHandler(params: ReferenceParams): Location[] {
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
