// Desired functionality:
// - Report duplicate refs
// - Report unknown refs
// - Code completion for refs
// - "Go to declaration" for refs https://code.visualstudio.com/api/references/vscode-api#DeclarationProvider
// - "Find references" for refs https://code.visualstudio.com/api/references/vscode-api#ReferenceProvider

import { Range, DocumentUri } from "vscode-languageserver-textdocument";
import { TextDocument, WorkspaceFolder } from "vscode-languageserver";
import { URL } from "url";
import globby = require("globby");
import { readFile } from "fs";

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

  while ((m = pattern.exec(text))) {
    const start = textDocument.positionAt(m.index);
    const end = textDocument.positionAt(m.index + m[0].length);
    const name = m[1];
    declarations.set(name, {
      name,
      textDocument,
      range: {
        start,
        end,
      },
    });
    foundDeclarations.push(name);
  }
  declarationsByDocument.set(textDocument.uri, foundDeclarations);
}

export { addWorkspaceFolder, updateDocument, declarations };
