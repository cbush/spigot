import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser } from "./Parser";

describe("findSections", () => {
  it("finds sections", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test",
      "",
      0,
      `This document has one section

==============
It's a Section
==============

This is the section text.
`
    );

    const sections = parser.findSections(document);
    expect(sections.length).toBe(1);
    const section = sections[0];
    expect(section.depth).toBe(1);
    expect(section.name).toBe("It's a Section");
    expect(section.text).toBe("This is the section text.\n");
  });

  it("finds subsections", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test",
      "",
      0,
      `This document has one section with a subsection

==============
It's a Section
==============

This is the section text.

Subsection
----------

This is the subsection text.

.. code-block::
   
   Directives will be included.


.. 
   Ignore this comment

And here's some more text.

.. _another-subsection:

Another Subsection
------------------

This is the other subsection text.

`
    );

    const sections = parser.findSections(document);
    expect(sections.length).toBe(1);
    const section = sections[0];
    expect(section.depth).toBe(1);
    expect(section.name).toBe("It's a Section");
    expect(section.text).toBe("This is the section text.\n");
    const { subsections } = section;
    expect(subsections.length).toBe(2);
    expect(subsections[0].depth).toBe(2);
    expect(subsections[0].name).toBe("Subsection");
    expect(subsections[0].text).toBe(`This is the subsection text.
Directives will be included.And here's some more text.
`);
    expect(subsections[1].depth).toBe(2);
    expect(subsections[1].name).toBe("Another Subsection");
    expect(subsections[1].subsections.length).toBe(0);
    expect(subsections[1].text).toBe("This is the other subsection text.\n");
    expect(subsections[0].refs).toStrictEqual([]);
  });

  it("finds refs in the section", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test",
      "",
      0,
      `
==============
It's a Section
==============

Here's a :ref:\`link <to-something>\`.

Subsection
----------

Here's another :ref:\`link <to-something-else>\`.
`
    );

    const sections = parser.findSections(document);
    expect(sections.length).toBe(1);
    const section = sections[0];
    expect(section.depth).toBe(1);
    expect(section.name).toBe("It's a Section");
    expect(section.text).toBe("Here's a link <to-something>.\n");
    expect(section.refs.length).toBe(1);
    expect(section.refs[0].name).toBe("to-something");
    const { subsections } = section;
    expect(subsections.length).toBe(1);
    expect(subsections[0].depth).toBe(2);
    expect(subsections[0].name).toBe("Subsection");
    expect(subsections[0].refs[0].name).toBe("to-something-else");
  });
});
