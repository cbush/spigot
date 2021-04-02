# Spigot

This VSCode extension adds support for Sphinx :ref: roles:

- autocomplete refs
- error reporting: duplicate labels and unknown labels
- find references
- go to declaration

This extension is based on https://code.visualstudio.com/api/language-extensions/language-server-extension-guide

## Structure

```
.
├── client // Language Client
│   ├── src
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Language Server
    └── src
        └── server.ts // Language Server entry point
        └── .... // additional implementation files
    └── test // Test directory
```

## Implementation

- As we only care about refs, syntax is parsed using regex... for now. Performance is a secondary goal to getting this working.
- A Project represents the open workspace and its entities.
- An Entity is a label declaration (`.. _some-ref:`) or a reference to a label (:ref:`some-ref`)
- The Entities class manages entities in a workspace.

## Running the Server

- `npm install`
- Open VSCode on this folder (`code .`)
- Press F5 to compile and debug.
- If you want to debug the server as well use the launch configuration `Client + Server`
- In the [Extension Development Host] instance of VSCode, open a Sphinx project.

## Running tests

- `npm run test`

## Running test coverage

- `npm run coverage`
