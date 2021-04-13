import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser } from "./Parser";

let parser = new Parser();

beforeEach(() => {
  parser = new Parser();
});

describe("findTargets", () => {
  it("finds no targets", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      `
There are no targets in this document.
.. is close, but not.
.. a _something:? forget it.
.. _also not a target:

.. code-block:: js
   :emphasize-lines: 1

   // Foo!

Heading
=======
Blah blah blah

Another Heading
---------------

Blah blah blah

`
    );

    const targets = parser.findTargets(document);
    expect(targets.length).toBe(0);
  });

  it("finds targets", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      `This document has one target:

.. _its-a-target:
`
    );

    const targets = parser.findTargets(document);
    expect(targets.length).toBe(1);
    expect(targets[0].location.uri).toBe("test");
    expect(targets[0].location.range.start.line).toBe(2);
    expect(targets[0].location.range.start.character).toBe(0);
    expect(document.getText(targets[0].location.range)).toBe(
      ".. _its-a-target:\n"
    );
    expect(targets[0].name).toBe("its-a-target");
    expect(targets[0].type).toBe("rst.target");
  });

  it("ignores commented-out targets", () => {
    const document = TextDocument.create(
      "test",
      "",
      0,
      `.. .. _commented-out:`
    );

    const targets = parser.findTargets(document);
    expect(targets.length).toBe(0);
  });
});
