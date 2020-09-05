import * as fs from "fs";
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  WorkspaceFolder,
} from "vscode-languageserver";

import { TextDocument } from "vscode-languageserver-textdocument";
import { URL } from "url";
import { onCompletionHandler } from "./onCompletionHandler";
import { onCompletionResolveHandler } from "./onCompletionResolveHandler";
import { onDidChangeContentHandler } from "./onDidChangeContentHandler";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
export const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// The workspace folder this server is operating on
let workspaceFolders: WorkspaceFolder[] = [];

export let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
  workspaceFolders = params.workspaceFolders || [];

  const { capabilities } = params;

  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
    },
  };
});

connection.onInitialized(() => {
  const url = new URL(workspaceFolders[0].uri);
  console.log("Readding dir", url.pathname);

  fs.readdir(url.pathname, (err, files) => {
    files.forEach((file) => {
      console.log(file);
    });
  });
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(onDidChangeContentHandler);

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  connection.console.log("We received an file change event");
});

// This handler provides the initial list of the completion items.
connection.onCompletion(onCompletionHandler);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(onCompletionResolveHandler);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
