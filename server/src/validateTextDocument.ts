import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { clientCapabilities, connection } from "./server";
import { declarations } from "./workspace";
export async function validateTextDocument(
  textDocument: TextDocument
): Promise<void> {
  let text = textDocument.getText();
  let pattern = /:ref:`.*?<([A-z0-9-_]+)>`/gms;
  let m: RegExpExecArray | null;

  let diagnostics: Diagnostic[] = [];
  while ((m = pattern.exec(text))) {
    const label = m[1];
    if (declarations.has(label)) {
      continue;
    }

    let diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: textDocument.positionAt(m.index),
        end: textDocument.positionAt(m.index + m[0].length),
      },
      message: `Unknown label: ${label}.`,
      source: "ex",
    };
    diagnostics.push(diagnostic);
  }

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}
