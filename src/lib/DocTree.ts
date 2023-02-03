import { Node } from "kbts";

export type DocTree = DocEntry | readonly DocTree[] | null;

export interface DocEntry {
  content: Node;
  details: DocTree;
}
