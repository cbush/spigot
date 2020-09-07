import { Location } from "vscode-languageserver";

export type Name = string;
export type EntityType = "ref" | "decl";

export interface Entity {
  type: EntityType;
  name: Name;
  location: Location;
}
