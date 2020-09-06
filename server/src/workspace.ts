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
} from "vscode-languageserver";
import { URL } from "url";
import globby = require("globby");
import { readFile } from "fs";
import { connection } from "./server";

type Name = string;
interface Declaration {
  name: Name;
  textDocument: TextDocument;
  range: Range;
}

const declarations = new Map<Name, Declaration>();
const declarationsByDocument = new Map<DocumentUri, Name[]>();
const documents = new Map<DocumentUri, TextDocument>();

function updateDocument(document: TextDocument) {
  documents.set(document.uri, document);
  findLabels(document);
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
      name: label,
      textDocument,
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

export { addWorkspaceFolder, updateDocument, declarations };
